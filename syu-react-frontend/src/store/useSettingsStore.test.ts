// src/store/useSettingsStore.test.ts
//
// **폴백 규칙**을 고정한다.
//
// 이 기능의 값은 전부 "DB에 있으면 그것, 없으면 코드 상수"라는 한 문장에서
// 나온다. 그 문장이 조용히 깨지는 방향이 둘인데 양쪽 다 사고다:
//   - DB 값이 무시되면 → 운영팀이 어드민에서 고쳐도 앱이 안 바뀐다
//     (개발자 없이 못 바꾸는 원래 문제로 되돌아간다)
//   - 폴백이 안 되면 → 문서가 없거나 형식이 깨졌을 때 약관이 빈 채로 게시된다
//
// resolveLegalSettings·resolveNotice가 순수 함수인 것은 이 때문이다 —
// Firestore도 React도 없이 규칙만 단독으로 검증한다.
//
// 모킹 패턴은 useConsentStore.test.ts와 동일 — Mock 모드 강제 + localStorage 스텁.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api/env', () => ({ IS_MOCK_MODE: true }));
vi.mock('../api/firebase', () => ({ db: {} }));

import {
  useSettingsStore,
  resolveLegalSettings,
  resolveNotice,
  isLegalSectionArray,
  getLegalVersion,
} from './useSettingsStore';
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
} from '../constants/legal';

const storage = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => void storage.set(key, value),
  removeItem: (key: string) => void storage.delete(key),
  clear: () => storage.clear(),
});

/** 처리방침에서 보호책임자 조항 본문을 꺼낸다 (조항 번호에 기대지 않는다) */
const officerBody = (sections: { heading: string; body: string }[]) =>
  sections.find((section) => isOfficerSection(section.heading))?.body ?? '';

beforeEach(() => {
  storage.clear();
  vi.restoreAllMocks();
  useSettingsStore.setState({
    legal: resolveLegalSettings(null),
    notice: resolveNotice(null),
    isLoaded: false,
    dismissedNoticeMessage: null,
  });
});

// ── 형식 검사 ────────────────────────────────────────────
describe('isLegalSectionArray', () => {
  it('heading·body가 모두 있는 배열만 통과시킨다', () => {
    expect(isLegalSectionArray([{ heading: '제 1 조', body: '본문' }])).toBe(true);
  });

  it('빈 배열은 통과시키지 않는다 (조항 없는 약관이 게시된다)', () => {
    expect(isLegalSectionArray([])).toBe(false);
  });

  it('배열이 아닌 값에도 터지지 않는다', () => {
    expect(isLegalSectionArray(null)).toBe(false);
    expect(isLegalSectionArray('제 1 조')).toBe(false);
    expect(isLegalSectionArray({ heading: '제 1 조', body: '본문' })).toBe(false);
  });

  it('한 조항이라도 형식이 깨지면 배열 전체를 버린다', () => {
    // 절반만 적용하면 조항이 중간에 사라진 법무 문서가 게시된다.
    expect(
      isLegalSectionArray([
        { heading: '제 1 조', body: '본문' },
        { heading: '제 2 조' },
      ])
    ).toBe(false);
    expect(isLegalSectionArray([{ heading: '', body: '본문' }])).toBe(false);
  });

  it('본문이 빈 문자열인 조항은 허용한다 (제목만 있는 조항이 있을 수 있다)', () => {
    expect(isLegalSectionArray([{ heading: '제 1 조', body: '' }])).toBe(true);
  });
});

