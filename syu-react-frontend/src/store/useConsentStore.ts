// src/store/useConsentStore.ts
// 약관·개인정보 처리방침 동의 기록 (users/{uid}.termsConsent).
//
// 왜 별도 스토어인가 —
//   useAuthStore는 "문서가 아니라 세션"을 다루고, 의도적으로 IS_MOCK_MODE를
//   따르지 않는다(항상 실 Firebase Auth). 동의 기록은 반대로 users/{uid}
//   **문서**에 붙는 값이라 다른 문서 스토어들과 같은 규약(merge:true +
//   Mock 시 localStorage)을 따라야 한다. useAuthStore에 넣으면 두 규약이
//   함께 깨지므로, useCharacterStore와 같은 계열의 문서 스토어로 분리했다.
//
//   useCharacterStore에 얹지 않은 이유는 수명이 다르기 때문이다. 캐릭터는
//   "데이터 초기화"로 지워지지만(deleteCharacter), 동의 기록은 계정이 남아
//   있는 한 지워지면 안 된다 — 지워지면 법적 근거가 사라진다.

import { create } from 'zustand';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../api/firebase';
import { IS_MOCK_MODE } from '../api/env';
import { COLLECTIONS, MARKETING_CONSENT_FIELDS, USER_FIELDS } from '../api/firestoreKeys';
import { COPY } from '../constants/copy';
import { getLegalVersion } from './useSettingsStore';

/**
 * users/{uid}.termsConsent의 형태.
 *
 * 시각 필드의 타입이 unknown인 것은 실 모드(Firestore Timestamp)와 Mock
 * 모드(ISO 문자열)의 표현이 다르기 때문이다. 앱은 이 값을 화면에 쓰지 않고
 * "있다/없다"만 판정하므로 구체 타입을 강제하지 않는다.
 */
export interface TermsConsentRecord {
  /** 이용약관 동의 시각 (필수) */
  termsAgreedAt: unknown;
  /** 개인정보 처리방침 동의 시각 (필수) */
  privacyAgreedAt: unknown;
  /** 마케팅 정보 수신 동의 여부 (선택) */
  marketingAgreed: boolean;
  /** 마케팅 동의 시각. 동의하지 않았으면 null */
  marketingAgreedAt: unknown | null;
  /**
   * 동의 당시의 법무 문서 버전.
   *
   * 출처는 settings/legal.version(어드민에서 관리)이고, 값이 없으면
   * constants/legal.ts의 LEGAL_VERSION으로 폴백한다 — useSettingsStore의
   * getLegalVersion()이 그 판단을 한 곳에서 한다.
   */
  version: string;
}

/**
 * users/{uid}.marketingConsent의 형태 — 마케팅 수신의 **현재 상태**.
 *
 * termsConsent(가입 시점의 증빙)와 일부러 나눠 둔 칸이다. 철회할 때
 * termsConsent를 고치면 "동의를 받았다"는 기록이 사라져 철회 전에 보낸
 * 메일의 근거까지 없어지므로, 원본은 그대로 두고 이 맵만 갱신한다.
 * 자세한 사유는 firestoreKeys.ts의 MARKETING_CONSENT 주석 참고.
 */
export interface MarketingConsentRecord {
  /** 지금 광고성 정보를 받겠다고 되어 있는가 */
  agreed: boolean;
  /** 마지막으로 바꾼 시각. 철회 시각이자 재동의 시각이다 (표현은 TermsConsentRecord와 같은 이유로 unknown) */
  updatedAt: unknown;
  /** 바꾼 시점의 법무 문서 버전 — 재동의는 "그때의 문서에 동의했다"가 성립해야 한다 */
  version: string;
}

/**
 * 게이트 판정 상태.
 *
 * 'unknown'을 별도로 두는 이유는 **조회가 끝나기 전에 게이트를 그리면 안
 * 되기 때문**이다. 없음(missing)과 아직 모름(unknown)을 한 값으로 합치면
 * 이미 동의한 사용자도 새로고침할 때마다 동의 화면이 한 번 번쩍인다.
 */
export type ConsentStatus = 'unknown' | 'granted' | 'missing';

