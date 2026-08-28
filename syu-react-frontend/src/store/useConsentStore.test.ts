// src/store/useConsentStore.test.ts
//
// 동의 게이트의 **판정 조건**을 고정한다.
//
// 이 조건이 흔들리면 두 방향 모두 사고가 된다:
//   - 너무 느슨하면 동의 없이 서비스에 들어간다 (게이트를 만든 이유가 사라짐)
//   - 너무 빡빡하면 이미 동의한 사용자가 매번 동의 화면에 갇힌다
// 특히 'unknown'(조회 전/실패)과 'missing'(조회했고 기록이 없음)을 구분하는
// 계약이 중요하다 — 합치면 새로고침마다 동의 화면이 번쩍인다.
//
// 모킹 패턴은 useCharacterStore.test.ts와 동일 — Mock 모드 강제 + localStorage 스텁.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api/env', () => ({ IS_MOCK_MODE: true }));
vi.mock('../api/firebase', () => ({ db: {} }));

import {
  useConsentStore,
  hasRequiredConsent,
  resolveMarketingSubscribed,
} from './useConsentStore';
import { useSettingsStore, resolveLegalSettings } from './useSettingsStore';
import { LEGAL_VERSION } from '../constants/legal';

const storage = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => void storage.set(key, value),
  removeItem: (key: string) => void storage.delete(key),
  clear: () => storage.clear(),
});

beforeEach(() => {
  storage.clear();
  useConsentStore.setState({
    consent: null,
    marketingConsent: null,
    status: 'unknown',
    isSaving: false,
    error: null,
  });
  // 버전 출처가 스토어로 옮겨졌으므로 매 테스트마다 폴백 상태로 되돌린다
  useSettingsStore.setState({ legal: resolveLegalSettings(null) });
});

// ── 순수 판정 함수 ───────────────────────────────────────
describe('hasRequiredConsent', () => {
  it('기록이 아예 없으면 통과시키지 않는다', () => {
    expect(hasRequiredConsent(null)).toBe(false);
    expect(hasRequiredConsent(undefined)).toBe(false);
  });

  it('필수 두 항목의 시각이 모두 있어야 통과한다', () => {
    expect(hasRequiredConsent({ termsAgreedAt: 'now', privacyAgreedAt: 'now' })).toBe(true);
  });

  it('둘 중 하나만 있으면 통과시키지 않는다', () => {
    expect(hasRequiredConsent({ termsAgreedAt: 'now' })).toBe(false);
    expect(hasRequiredConsent({ privacyAgreedAt: 'now' })).toBe(false);
  });

  it('마케팅 동의만으로는 통과하지 않는다 (선택 항목이므로)', () => {
    expect(hasRequiredConsent({ marketingAgreed: true, marketingAgreedAt: 'now' })).toBe(false);
  });

  it('마케팅을 거부해도 필수 두 항목이 있으면 통과한다', () => {
    // 선택 항목을 판정에 넣으면 마케팅을 거부한 사용자가 게이트에 갇힌다.
    expect(
      hasRequiredConsent({
        termsAgreedAt: 'now',
        privacyAgreedAt: 'now',
        marketingAgreed: false,
        marketingAgreedAt: null,
      })
    ).toBe(true);
  });

  it('객체가 아닌 값에도 터지지 않는다', () => {
    expect(hasRequiredConsent('yes')).toBe(false);
    expect(hasRequiredConsent(1)).toBe(false);
  });
});