// ── 법무·운영 정보 해석 ──────────────────────────────────
describe('resolveLegalSettings — 폴백', () => {
  it('문서가 없으면 전부 코드 상수로 채운다', () => {
    const resolved = resolveLegalSettings(null);

    expect(resolved.officerName).toBe(OFFICER_NAME);
    expect(resolved.contactEmail).toBe(CONTACT_EMAIL);
    expect(resolved.inquiryEmail).toBe(INQUIRY_EMAIL);
    expect(resolved.version).toBe(LEGAL_VERSION);
    expect(resolved.terms.sections).toEqual(TERMS.sections);
    expect(resolved.overriddenFields).toEqual([]);
  });

  it('빈 문자열·공백만 있는 필드는 "없는 것"으로 보고 폴백한다', () => {
    // 어드민에서 값을 지우면 빈 문자열이 남는다 — 그대로 쓰면 화면에서
    // 연락처가 사라진다.
    const resolved = resolveLegalSettings({ officerName: '   ', contactEmail: '' });

    expect(resolved.officerName).toBe(OFFICER_NAME);
    expect(resolved.contactEmail).toBe(CONTACT_EMAIL);
  });

  it('객체가 아닌 값에도 터지지 않는다', () => {
    expect(resolveLegalSettings('legal').officerName).toBe(OFFICER_NAME);
    expect(resolveLegalSettings(42).version).toBe(LEGAL_VERSION);
  });

  it('형식이 깨진 조항 배열은 버리고 코드 상수로 폴백한다 (경고만 남긴다)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const resolved = resolveLegalSettings({ termsSections: [{ heading: '제 1 조' }] });

    expect(resolved.terms.sections).toEqual(TERMS.sections);
    expect(warn).toHaveBeenCalled();
  });

  it('필드가 아예 없는 것은 정상이라 경고하지 않는다 (시드 전 상태)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    resolveLegalSettings({ officerName: '홍길동' });

    expect(warn).not.toHaveBeenCalled();
  });
});

describe('resolveLegalSettings — DB 우선', () => {
  it('DB 값이 있으면 코드 상수 대신 그것을 쓴다', () => {
    const resolved = resolveLegalSettings({
      officerName: '홍길동',
      contactEmail: 'privacy@example.com',
      inquiryEmail: 'help@example.com',
      version: '2026-09-01',
    });

    expect(resolved.officerName).toBe('홍길동');
    expect(resolved.contactEmail).toBe('privacy@example.com');
    expect(resolved.inquiryEmail).toBe('help@example.com');
    expect(resolved.version).toBe('2026-09-01');
  });

  it('조항 배열을 통째로 갈아 끼울 수 있다', () => {
    const sections = [{ heading: '제 1 조 (목적)', body: '새 약관 본문' }];

    const resolved = resolveLegalSettings({ termsSections: sections });

    expect(resolved.terms.sections).toEqual(sections);
    // 제목은 앱의 메뉴 라벨이기도 해서 코드가 계속 소유한다
    expect(resolved.terms.title).toBe(TERMS.title);
  });

  it('DB가 채운 필드를 overriddenFields로 알린다', () => {
    // 화면에는 쓰지 않는다 — "바꿨는데 반영이 안 된다"를 콘솔에서 가리기 위한 값.
    const resolved = resolveLegalSettings({ officerName: '홍길동', version: '2026-09-01' });

    expect(resolved.overriddenFields).toEqual(['officerName', 'version']);
  });
});

describe('resolveLegalSettings — 처리방침 보호책임자 조항', () => {
  it('폴백 상태에서는 코드 상수의 성명·연락처가 조항에 들어간다', () => {
    const body = officerBody(resolveLegalSettings(null).privacy.sections);

    expect(body).toContain(OFFICER_NAME);
    expect(body).toContain(CONTACT_EMAIL);
  });

  it('DB의 성명·연락처가 조항 본문에 반영된다', () => {
    // 이 기능의 핵심이다 — 담당자가 바뀌었을 때 개발자 없이 고칠 수 있어야 한다.
    const body = officerBody(
      resolveLegalSettings({ officerName: '홍길동', contactEmail: 'privacy@example.com' }).privacy
        .sections
    );

    expect(body).toContain('홍길동');
    expect(body).toContain('privacy@example.com');
    expect(body).not.toContain(OFFICER_NAME);
  });

  it('조항 전문을 DB로 갈아 끼워도 보호책임자 조항은 필드에서 다시 만든다', () => {
    // 산문과 구조화 필드에 같은 사실이 두 번 적히면 한쪽만 바뀐다.
    // 필드가 정본이라는 규약을 고정한다.
    const body = officerBody(
      resolveLegalSettings({
        privacySections: [
          { heading: '1. 수집 항목', body: '새 본문' },
          { heading: '9. 개인정보 보호책임자', body: '- 성명: 옛담당자\n- 연락처: old@example.com' },
        ],
        officerName: '홍길동',
        contactEmail: 'privacy@example.com',
      }).privacy.sections
    );

    expect(body).toContain('홍길동');
    expect(body).toContain('privacy@example.com');
    expect(body).not.toContain('옛담당자');
    expect(body).not.toContain('old@example.com');
  });

  it('보호책임자 외의 조항은 DB 본문을 그대로 둔다', () => {
    const resolved = resolveLegalSettings({
      privacySections: [{ heading: '1. 수집 항목', body: '새 본문' }],
    });

    expect(resolved.privacy.sections[0].body).toBe('새 본문');
  });

  it('코드 상수의 조항 배열을 훼손하지 않는다', () => {
    // 조항을 제자리에서 고치면(mutation) 다음 해석부터 원본이 오염된다.
    resolveLegalSettings({ officerName: '홍길동' });

    expect(officerBody(PRIVACY.sections)).toContain(OFFICER_NAME);
  });
});