/** Mock 모드 전용 키. 실 모드에서는 users/{uid}.termsConsent 필드가 대신한다. */
const consentKey = (uid: string) => `react_consent_${uid}`;

/**
 * Mock 모드 전용 키. 실 모드에서는 users/{uid}.marketingConsent 필드가 대신한다.
 *
 * uid를 키에 넣는 것이 요점이다. 예전 마이페이지 토글은 uid 없는
 * `react_noti_marketing` 한 칸을 썼는데, 그러면 한 기기에서 두 계정을 쓸 때
 * 앞사람의 수신 설정을 뒷사람이 물려받는다.
 */
const marketingKey = (uid: string) => `react_marketing_consent_${uid}`;

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : null;

/**
 * **지금 이 사용자에게 광고성 정보를 보내도 되는가.**
 *
 * 판정의 단일 출처다. 어드민(marketing_utils.agreed_to_marketing)이 같은
 * 규약을 파이썬으로 미러하므로, 한쪽만 고치면 화면에 보이는 토글과 실제
 * 발송 대상이 어긋난다.
 *
 * 규약은 두 줄이다:
 *   1. marketingConsent에 `agreed` 키가 **있으면** 그 값이 이긴다. 단
 *      `=== true`일 때만 수신으로 본다 — 값이 깨져 있으면 사람이 목록에서
 *      빠질 뿐 끼어들지는 않는다(잘못 보내는 쪽이 되돌릴 수 없는 사고다).
 *   2. 키가 없으면 가입 시 동의(termsConsent.marketingAgreed)로 폴백한다 —
 *      이 맵을 도입하기 전에 가입한 계정이 전부 여기에 해당하므로,
 *      마이그레이션 없이 그대로 동작한다.
 *
 * React도 Firestore도 없이 단독으로 테스트할 수 있어야 하므로 순수 함수다.
 */
export function resolveMarketingSubscribed(
  termsConsent: unknown,
  marketingConsent: unknown
): boolean {
  const override = asRecord(marketingConsent);
  if (override && MARKETING_CONSENT_FIELDS.AGREED in override) {
    return override[MARKETING_CONSENT_FIELDS.AGREED] === true;
  }
  return asRecord(termsConsent)?.marketingAgreed === true;
}

/**
 * 동의 게이트의 통과 조건 — **필수 두 항목의 시각이 모두 있는가**.
 *
 * 선택 항목(마케팅)은 판정에 넣지 않는다. 넣으면 마케팅을 거부한 사용자가
 * 영영 게이트를 벗어나지 못한다.
 *
 * 버전(version)도 비교하지 않는다. 사유는 constants/legal.ts의
 * LEGAL_VERSION 주석 참고.
 *
 * 스토어 밖으로 내보내는 순수 함수다 — React도 Firestore도 없이 조건만
 * 단독으로 테스트할 수 있어야 하기 때문이다.
 */
export function hasRequiredConsent(record: unknown): boolean {
  if (!record || typeof record !== 'object') return false;
  const { termsAgreedAt, privacyAgreedAt } = record as Partial<TermsConsentRecord>;
  return Boolean(termsAgreedAt) && Boolean(privacyAgreedAt);
}

interface ConsentState {
  /** 조회해 둔 동의 기록 (없거나 아직 조회 전이면 null) */
  consent: TermsConsentRecord | null;
  /**
   * 마케팅 수신의 현재 상태 (한 번도 바꾼 적이 없으면 null).
   *
   * null은 "수신 거부"가 아니라 "가입 시 동의를 그대로 따른다"는 뜻이다 —
   * 판정은 resolveMarketingSubscribed()가 consent와 함께 본다.
   */
  marketingConsent: MarketingConsentRecord | null;
  /** 게이트 판정 상태 */
  status: ConsentStatus;
  /** 동의 저장 중 여부 (버튼 로딩 표시용) */
  isSaving: boolean;
  error: string | null;

