// src/store/useSettingsStore.ts
// 법무 문서 전문 · 운영 정보 · 서비스 공지의 DB 우선 조회 (settings 컬렉션).
//
// 왜 만들었나 —
//   약관·처리방침 전문과 운영 정보(보호책임자 성명, 연락처 2종)가 전부
//   constants/legal.ts에 하드코딩돼 있어서, 담당자 이름 한 글자를 바꾸는 데도
//   개발자가 빌드·배포를 해야 했다. 사업 종료(2026-09-30) 후에는 팀이 개발자
//   없이 유지해야 하므로, questions·scenarios와 **같은 계약**으로 뺐다:
//   DB에 값이 있으면 그것을 쓰고, 없으면 코드 상수로 조용히 폴백한다.
//
//   공지 배너도 같은 문서 계약에 얹었다. 처리방침 제11조가 "서비스 내 공지"로
//   변경을 알리겠다고 약속하는데 정작 공지 수단이 없었다 — 약속한 통로를
//   실제로 만드는 것이 이 스토어의 두 번째 목적이다.
//
// 폴백은 **조용해야 한다** —
//   scenarios가 그렇듯 문서가 없는 상태도 정상 동작이고(시드 전), 법무 문서는
//   특히 "안 보이는 것"이 최악이다. 조회 실패·형식 오류는 console.warn만 남기고
//   코드 상수로 계속 간다. 화면에 에러를 띄우면 약관을 읽으러 온 사용자가
//   빈 모달을 보게 된다.

import { create } from 'zustand';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../api/firebase';
import { IS_MOCK_MODE } from '../api/env';
import { COLLECTIONS, SETTINGS_DOCS } from '../api/firestoreKeys';
import {
  TERMS,
  PRIVACY,
  MARKETING,
  MARKETING_CONSENT_ENABLED_DEFAULT,
  CONTACT_EMAIL,
  INQUIRY_EMAIL,
  LEGAL_VERSION,
  OFFICER_NAME,
  isOfficerSection,
  buildOfficerSectionBody,
  type LegalDocument,
  type LegalSection,
} from '../constants/legal';

/** Mock 모드 전용 키. 실 모드에서는 settings/{legal,notice} 문서가 대신한다. */
const MOCK_LEGAL_KEY = 'react_settings_legal';
const MOCK_NOTICE_KEY = 'react_settings_notice';

/**
 * DB 값으로 해석이 끝난 법무·운영 정보.
 *
 * 소비처가 "DB에 값이 있었나"를 따지지 않아도 되도록 **항상 완성된 값**을
 * 담는다. 초기값부터 코드 상수로 채워 두므로 null 체크가 필요 없고, 조회가
 * 끝나기 전에 약관 모달을 열어도 빈 화면이 뜨지 않는다.
 */
export interface ResolvedLegalSettings {
  terms: LegalDocument;
  privacy: LegalDocument;
  /** 마케팅 정보 수신 동의 전문. marketingConsentEnabled가 false면 화면에 쓰이지 않는다 */
  marketing: LegalDocument;
  /**
   * 동의 화면에 마케팅 수신 동의 **항목을 표시할지**.
   *
   * 전문(marketing)과 별개인 이유는, 항목을 끈다고 문안까지 지울 이유가 없기
   * 때문이다 — 껐다 켜는 동안 문안은 그대로 보존되어야 한다.
   */
  marketingConsentEnabled: boolean;
  officerName: string;
  contactEmail: string;
  inquiryEmail: string;
  version: string;
  /**
   * DB가 실제로 값을 준 필드 이름 목록.
   *
   * 화면에는 쓰지 않는다 — "바꿨는데 반영이 안 된다"는 문의를 받았을 때
   * 콘솔에서 폴백 상태인지 확인하려는 용도다. scenarios 폴백이 화면상
   * 구분되지 않아 겪은 혼란(루트 CLAUDE.md 참조)을 반복하지 않으려는 것.
   */
  overriddenFields: string[];
}

/** 공지 배너의 해석 결과. active는 "실제로 띄울 수 있는가"까지 판정한 값이다. */
export interface ResolvedNotice {
  active: boolean;
  message: string;
}

/** 빈 문자열·공백만 있는 값을 null로 접는다. DB의 "지운 셈 친" 값을 걸러내기 위한 것. */
function readString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * 불리언 필드를 **진짜 불리언일 때만** 읽는다. 그 밖의 값은 null(=폴백).
 *
 * 문자열 "false"를 false로 읽어 주지 않는 것이 요점이다 — 그렇게 관대하면
 * 오타 하나("fasle")가 조용히 반대 의미로 해석된다. 어드민은 저장 시점에
 * bool()로 타입을 굳히므로(settings_utils.build_legal_payload), 불리언이
 * 아닌 값이 들어오는 경로는 손으로 고친 문서뿐이고 그때는 폴백이 안전하다.
 */
function readBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