// ── 마케팅 수신 동의 ─────────────────────────────────────
//
// 여기서 고정하는 것은 **표시 스위치의 폴백 방향**이다. 다른 필드와 달리
// 불리언이라 "값이 없는 것"과 "false"가 다른 뜻이고, 둘을 섞으면 운영팀이
// 꺼 둔 항목이 다시 살아나거나(끄는 방법이 없어진다) 켜 둔 적 없는 항목이
// 사라진다.
describe('resolveLegalSettings — 마케팅 수신 동의', () => {
  it('문서가 없으면 코드 기본값(표시 ON)이다', () => {
    // 기존 동작이 표시 ON이므로, 시드 전 상태가 동작을 바꾸면 안 된다.
    const resolved = resolveLegalSettings(null);

    expect(resolved.marketingConsentEnabled).toBe(MARKETING_CONSENT_ENABLED_DEFAULT);
    expect(resolved.marketing.sections).toEqual(
      // 보호책임자 조항은 필드에서 다시 만들어지므로 전체 비교 대신 개수로 본다
      expect.arrayContaining([expect.objectContaining({ heading: MARKETING.sections[0].heading })])
    );
    expect(resolved.marketing.title).toBe(MARKETING.title);
  });

  it('false로 저장돼 있으면 끈다', () => {
    expect(resolveLegalSettings({ marketingConsentEnabled: false }).marketingConsentEnabled).toBe(
      false
    );
  });

  it('true로 저장돼 있으면 켠다', () => {
    expect(resolveLegalSettings({ marketingConsentEnabled: true }).marketingConsentEnabled).toBe(
      true
    );
  });

  it('불리언이 아닌 값은 무시하고 코드 기본값으로 폴백한다 (경고만 남긴다)', () => {
    // 문자열 "false"를 false로 읽어 주면 오타 하나가 조용히 반대 의미가 된다.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(resolveLegalSettings({ marketingConsentEnabled: 'false' }).marketingConsentEnabled).toBe(
      MARKETING_CONSENT_ENABLED_DEFAULT
    );
    expect(warn).toHaveBeenCalled();
  });

  it('false도 DB가 채운 값으로 알린다', () => {
    // truthy 검사로 밀어 넣으면 정작 확인이 필요한 OFF가 목록에서 사라진다.
    expect(resolveLegalSettings({ marketingConsentEnabled: false }).overriddenFields).toContain(
      'marketingConsentEnabled'
    );
  });

  it('조항 전문을 DB로 갈아 끼울 수 있다', () => {
    const sections = [{ heading: '제 1 조 (목적)', body: '새 마케팅 문안' }];

    const resolved = resolveLegalSettings({ marketingSections: sections });

    expect(resolved.marketing.sections).toEqual(sections);
    expect(resolved.overriddenFields).toContain('marketingSections');
  });

  it('마케팅 전문의 보호책임자 조항도 필드에서 다시 만든다', () => {
    // 처리방침과 같은 규약 — 담당자가 바뀌었을 때 한 문서만 갱신되면 안 된다.
    const body = officerBody(
      resolveLegalSettings({ officerName: '홍길동', contactEmail: 'privacy@example.com' }).marketing
        .sections
    );

    expect(body).toContain('홍길동');
    expect(body).toContain('privacy@example.com');
    expect(body).not.toContain(OFFICER_NAME);
  });

  it('항목을 꺼도 전문은 그대로 남는다', () => {
    // 껐다 켜는 동안 문안이 지워지면 다시 켤 때 빈 문서가 게시된다.
    const resolved = resolveLegalSettings({ marketingConsentEnabled: false });

    expect(resolved.marketing.sections.length).toBeGreaterThan(0);
  });
});

