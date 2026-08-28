// src/components/common/ConsentGate.test.tsx
// @vitest-environment jsdom
//
// 동의 화면의 계약:
//   1) 필수 2개를 모두 체크하기 전에는 [동의하고 시작하기]가 눌리지 않는다.
//   2) 둘 다 체크하면 활성화되고, 누르면 동의 기록 함수가 uid와 함께 호출된다.
//   3) 선택 항목(마케팅)은 활성화 조건이 아니지만 기록에는 실린다.
//   4) 전문 열람은 동의가 아니다 — 화살표를 눌러도 체크가 되면 안 된다.
//   5) 거부는 로그아웃으로 이어진다 (확인 한 단계를 거친다).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';

// localStorage 스텁은 import보다 먼저 꽂혀야 한다 — useAuthStore의 persist
// 미들웨어가 모듈 초기화 시점에 붙잡기 때문이다. (jsdom 환경이어도 Node가
// globalThis.localStorage를 undefined로 선점해 vitest가 덮어쓰기를 건너뛴다.)
vi.hoisted(() => {
  const map = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    clear: () => map.clear(),
  });
});

vi.mock('../../api/env', () => ({ IS_MOCK_MODE: true }));
vi.mock('../../api/firebase', () => ({
  db: {},
  auth: { currentUser: null },
  signInWithGoogle: vi.fn(),
  signOutUser: vi.fn(),
  syncUserToFirestore: vi.fn(),
  deleteUserDoc: vi.fn(),
}));

import { useAuthStore } from '../../store/useAuthStore';
import { useConsentStore } from '../../store/useConsentStore';
import { useSettingsStore, resolveLegalSettings } from '../../store/useSettingsStore';
import { COPY } from '../../constants/copy';
import { TERMS, PRIVACY, MARKETING } from '../../constants/legal';
import ConsentGate from './ConsentGate';

const UID = 'uid-consent-test';

const saveConsent = vi.fn(async () => true);
const logout = vi.fn(async () => {});

beforeEach(() => {
  saveConsent.mockClear();
  saveConsent.mockImplementation(async () => true);
  logout.mockClear();

  // 포털 타깃 — 실제로는 MobileWrapper가 소유한다.
  const root = document.createElement('div');
  root.id = 'app-modal-root';
  document.body.appendChild(root);

  useAuthStore.setState({ user: { uid: UID } as never, logout });
  useConsentStore.setState({ saveConsent, isSaving: false, status: 'missing' });
  // 폴백 상태(= 마케팅 항목 표시 ON)로 되돌린다. 아래 OFF 테스트가 남긴
  // 설정이 다음 테스트로 새면 통과 이유를 알 수 없게 된다.
  useSettingsStore.setState({ legal: resolveLegalSettings(null) });
});

/** 마케팅 표시 스위치만 바꿔 끼운다 (어드민이 settings/legal에 저장한 상태를 흉내) */
const setMarketingEnabled = (enabled: boolean) =>
  useSettingsStore.setState({
    legal: resolveLegalSettings({ marketingConsentEnabled: enabled }),
  });

afterEach(() => {
  cleanup();
  document.getElementById('app-modal-root')?.remove();
});

const submitButton = () => screen.getByRole('button', { name: COPY.consent.submit });
const checkbox = (label: string) => screen.getByRole('checkbox', { name: new RegExp(label) });