/**
 * 조항 배열의 형식 검사.
 *
 * 어드민이 쓰는 값이라 스키마가 어긋날 수 있다(직접 편집하는 텍스트다).
 * **한 조항이라도 형식이 깨지면 배열 전체를 버리고 폴백한다** — 절반만
 * 적용하면 조항이 중간에 사라진 법무 문서가 게시된다.
 */
export function isLegalSectionArray(value: unknown): value is LegalSection[] {
  if (!Array.isArray(value) || value.length === 0) return false;
  return value.every(
    (item) =>
      item !== null &&
      typeof item === 'object' &&
      typeof (item as LegalSection).heading === 'string' &&
      (item as LegalSection).heading.trim() !== '' &&
      typeof (item as LegalSection).body === 'string'
  );
}

/**
 * 처리방침 조항 배열에서 보호책임자 조항의 본문만 갈아 끼운다.
 *
 * 조항이 DB에서 왔든 코드 상수에서 왔든 **항상** 다시 만든다. 성명·연락처는
 * 구조화 필드가 정본이고 조항 산문은 그 표현이라는 규약이라, 두 곳이 어긋날
 * 여지를 남기지 않는다 (buildOfficerSectionBody 주석 참조).
 */
function withOfficerSection(
  sections: LegalSection[],
  officerName: string,
  contactEmail: string
): LegalSection[] {
  return sections.map((section) =>
    isOfficerSection(section.heading)
      ? { ...section, body: buildOfficerSectionBody({ officerName, contactEmail }) }
      : section
  );
}

/**
 * settings/legal 원문(무엇이든 들어올 수 있다)을 완성된 값으로 해석한다.
 *
 * React도 Firestore도 없이 단독으로 테스트할 수 있는 순수 함수다 — 폴백 규칙이
 * 이 기능의 핵심이라 스토어 밖에서 검증할 수 있어야 한다.
 */
export function resolveLegalSettings(raw: unknown): ResolvedLegalSettings {
  const data: Record<string, unknown> =
    raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const overriddenFields: string[] = [];

  const dbOfficerName = readString(data.officerName);
  const dbContactEmail = readString(data.contactEmail);
  const dbInquiryEmail = readString(data.inquiryEmail);
  const dbVersion = readString(data.version);
  const dbMarketingEnabled = readBoolean(data.marketingConsentEnabled);

  const officerName = dbOfficerName ?? OFFICER_NAME;
  const contactEmail = dbContactEmail ?? CONTACT_EMAIL;
  const inquiryEmail = dbInquiryEmail ?? INQUIRY_EMAIL;
  const version = dbVersion ?? LEGAL_VERSION;
  const marketingConsentEnabled = dbMarketingEnabled ?? MARKETING_CONSENT_ENABLED_DEFAULT;

  if (dbOfficerName) overriddenFields.push('officerName');
  if (dbContactEmail) overriddenFields.push('contactEmail');
  if (dbInquiryEmail) overriddenFields.push('inquiryEmail');
  if (dbVersion) overriddenFields.push('version');

  const dbTermsSections = isLegalSectionArray(data.termsSections) ? data.termsSections : null;
  const dbPrivacySections = isLegalSectionArray(data.privacySections) ? data.privacySections : null;
  const dbMarketingSections = isLegalSectionArray(data.marketingSections)
    ? data.marketingSections
    : null;

  if (dbTermsSections) overriddenFields.push('termsSections');
  if (dbPrivacySections) overriddenFields.push('privacySections');
  if (dbMarketingSections) overriddenFields.push('marketingSections');
  // 불리언은 false도 "DB가 채운 값"이다 — truthy 검사를 쓰면 꺼 둔 상태가
  // 폴백과 구분되지 않아, 정작 확인이 필요한 OFF가 목록에서 사라진다.
  if (dbMarketingEnabled !== null) overriddenFields.push('marketingConsentEnabled');

  // 형식이 깨진 값이 들어와 폴백한 경우만 경고한다. 필드가 아예 없는 것은
  // 정상(시드 전)이므로 조용히 넘어간다.
  if (data.termsSections !== undefined && !dbTermsSections) {
    console.warn('[settings] termsSections 형식이 올바르지 않아 코드 기본값으로 폴백합니다.');
  }
  if (data.privacySections !== undefined && !dbPrivacySections) {
    console.warn('[settings] privacySections 형식이 올바르지 않아 코드 기본값으로 폴백합니다.');
  }
  if (data.marketingSections !== undefined && !dbMarketingSections) {
    console.warn('[settings] marketingSections 형식이 올바르지 않아 코드 기본값으로 폴백합니다.');
  }
  if (data.marketingConsentEnabled !== undefined && dbMarketingEnabled === null) {
    console.warn(
      '[settings] marketingConsentEnabled가 불리언이 아니어서 코드 기본값으로 폴백합니다.'
    );
  }

  return {
    terms: { title: TERMS.title, sections: dbTermsSections ?? TERMS.sections },
    privacy: {
      title: PRIVACY.title,
      sections: withOfficerSection(
        dbPrivacySections ?? PRIVACY.sections,
        officerName,
        contactEmail
      ),
    },
    // 마케팅 전문에도 보호책임자 조항이 있다(제 9 조) — 처리방침과 같은 규약으로
    // 본문을 필드에서 다시 만든다. 담당자가 바뀌었을 때 한 문서만 갱신되는 것을 막는다.
    marketing: {
      title: MARKETING.title,
      sections: withOfficerSection(
        dbMarketingSections ?? MARKETING.sections,
        officerName,
        contactEmail
      ),
    },
    marketingConsentEnabled,
    officerName,
    contactEmail,
    inquiryEmail,
    version,
    overriddenFields,
  };
}