// ── 공지 해석 ────────────────────────────────────────────
describe('resolveNotice', () => {
  it('문서가 없으면 꺼진 상태다', () => {
    expect(resolveNotice(null)).toEqual({ active: false, message: '' });
  });

  it('active와 본문이 모두 있어야 켜진다', () => {
    expect(resolveNotice({ active: true, message: '점검 예정입니다.' })).toEqual({
      active: true,
      message: '점검 예정입니다.',
    });
  });

  it('본문이 비면 켜져 있어도 띄우지 않는다 (빈 배너 방지)', () => {
    expect(resolveNotice({ active: true, message: '   ' }).active).toBe(false);
    expect(resolveNotice({ active: true }).active).toBe(false);
  });

  it('active가 불리언 true가 아니면 켜지 않는다', () => {
    // 문자열 "true"·1로 켜지면 끄는 방법을 못 찾은 채 사용자 화면에 남는다.
    expect(resolveNotice({ active: 'true', message: '공지' }).active).toBe(false);
    expect(resolveNotice({ active: 1, message: '공지' }).active).toBe(false);
  });
});

// ── Mock 모드 조회 ───────────────────────────────────────
describe('fetchSettings (Mock 모드)', () => {
  it('localStorage가 비어 있으면 코드 상수로 채우고 공지는 끈다', async () => {
    await useSettingsStore.getState().fetchSettings();

    expect(useSettingsStore.getState().legal.officerName).toBe(OFFICER_NAME);
    expect(useSettingsStore.getState().notice.active).toBe(false);
    expect(useSettingsStore.getState().isLoaded).toBe(true);
  });

  it('localStorage의 값을 DB처럼 읽는다 (자격증명 없이 화면을 확인하기 위한 통로)', async () => {
    storage.set('react_settings_legal', JSON.stringify({ officerName: '홍길동' }));
    storage.set('react_settings_notice', JSON.stringify({ active: true, message: '점검 공지' }));

    await useSettingsStore.getState().fetchSettings();

    expect(useSettingsStore.getState().legal.officerName).toBe('홍길동');
    expect(useSettingsStore.getState().notice).toEqual({ active: true, message: '점검 공지' });
  });

  it('JSON이 깨져 있어도 터지지 않고 기본값으로 간다', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    storage.set('react_settings_legal', '{망가진 JSON');

    await useSettingsStore.getState().fetchSettings();

    expect(useSettingsStore.getState().legal.officerName).toBe(OFFICER_NAME);
    expect(warn).toHaveBeenCalled();
  });
});

// ── 배너 닫기 ────────────────────────────────────────────
describe('dismissNotice', () => {
  it('닫으면 그 공지 본문을 기억한다', () => {
    useSettingsStore.setState({ notice: { active: true, message: '점검 공지' } });

    useSettingsStore.getState().dismissNotice();

    expect(useSettingsStore.getState().dismissedNoticeMessage).toBe('점검 공지');
  });

  it('본문으로 기억하므로 새 공지는 다시 뜬다', () => {
    // 불리언으로 두면 한 번 닫은 사용자가 이후 어떤 공지도 못 본다.
    useSettingsStore.setState({ notice: { active: true, message: '옛 공지' } });
    useSettingsStore.getState().dismissNotice();

    useSettingsStore.setState({ notice: { active: true, message: '새 공지' } });

    expect(useSettingsStore.getState().dismissedNoticeMessage).not.toBe('새 공지');
  });
});

// ── 동의 기록 버전 ───────────────────────────────────────
describe('getLegalVersion', () => {
  it('DB version이 없으면 LEGAL_VERSION을 돌려준다', () => {
    expect(getLegalVersion()).toBe(LEGAL_VERSION);
  });

  it('DB version이 있으면 그것을 돌려준다', () => {
    useSettingsStore.setState({ legal: resolveLegalSettings({ version: '2026-09-01' }) });

    expect(getLegalVersion()).toBe('2026-09-01');
  });
});