describe('약관 동의 게이트', () => {
  it('아무것도 체크하지 않으면 시작 버튼이 비활성이다', () => {
    render(<ConsentGate />);

    expect(submitButton()).toBeDisabled();
  });

  it('필수 하나만 체크해도 여전히 비활성이다', async () => {
    const user = userEvent.setup();
    render(<ConsentGate />);

    await user.click(checkbox(COPY.consent.termsLabel));

    expect(submitButton()).toBeDisabled();
  });

  // 정보통신망법 제50조는 '무엇을' 뿐 아니라 '어떤 수단으로' 받는지에 동의를
  // 받도록 한다. 라벨에서 매체가 빠지면 동의를 받고도 근거가 부족해지므로,
  // 문구를 다듬다가 매체 표기가 사라지는 것을 여기서 막는다.
  it('마케팅 동의 라벨이 전송 매체(이메일)를 밝힌다', () => {
    render(<ConsentGate />);

    expect(COPY.consent.marketingLabel).toMatch(/이메일/);
    expect(checkbox(COPY.consent.marketingLabel)).toBeInTheDocument();
  });

  it('선택 항목만 체크해서는 활성화되지 않는다', async () => {
    const user = userEvent.setup();
    render(<ConsentGate />);

    await user.click(checkbox(COPY.consent.marketingLabel));

    expect(submitButton()).toBeDisabled();
  });

  it('필수 2개를 모두 체크하면 활성화된다', async () => {
    const user = userEvent.setup();
    render(<ConsentGate />);

    await user.click(checkbox(COPY.consent.termsLabel));
    await user.click(checkbox(COPY.consent.privacyLabel));

    expect(submitButton()).toBeEnabled();
  });

  it('동의하면 현재 uid로 기록 함수를 호출한다', async () => {
    const user = userEvent.setup();
    render(<ConsentGate />);

    await user.click(checkbox(COPY.consent.termsLabel));
    await user.click(checkbox(COPY.consent.privacyLabel));
    await user.click(submitButton());

    expect(saveConsent).toHaveBeenCalledWith(UID, { marketingAgreed: false });
  });

  it('마케팅에 동의하면 그 값도 함께 실어 보낸다', async () => {
    const user = userEvent.setup();
    render(<ConsentGate />);

    await user.click(checkbox(COPY.consent.termsLabel));
    await user.click(checkbox(COPY.consent.privacyLabel));
    await user.click(checkbox(COPY.consent.marketingLabel));
    await user.click(submitButton());

    expect(saveConsent).toHaveBeenCalledWith(UID, { marketingAgreed: true });
  });

  it('"모두 동의"로 한 번에 켜고 끌 수 있다', async () => {
    const user = userEvent.setup();
    render(<ConsentGate />);

    await user.click(checkbox(COPY.consent.agreeAll));
    expect(checkbox(COPY.consent.termsLabel)).toBeChecked();
    expect(checkbox(COPY.consent.marketingLabel)).toBeChecked();

    await user.click(checkbox(COPY.consent.agreeAll));
    expect(checkbox(COPY.consent.termsLabel)).not.toBeChecked();
    expect(submitButton()).toBeDisabled();
  });

  it('저장에 실패하면 알림을 띄운다 (기록 없이 통과시키지 않는다)', async () => {
    saveConsent.mockImplementation(async () => false);
    const user = userEvent.setup();
    render(<ConsentGate />);

    await user.click(checkbox(COPY.consent.termsLabel));
    await user.click(checkbox(COPY.consent.privacyLabel));
    await user.click(submitButton());

    expect(await screen.findByText(COPY.errors.consentSaveFailed)).toBeInTheDocument();
  });
});

describe('전문 열람', () => {
  it('이용약관 화살표를 누르면 전문이 열린다', async () => {
    const user = userEvent.setup();
    render(<ConsentGate />);

    await user.click(
      screen.getByRole('button', { name: COPY.consent.viewDocumentLabel(TERMS.title) })
    );

    // 시트 제목으로 확인한다 — 조항은 heading과 body가 한 <p> 안에 함께
    // 들어가므로 조항 제목만으로는 getByText가 잡지 못한다.
    expect(screen.getByRole('heading', { name: TERMS.title })).toBeInTheDocument();
  });

  it('개인정보 처리방침 화살표를 누르면 전문이 열린다', async () => {
    const user = userEvent.setup();
    render(<ConsentGate />);

    await user.click(
      screen.getByRole('button', { name: COPY.consent.viewDocumentLabel(PRIVACY.title) })
    );

    expect(screen.getByRole('heading', { name: PRIVACY.title })).toBeInTheDocument();
  });

  it('마케팅 수신 동의 화살표를 누르면 전문이 열린다', async () => {
    const user = userEvent.setup();
    render(<ConsentGate />);

    await user.click(
      screen.getByRole('button', { name: COPY.consent.viewDocumentLabel(MARKETING.title) })
    );

    expect(screen.getByRole('heading', { name: MARKETING.title })).toBeInTheDocument();
  });

  it('열기 전에는 전문이 떠 있지 않다', () => {
    render(<ConsentGate />);

    expect(screen.queryByRole('heading', { name: TERMS.title })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: PRIVACY.title })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: MARKETING.title })).not.toBeInTheDocument();
  });

  it('전문을 열어도 동의 체크가 켜지지 않는다', async () => {
    // 라벨 안에 버튼이 들어 있어, 기본 동작을 막지 않으면 열람이 곧 동의가 된다.
    const user = userEvent.setup();
    render(<ConsentGate />);

    await user.click(
      screen.getByRole('button', { name: COPY.consent.viewDocumentLabel(TERMS.title) })
    );

    expect(checkbox(COPY.consent.termsLabel)).not.toBeChecked();
    expect(submitButton()).toBeDisabled();
  });
});