// ── 게이트 표시 판정 ─────────────────────────────────────
describe('fetchConsent (Mock 모드)', () => {
  it('동의 기록이 없으면 status가 missing이 된다 (게이트 표시)', async () => {
    await useConsentStore.getState().fetchConsent('uid-신규');

    expect(useConsentStore.getState().status).toBe('missing');
    expect(useConsentStore.getState().consent).toBeNull();
  });

  it('동의 기록이 있으면 status가 granted가 된다 (게이트 통과)', async () => {
    await useConsentStore.getState().saveConsent('uid-1');
    useConsentStore.setState({ consent: null, status: 'unknown' });

    await useConsentStore.getState().fetchConsent('uid-1');

    expect(useConsentStore.getState().status).toBe('granted');
  });

  it('조회 전 초기 status는 unknown이다', () => {
    // 'missing'이 초기값이면 조회가 끝나기 전에 게이트가 한 프레임 번쩍인다.
    expect(useConsentStore.getState().status).toBe('unknown');
  });

  it('다른 사용자의 동의 기록을 물려받지 않는다', async () => {
    await useConsentStore.getState().saveConsent('uid-1');

    await useConsentStore.getState().fetchConsent('uid-2');

    expect(useConsentStore.getState().status).toBe('missing');
  });

  it('법무 문서 버전이 올라가도 이미 동의한 사용자는 게이트를 다시 만나지 않는다', async () => {
    // constants/legal.ts의 LEGAL_VERSION 주석이 명시한 계약이다 — 게이트는
    // 필수 두 항목의 **시각**만 보고 버전은 비교하지 않는다. 비교하도록 바뀌면
    // 조항 하나를 고치고 시행일을 올린 순간 기존 사용자 전원이 동의 화면에
    // 갇히므로, 그 결정은 코드가 아니라 팀이 내려야 한다.
    // 2026-08-26 개정(마케팅 정합성)이 실제로 이 경로를 지나갔다.
    await useConsentStore.getState().saveConsent('uid-1');
    useConsentStore.setState({ consent: null, status: 'unknown' });
    useSettingsStore.setState({ legal: resolveLegalSettings({ version: '2099-01-01' }) });

    await useConsentStore.getState().fetchConsent('uid-1');

    expect(useConsentStore.getState().status).toBe('granted');
    // 옛 버전으로 남은 기록 자체는 덮이지 않는다 — 무엇에 동의했는지가 증빙이다.
    expect(useConsentStore.getState().consent?.version).toBe(LEGAL_VERSION);
  });
});

// ── 동의 저장 ────────────────────────────────────────────
describe('saveConsent (Mock 모드)', () => {
  it('필수 두 항목의 시각과 문서 버전을 남기고 status를 granted로 올린다', async () => {
    const ok = await useConsentStore.getState().saveConsent('uid-1');

    expect(ok).toBe(true);
    const record = useConsentStore.getState().consent;
    expect(record?.termsAgreedAt).toBeTruthy();
    expect(record?.privacyAgreedAt).toBeTruthy();
    expect(record?.version).toBe(LEGAL_VERSION);
    expect(useConsentStore.getState().status).toBe('granted');
  });

  it('마케팅 동의를 주지 않으면 false로 기록하고 시각은 null로 둔다', async () => {
    await useConsentStore.getState().saveConsent('uid-1');

    const record = useConsentStore.getState().consent;
    expect(record?.marketingAgreed).toBe(false);
    expect(record?.marketingAgreedAt).toBeNull();
  });

  it('마케팅에 동의하면 여부와 시각을 함께 기록한다', async () => {
    await useConsentStore.getState().saveConsent('uid-1', { marketingAgreed: true });

    const record = useConsentStore.getState().consent;
    expect(record?.marketingAgreed).toBe(true);
    expect(record?.marketingAgreedAt).toBeTruthy();
  });

  it('저장한 기록은 uid별 키로 남아 다음 조회에서 읽힌다', async () => {
    await useConsentStore.getState().saveConsent('uid-1', { marketingAgreed: true });

    const saved = JSON.parse(localStorage.getItem('react_consent_uid-1') ?? 'null');
    expect(hasRequiredConsent(saved)).toBe(true);
    expect(saved.marketingAgreed).toBe(true);
  });

  it('DB(settings/legal)에 version이 있으면 그 버전으로 동의를 기록한다', async () => {
    // 어드민에서 약관을 고치고 버전을 올린 뒤의 동의는 새 버전으로 남아야
    // "무엇에 동의했는가"가 성립한다. 코드 상수로 굳어 있으면 약관이 바뀌어도
    // 모든 동의가 옛 버전으로 기록된다.
    useSettingsStore.setState({ legal: resolveLegalSettings({ version: '2026-09-01' }) });

    await useConsentStore.getState().saveConsent('uid-1');

    expect(useConsentStore.getState().consent?.version).toBe('2026-09-01');
  });
});