/**
 * settings/notice 원문을 배너 표시 여부까지 판정해 돌려준다.
 *
 * active는 **불리언 true일 때만** 참으로 본다 — 어드민이 문자열 "true"를
 * 넣거나 실수로 1을 넣었을 때 배너가 켜지면, 끄는 방법을 찾지 못한 채
 * 사용자 화면에 남는다. 애매하면 꺼진 쪽이 안전하다.
 */
export function resolveNotice(raw: unknown): ResolvedNotice {
  const data: Record<string, unknown> =
    raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const message = readString(data.message) ?? '';
  return { active: data.active === true && message !== '', message };
}

/** Mock 모드에서 localStorage 한 칸을 읽어 파싱한다. 깨져 있으면 null(=폴백). */
function readMockJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.warn(`[settings] Mock 설정(${key})을 읽지 못해 기본값을 씁니다.`, err);
    return null;
  }
}

interface SettingsState {
  legal: ResolvedLegalSettings;
  notice: ResolvedNotice;
  /** 조회를 한 번이라도 끝냈는가 (실패로 끝난 경우도 true) */
  isLoaded: boolean;
  /**
   * 사용자가 닫은 공지의 본문.
   *
   * 불리언이 아니라 본문을 담는 이유는, 운영팀이 새 공지를 올렸을 때
   * **다시 떠야 하기** 때문이다. 불리언으로 두면 한 번 닫은 사용자는 이후
   * 어떤 공지도 보지 못한다. 세션(페이지 로드) 단위로만 유지한다 —
   * 새로고침하면 다시 뜨는 편이 놓친 공지를 되살릴 여지를 남긴다.
   */
  dismissedNoticeMessage: string | null;

  fetchSettings: () => Promise<void>;
  dismissNotice: () => void;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  legal: resolveLegalSettings(null),
  notice: resolveNotice(null),
  isLoaded: false,
  dismissedNoticeMessage: null,

  fetchSettings: async () => {
    if (IS_MOCK_MODE) {
      set({
        legal: resolveLegalSettings(readMockJson(MOCK_LEGAL_KEY)),
        notice: resolveNotice(readMockJson(MOCK_NOTICE_KEY)),
        isLoaded: true,
      });
      return;
    }

    // 두 문서를 따로 처리한다 — 한쪽 조회가 실패해도 다른 쪽은 살린다.
    // Promise.all이면 공지 문서 하나 때문에 약관까지 폴백으로 떨어진다.
    const [legalResult, noticeResult] = await Promise.allSettled([
      getDoc(doc(db, COLLECTIONS.SETTINGS, SETTINGS_DOCS.LEGAL)),
      getDoc(doc(db, COLLECTIONS.SETTINGS, SETTINGS_DOCS.NOTICE)),
    ]);

    let legal = resolveLegalSettings(null);
    if (legalResult.status === 'fulfilled') {
      legal = resolveLegalSettings(
        legalResult.value.exists() ? legalResult.value.data() : null
      );
    } else {
      console.warn('[settings] settings/legal 조회 실패 — 코드 기본값을 씁니다.', legalResult.reason);
    }

    let notice = resolveNotice(null);
    if (noticeResult.status === 'fulfilled') {
      notice = resolveNotice(noticeResult.value.exists() ? noticeResult.value.data() : null);
    } else {
      console.warn('[settings] settings/notice 조회 실패 — 공지를 띄우지 않습니다.', noticeResult.reason);
    }

    set({ legal, notice, isLoaded: true });
  },

  dismissNotice: () => set({ dismissedNoticeMessage: get().notice.message }),
}));

/**
 * 동의 기록에 남길 법무 문서 버전.
 *
 * useConsentStore가 React 밖에서 부르므로 훅이 아니라 함수다. DB에 version이
 * 있으면 그것을, 없으면 LEGAL_VERSION을 돌려준다 — 어드민에서 약관을 고치고
 * 버전을 올리면, 그 뒤의 동의는 새 버전으로 기록되어야 "무엇에 동의했는가"가
 * 남는다.
 */
export function getLegalVersion(): string {
  return useSettingsStore.getState().legal.version;
}