  /** users/{uid}에서 동의 기록을 읽어 status를 확정합니다 */
  fetchConsent: (uid: string) => Promise<void>;
  /** 필수 2종 동의를 기록합니다. marketingAgreed는 선택 항목입니다 */
  saveConsent: (uid: string, options?: { marketingAgreed?: boolean }) => Promise<boolean>;
  /**
   * 마케팅 수신 여부를 바꿉니다 (마케팅 약관 제6조의 수신 거부 창구).
   *
   * 가입 시 증빙(termsConsent)은 건드리지 않고 marketingConsent만 merge합니다.
   */
  setMarketingConsent: (uid: string, agreed: boolean) => Promise<boolean>;
  /** 로그아웃 시 호출 — 다음 사용자가 앞 사람의 판정을 물려받지 않게 비웁니다 */
  resetConsent: () => void;
}

export const useConsentStore = create<ConsentState>((set) => ({
  consent: null,
  marketingConsent: null,
  status: 'unknown',
  isSaving: false,
  error: null,

  fetchConsent: async (uid: string) => {
    if (IS_MOCK_MODE) {
      const raw = localStorage.getItem(consentKey(uid));
      const parsed = raw ? (JSON.parse(raw) as TermsConsentRecord) : null;
      const marketingRaw = localStorage.getItem(marketingKey(uid));
      set({
        consent: parsed,
        marketingConsent: marketingRaw
          ? (JSON.parse(marketingRaw) as MarketingConsentRecord)
          : null,
        status: hasRequiredConsent(parsed) ? 'granted' : 'missing',
        error: null,
      });
      return;
    }

    try {
      const docRef = doc(db, COLLECTIONS.USERS, uid);
      const snap = await getDoc(docRef);
      const data = snap.exists() ? snap.data() : null;
      const record = (data?.[USER_FIELDS.TERMS_CONSENT] as TermsConsentRecord | undefined) ?? null;
      set({
        consent: record,
        // 같은 문서에 있으므로 읽기를 한 번 더 하지 않는다 (useCharacterStore가
        // character와 avatarId를 함께 읽는 것과 같은 이유).
        marketingConsent:
          (data?.[USER_FIELDS.MARKETING_CONSENT] as MarketingConsentRecord | undefined) ?? null,
        status: hasRequiredConsent(record) ? 'granted' : 'missing',
        error: null,
      });
    } catch (err) {
      console.error('Error fetching consent:', err);
      // 조회 실패는 'missing'으로 내리지 않는다 — 네트워크가 잠깐 끊긴
      // 사용자에게 이미 동의한 약관을 다시 들이미는 쪽이 더 나쁘다.
      // 'unknown'으로 남기면 게이트는 뜨지 않고, 다음 로그인에서 다시 판정한다.
      set({
        status: 'unknown',
        error: err instanceof Error ? err.message : COPY.errors.consentLoadFailed,
      });
    }
  },

  saveConsent: async (uid: string, options) => {
    set({ isSaving: true, error: null });
    const marketingAgreed = options?.marketingAgreed ?? false;

    // 동의 시점의 문서 버전. DB(settings/legal.version)가 있으면 그 값이고,
    // 없으면 코드 상수(LEGAL_VERSION)다 — 어드민에서 약관을 고치고 버전을
    // 올린 뒤의 동의는 새 버전으로 남아야 "무엇에 동의했는가"가 성립한다.
    // 한 번만 읽어 세 갈래(Mock·저장·화면 사본)가 같은 값을 쓰게 한다.
    const version = getLegalVersion();

    if (IS_MOCK_MODE) {
      const now = new Date().toISOString();
      const record: TermsConsentRecord = {
        termsAgreedAt: now,
        privacyAgreedAt: now,
        marketingAgreed,
        marketingAgreedAt: marketingAgreed ? now : null,
        version,
      };
      localStorage.setItem(consentKey(uid), JSON.stringify(record));
      const marketingRecord: MarketingConsentRecord = { agreed: marketingAgreed, updatedAt: now, version };
      localStorage.setItem(marketingKey(uid), JSON.stringify(marketingRecord));
      set({
        consent: record,
        marketingConsent: marketingRecord,
        status: 'granted',
        isSaving: false,
      });
      return true;
    }

    try {
      const docRef = doc(db, COLLECTIONS.USERS, uid);
      await setDoc(
        docRef,
        {
          [USER_FIELDS.TERMS_CONSENT]: {
            termsAgreedAt: serverTimestamp(),
            privacyAgreedAt: serverTimestamp(),
            marketingAgreed,
            marketingAgreedAt: marketingAgreed ? serverTimestamp() : null,
            version,
          },
          // 현재 상태 칸도 같은 쓰기에서 맞춰 둔다 (왕복이 늘지 않는다).
          //
          // 게이트를 통과하는 것은 **가장 최근에 표명한 의사**이므로, 예전에
          // 남아 있던 marketingConsent가 그 위에 얹혀서는 안 된다. 맞춰 두지
          // 않으면 방금 마케팅에 체크한 사용자가 마이페이지에서 꺼진 토글을
          // 보게 된다(판정은 marketingConsent가 이기기 때문).
          [USER_FIELDS.MARKETING_CONSENT]: {
            [MARKETING_CONSENT_FIELDS.AGREED]: marketingAgreed,
            [MARKETING_CONSENT_FIELDS.UPDATED_AT]: serverTimestamp(),
            [MARKETING_CONSENT_FIELDS.VERSION]: version,
          },
        },
        { merge: true }
      );

      // 방금 쓴 값을 다시 읽어 오지 않는다 — serverTimestamp()는 쓰기 시점에
      // 서버가 채우므로 클라이언트가 되읽으려면 왕복이 한 번 더 든다.
      // 게이트는 "있다/없다"만 보므로, 화면용 사본은 클라이언트 시각으로
      // 채운다 (Firestore에 남는 정본은 서버 시각이다).
      const now = new Date().toISOString();
      set({
        consent: {
          termsAgreedAt: now,
          privacyAgreedAt: now,
          marketingAgreed,
          marketingAgreedAt: marketingAgreed ? now : null,
          version,
        },
        marketingConsent: { agreed: marketingAgreed, updatedAt: now, version },
        status: 'granted',
        isSaving: false,
      });
      return true;
    } catch (err) {
      console.error('Error saving consent:', err);
      set({
        error: err instanceof Error ? err.message : COPY.errors.consentSaveFailed,
        isSaving: false,
      });
      return false;
    }
  },

  setMarketingConsent: async (uid: string, agreed: boolean) => {
    set({ isSaving: true, error: null });

    // 재동의는 "지금 게시된 문서에 동의했다"가 성립해야 하므로 저장 시점의
    // 버전을 함께 남긴다. 철회에도 같은 모양으로 적어 둔다 — 어느 판 문서를
    // 보고 껐는지가 남아야 한다.
    const version = getLegalVersion();

    if (IS_MOCK_MODE) {
      const record: MarketingConsentRecord = {
        agreed,
        updatedAt: new Date().toISOString(),
        version,
      };
      localStorage.setItem(marketingKey(uid), JSON.stringify(record));
      set({ marketingConsent: record, isSaving: false });
      return true;
    }

    try {
      const docRef = doc(db, COLLECTIONS.USERS, uid);
      // ⚠️ termsConsent는 손대지 않는다. 가입 시 동의를 받은 사실 자체가
      // 증빙이라, 철회한다고 그 기록을 false로 덮으면 철회 전에 보낸 메일의
      // 근거가 사라진다. 새 칸만 merge한다.
      await setDoc(
        docRef,
        {
          [USER_FIELDS.MARKETING_CONSENT]: {
            [MARKETING_CONSENT_FIELDS.AGREED]: agreed,
            [MARKETING_CONSENT_FIELDS.UPDATED_AT]: serverTimestamp(),
            [MARKETING_CONSENT_FIELDS.VERSION]: version,
          },
        },
        { merge: true }
      );

      // saveConsent와 같은 이유로 되읽지 않는다 — serverTimestamp()는 서버가
      // 채우므로 왕복이 한 번 더 든다. 화면은 agreed만 보고, 정본 시각은
      // Firestore에 남은 서버 시각이다.
      set({
        marketingConsent: { agreed, updatedAt: new Date().toISOString(), version },
        isSaving: false,
      });
      return true;
    } catch (err) {
      console.error('Error saving marketing consent:', err);
      set({
        error: err instanceof Error ? err.message : COPY.errors.consentSaveFailed,
        isSaving: false,
      });
      return false;
    }
  },

  resetConsent: () =>
    set({
      consent: null,
      marketingConsent: null,
      status: 'unknown',
      isSaving: false,
      error: null,
    }),
}));