describe('resetConsent', () => {
  it('로그아웃 시 판정을 unknown으로 되돌린다', async () => {
    await useConsentStore.getState().saveConsent('uid-1');

    useConsentStore.getState().resetConsent();

    // 'missing'으로 비우면 로그아웃 직후 랜딩 위에 게이트가 뜬다.
    expect(useConsentStore.getState().status).toBe('unknown');
    expect(useConsentStore.getState().consent).toBeNull();
  });

  it('마케팅 수신 상태도 함께 비운다', async () => {
    // 남겨 두면 다음 사용자가 앞사람의 수신 설정을 물려받은 채 토글을 본다.
    await useConsentStore.getState().setMarketingConsent('uid-1', true);

    useConsentStore.getState().resetConsent();

    expect(useConsentStore.getState().marketingConsent).toBeNull();
  });
});

// ── 마케팅 수신 판정 (프론트 토글 ↔ 어드민 추출의 공통 규약) ──────
//
// 이 함수가 흔들리면 화면의 토글과 실제 발송 대상이 어긋난다. 어긋나는
// 방향 중 하나는 그냥 버그지만, 다른 하나(거부했는데 목록에 남는 것)는
// 정보통신망법 제50조 위반이다. 파이썬 미러는
// syu-react-admin/marketing_utils.py의 agreed_to_marketing.
describe('resolveMarketingSubscribed', () => {
  const agreedAtSignup = { termsAgreedAt: 'now', privacyAgreedAt: 'now', marketingAgreed: true };
  const refusedAtSignup = { termsAgreedAt: 'now', privacyAgreedAt: 'now', marketingAgreed: false };

  it('현재 상태 기록이 없으면 가입 시 동의를 그대로 따른다', () => {
    // 이 필드를 도입하기 전에 가입한 계정이 전부 여기 해당한다 —
    // 마이그레이션 없이 동작해야 한다.
    expect(resolveMarketingSubscribed(agreedAtSignup, null)).toBe(true);
    expect(resolveMarketingSubscribed(refusedAtSignup, null)).toBe(false);
    expect(resolveMarketingSubscribed(null, null)).toBe(false);
  });

  it('수신을 거부하면 가입 시 동의했어도 발송 대상에서 빠진다', () => {
    expect(resolveMarketingSubscribed(agreedAtSignup, { agreed: false, updatedAt: 'now' })).toBe(
      false
    );
  });

  it('가입 때 거부한 사람이 나중에 켜면 발송 대상이 된다', () => {
    // 토글이 한 방향으로만 동작하면, 거부했던 사용자에게는 켜지지 않는
    // 죽은 스위치가 된다.
    expect(resolveMarketingSubscribed(refusedAtSignup, { agreed: true, updatedAt: 'now' })).toBe(
      true
    );
  });

  it('agreed가 불리언 true가 아니면 수신으로 보지 않는다', () => {
    // 값이 깨져 있을 때 사람이 목록에서 **빠지는** 쪽으로 넘어져야 한다.
    // 반대 방향의 실수는 되돌릴 수 없다(이미 나간 메일).
    expect(resolveMarketingSubscribed(agreedAtSignup, { agreed: 'true' })).toBe(false);
    expect(resolveMarketingSubscribed(agreedAtSignup, { agreed: 1 })).toBe(false);
    expect(resolveMarketingSubscribed(agreedAtSignup, { agreed: null })).toBe(false);
  });

  it('agreed 키가 아예 없는 빈 맵은 덮어쓰지 않고 폴백한다', () => {
    // 시각만 적히고 값이 빠진 문서를 '거부'로 읽으면 동의자가 조용히 사라진다.
    expect(resolveMarketingSubscribed(agreedAtSignup, {})).toBe(true);
    expect(resolveMarketingSubscribed(agreedAtSignup, { updatedAt: 'now' })).toBe(true);
  });

  it('객체가 아닌 값에도 터지지 않는다', () => {
    expect(resolveMarketingSubscribed('yes', 'no')).toBe(false);
    expect(resolveMarketingSubscribed(agreedAtSignup, 'off')).toBe(true);
  });
});