// 서비스에 마케팅 동의가 필요한지가 미정이라, 항목을 넣고 빼는 판단을
// 운영팀이 어드민에서 한다. 여기서 고정하는 것은 **끄더라도 필수 동의
// 절차가 그대로여야 한다**는 것이다 — 선택 항목 하나가 게이트를 막으면
// 사용자는 서비스에 들어올 방법이 없다.
describe('마케팅 항목 표시 설정 (settings/legal.marketingConsentEnabled)', () => {
  it('끄면 마케팅 행이 화면에서 사라진다', () => {
    setMarketingEnabled(false);
    render(<ConsentGate />);

    expect(
      screen.queryByRole('checkbox', { name: new RegExp(COPY.consent.marketingLabel) })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: COPY.consent.viewDocumentLabel(MARKETING.title) })
    ).not.toBeInTheDocument();
  });

  it('꺼져 있어도 필수 2개만으로 동의를 마칠 수 있다', async () => {
    setMarketingEnabled(false);
    const user = userEvent.setup();
    render(<ConsentGate />);

    await user.click(checkbox(COPY.consent.termsLabel));
    await user.click(checkbox(COPY.consent.privacyLabel));

    expect(submitButton()).toBeEnabled();
    await user.click(submitButton());
    // 묻지 않은 동의를 받았다고 기록하지 않는다.
    expect(saveConsent).toHaveBeenCalledWith(UID, { marketingAgreed: false });
  });

  it('꺼져 있으면 "모두 동의"가 필수 2개만으로 켜진다', async () => {
    // 숨긴 항목을 조건에 남겨 두면 사용자가 못 찾을 체크를 찾게 된다.
    setMarketingEnabled(false);
    const user = userEvent.setup();
    render(<ConsentGate />);

    await user.click(checkbox(COPY.consent.agreeAll));

    expect(checkbox(COPY.consent.agreeAll)).toBeChecked();
    expect(submitButton()).toBeEnabled();
  });

  it('켜면 다시 나타난다 (기본값도 켜짐)', () => {
    setMarketingEnabled(true);
    render(<ConsentGate />);

    expect(
      screen.getByRole('checkbox', { name: new RegExp(COPY.consent.marketingLabel) })
    ).toBeInTheDocument();
  });
});

describe('동의 거부', () => {
  it('거부는 확인 한 단계를 거쳐 로그아웃으로 이어진다', async () => {
    const user = userEvent.setup();
    render(<ConsentGate />);

    await user.click(screen.getByRole('button', { name: COPY.consent.decline }));
    expect(screen.getByText(COPY.consent.declineTitle)).toBeInTheDocument();
    expect(logout).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: COPY.consent.declineExit }));

    expect(logout).toHaveBeenCalled();
  });

  it('확인에서 물러나면 로그아웃하지 않는다', async () => {
    const user = userEvent.setup();
    render(<ConsentGate />);

    await user.click(screen.getByRole('button', { name: COPY.consent.decline }));
    await user.click(screen.getByRole('button', { name: COPY.consent.declineCancel }));

    expect(logout).not.toHaveBeenCalled();
  });
});