// ── 수신 거부 창구 (마케팅 약관 제6조) ───────────────────────────
describe('setMarketingConsent (Mock 모드)', () => {
  it('가입 시 증빙(termsConsent)은 건드리지 않는다', async () => {
    // 철회했다고 동의를 받은 기록까지 지우면, 철회 전에 보낸 메일의 근거가
    // 사라진다. 원본은 남기고 현재 상태만 바꾸는 것이 이 설계의 요점이다.
    await useConsentStore.getState().saveConsent('uid-1', { marketingAgreed: true });

    await useConsentStore.getState().setMarketingConsent('uid-1', false);

    const proof = JSON.parse(localStorage.getItem('react_consent_uid-1') ?? 'null');
    expect(proof.marketingAgreed).toBe(true);
    expect(proof.marketingAgreedAt).toBeTruthy();
    expect(useConsentStore.getState().consent?.marketingAgreed).toBe(true);
  });

  it('철회하면 현재 상태가 미수신으로 바뀐다', async () => {
    await useConsentStore.getState().saveConsent('uid-1', { marketingAgreed: true });

    const ok = await useConsentStore.getState().setMarketingConsent('uid-1', false);

    expect(ok).toBe(true);
    const { consent, marketingConsent } = useConsentStore.getState();
    expect(marketingConsent?.agreed).toBe(false);
    expect(resolveMarketingSubscribed(consent, marketingConsent)).toBe(false);
  });

  it('변경 시각과 문서 버전을 함께 남긴다', async () => {
    // 재동의는 "그때 게시돼 있던 문서에 동의했다"가 성립해야 하고,
    // 철회는 "언제 껐는가"가 있어야 발송 기록과 대조할 수 있다.
    useSettingsStore.setState({ legal: resolveLegalSettings({ version: '2026-09-01' }) });

    await useConsentStore.getState().setMarketingConsent('uid-1', false);

    const record = useConsentStore.getState().marketingConsent;
    expect(record?.updatedAt).toBeTruthy();
    expect(record?.version).toBe('2026-09-01');
  });

  it('uid별 키로 저장돼 다음 조회에서 읽힌다', async () => {
    await useConsentStore.getState().saveConsent('uid-1', { marketingAgreed: true });
    await useConsentStore.getState().setMarketingConsent('uid-1', false);
    useConsentStore.setState({ consent: null, marketingConsent: null, status: 'unknown' });

    await useConsentStore.getState().fetchConsent('uid-1');

    const { consent, marketingConsent } = useConsentStore.getState();
    expect(marketingConsent?.agreed).toBe(false);
    expect(resolveMarketingSubscribed(consent, marketingConsent)).toBe(false);
  });

  it('다른 사용자의 수신 설정을 물려받지 않는다', async () => {
    // 예전 키(react_noti_marketing)는 uid가 없어 한 기기의 두 계정이 설정을
    // 공유했다 — 앞사람이 끄면 뒷사람도 꺼진 토글을 봤다.
    await useConsentStore.getState().setMarketingConsent('uid-1', false);

    await useConsentStore.getState().fetchConsent('uid-2');

    expect(useConsentStore.getState().marketingConsent).toBeNull();
  });

  it('다시 켜면 발송 대상으로 돌아온다', async () => {
    await useConsentStore.getState().saveConsent('uid-1', { marketingAgreed: false });

    await useConsentStore.getState().setMarketingConsent('uid-1', true);

    const { consent, marketingConsent } = useConsentStore.getState();
    expect(resolveMarketingSubscribed(consent, marketingConsent)).toBe(true);
  });
});

describe('saveConsent와 setMarketingConsent의 우선순위', () => {
  it('게이트를 다시 통과하면 그 선택이 예전 수신 설정을 이긴다', async () => {
    // 판정은 marketingConsent가 이기므로, 게이트에서 마케팅에 체크했는데도
    // 옛 철회 기록이 남아 있으면 사용자는 꺼진 토글을 보게 된다.
    await useConsentStore.getState().setMarketingConsent('uid-1', false);

    await useConsentStore.getState().saveConsent('uid-1', { marketingAgreed: true });

    const { consent, marketingConsent } = useConsentStore.getState();
    expect(resolveMarketingSubscribed(consent, marketingConsent)).toBe(true);
  });
});
