// src/pages/SignupPage.test.tsx
// @vitest-environment jsdom
//
// 가입 중단 확인의 **적용 범위** 계약 (2026-08-08 확정).
//
// Step 2를 통과하면 Firebase 계정이 이미 만들어져 있다. 그 상태의 ✕는
// "인증만 남은 계정을 남기고 떠난다"는 뜻이라 되묻는다. 아직 아무것도
// 만들어지지 않은 Step 1·2에서는 되묻지 않는다 — 확인 모달을 아무 데나
// 깔면 되묻는다는 신호 자체가 값을 잃는다.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';

// 스토어를 통째로 대체해 Firebase 임포트 체인을 끊는다 (LoginPage.test와 같은 방식).
const authState = vi.hoisted(() => ({
  isLoading: false,
  registerWithEmail: vi.fn(),
  checkEmailVerified: vi.fn(),
}));

vi.mock('../store/useAuthStore', () => ({
  useAuthStore: () => authState,
}));

import SignupPage from './SignupPage';
import { COPY } from '../constants/copy';
import { MARKETING } from '../constants/legal';
import { useSettingsStore, resolveLegalSettings } from '../store/useSettingsStore';

const onBack = vi.fn();

/** SignupPage는 #signup?step=N 해시로 초기 단계를 정한다 */
function renderAtStep(step: 1 | 2 | 3 | 4) {
  window.location.hash = `signup?step=${step}`;
  return render(<SignupPage onBack={onBack} onComplete={() => {}} />);
}

beforeEach(() => {
  onBack.mockClear();
  authState.registerWithEmail.mockReset();
  authState.registerWithEmail.mockResolvedValue(true);
  // 폴백 상태(= 마케팅 항목 표시 ON)로 되돌린다. 아래 OFF 테스트가 남긴
  // 설정이 다음 테스트로 새면 통과 이유를 알 수 없게 된다.
  useSettingsStore.setState({ legal: resolveLegalSettings(null) });
  const root = document.createElement('div');
  root.id = 'app-modal-root';
  document.body.appendChild(root);
});

afterEach(() => {
  cleanup();
  document.getElementById('app-modal-root')?.remove();
  window.location.hash = '';
});

describe('가입 중단 확인', () => {
  it('Step 1(입력 전)의 ✕는 되묻지 않고 즉시 나간다', async () => {
    const user = userEvent.setup();
    renderAtStep(1);

    await user.click(screen.getByRole('button', { name: '닫기' }));

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(COPY.signup.exitConfirmTitle)).not.toBeInTheDocument();
  });

  it('Step 3(계정 생성 후 인증 대기)의 ✕는 확인 모달을 거친다', async () => {
    const user = userEvent.setup();
    renderAtStep(3);

    await user.click(screen.getByRole('button', { name: '닫기' }));

    expect(screen.getByText(COPY.signup.exitConfirmTitle)).toBeInTheDocument();
    expect(onBack).not.toHaveBeenCalled();
  });

  it('Step 3에서 [나중에 하기]를 고르면 기존 이탈 경로를 탄다', async () => {
    const user = userEvent.setup();
    renderAtStep(3);

    await user.click(screen.getByRole('button', { name: '닫기' }));
    await user.click(screen.getByRole('button', { name: COPY.signup.exitConfirmExit }));

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('Step 3에서 [계속하기]를 고르면 인증 화면에 머문다', async () => {
    const user = userEvent.setup();
    renderAtStep(3);

    await user.click(screen.getByRole('button', { name: '닫기' }));
    await user.click(screen.getByRole('button', { name: COPY.signup.exitConfirmCancel }));

    expect(onBack).not.toHaveBeenCalled();
    expect(screen.queryByText(COPY.signup.exitConfirmTitle)).not.toBeInTheDocument();
    expect(screen.getByText('이메일 인증')).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────
// 인증 대기 화면의 통과 조건 (2026-08-12).
//
// 미인증 계정의 로그인을 막으면서 이 화면까지 막아 버리면 가입 자체가 불가능해진다.
// Step 3은 checkEmailVerified(auth.currentUser.reload())의 결과만 보고 진행 여부를
// 정한다는 계약을 고정해 둔다 — 차단이 이 경로를 건드리면 여기서 깨진다.
// ─────────────────────────────────────────────────────
describe('Step 3 인증 완료 확인', () => {
  it('아직 인증 전이면 안내만 띄우고 화면에 머문다', async () => {
    const user = userEvent.setup();
    authState.checkEmailVerified.mockResolvedValue(false);
    renderAtStep(3);

    await user.click(screen.getByRole('button', { name: '인증 완료 확인' }));

    expect(screen.getByText(COPY.signup.verifyIncomplete)).toBeInTheDocument();
    expect(screen.getByText('이메일 인증')).toBeInTheDocument();
  });

  it('인증이 확인되면 가입 완료 화면으로 넘어간다', async () => {
    const user = userEvent.setup();
    authState.checkEmailVerified.mockResolvedValue(true);
    renderAtStep(3);

    await user.click(screen.getByRole('button', { name: '인증 완료 확인' }));

    expect(screen.getByText('가입이 완료되었습니다!')).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────
// 마케팅 동의 항목의 표시 스위치 (settings/legal.marketingConsentEnabled).
//
// 같은 스위치를 ConsentGate가 이미 따르는데 이메일 가입 Step 1만 자기 행을
// 따로 갖고 있었다. 그대로 두면 어드민에서 껐을 때 창구마다 다른 동의를 받는
// 서비스가 된다. 여기서 고정하는 것은 ①꺼지면 화면에서 사라지고 ②그 상태의
// 기록은 무조건 false이며 ③켜져 있을 때의 기존 동작은 그대로라는 것이다.
// ─────────────────────────────────────────────────────

/** 마케팅 표시 스위치만 바꿔 끼운다 (어드민이 settings/legal에 저장한 상태를 흉내) */
const setMarketingEnabled = (enabled: boolean) =>
  useSettingsStore.setState({
    legal: resolveLegalSettings({ marketingConsentEnabled: enabled }),
  });

const checkbox = (label: string) => screen.getByRole('checkbox', { name: new RegExp(label) });
const queryCheckbox = (label: string) =>
  screen.queryByRole('checkbox', { name: new RegExp(label) });
const nextButton = () => screen.getByRole('button', { name: /다음/ });

/** Step 2(이메일·비밀번호)를 채우고 계정 생성까지 진행한다 */
async function submitStep2(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Email'), 'new@example.com');
  await user.type(screen.getByLabelText('Password'), 'abcd1234');
  await user.type(screen.getByLabelText('Confirm Password'), 'abcd1234');
  await user.click(nextButton());
}

describe('마케팅 동의 항목 표시 설정 (settings/legal.marketingConsentEnabled)', () => {
  it('켜져 있으면(기본값) 마케팅 행과 전문 보기가 함께 뜬다', () => {
    renderAtStep(1);

    expect(checkbox(COPY.consent.marketingLabel)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: COPY.consent.viewDocumentLabel(MARKETING.title) })
    ).toBeInTheDocument();
  });

  it('마케팅 전문은 ConsentGate와 같은 소스에서 열린다', async () => {
    const user = userEvent.setup();
    renderAtStep(1);

    await user.click(
      screen.getByRole('button', { name: COPY.consent.viewDocumentLabel(MARKETING.title) })
    );

    expect(screen.getByRole('heading', { name: MARKETING.title })).toBeInTheDocument();
    // 라벨 안의 버튼이라 기본 동작을 막지 않으면 열람이 곧 동의가 된다.
    expect(checkbox(COPY.consent.marketingLabel)).not.toBeChecked();
  });

  it('켜진 상태에서 체크하면 가입 기록에 true로 실린다', async () => {
    const user = userEvent.setup();
    renderAtStep(1);

    await user.click(checkbox('서비스 이용약관 동의'));
    await user.click(checkbox('개인정보 수집 및 이용 동의'));
    await user.click(checkbox(COPY.consent.marketingLabel));
    await user.click(nextButton());
    await submitStep2(user);

    expect(authState.registerWithEmail).toHaveBeenCalledWith(
      'new@example.com',
      'abcd1234',
      { marketingAgreed: true }
    );
  });

  it('끄면 마케팅 행과 전문 보기가 화면에서 사라진다', () => {
    setMarketingEnabled(false);
    renderAtStep(1);

    expect(queryCheckbox(COPY.consent.marketingLabel)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: COPY.consent.viewDocumentLabel(MARKETING.title) })
    ).not.toBeInTheDocument();
  });

  it('꺼져 있으면 "모두 동의"가 필수 2개만으로 켜진다', async () => {
    // 숨긴 항목을 조건에 남겨 두면 사용자가 못 찾을 체크를 찾게 된다.
    setMarketingEnabled(false);
    const user = userEvent.setup();
    renderAtStep(1);

    await user.click(checkbox(COPY.consent.agreeAll));

    expect(checkbox(COPY.consent.agreeAll)).toBeChecked();
    expect(nextButton()).toBeEnabled();
  });

  it('꺼진 상태의 가입 기록은 false로 고정된다', async () => {
    setMarketingEnabled(false);
    const user = userEvent.setup();
    renderAtStep(1);

    await user.click(checkbox(COPY.consent.agreeAll));
    await user.click(nextButton());
    await submitStep2(user);

    // 묻지 않은 동의를 받았다고 기록하지 않는다.
    expect(authState.registerWithEmail).toHaveBeenCalledWith(
      'new@example.com',
      'abcd1234',
      { marketingAgreed: false }
    );
  });

  it('체크한 뒤 설정이 꺼지면 그 동의는 기록되지 않는다', async () => {
    // Step 1에서 체크한 값이 컴포넌트 상태로 남아 있어도, 저장 시점의
    // 스위치가 꺼져 있으면 근거 없는 동의가 된다 (ConsentGate와 같은 규약).
    const user = userEvent.setup();
    renderAtStep(1);

    await user.click(checkbox(COPY.consent.agreeAll));
    act(() => setMarketingEnabled(false));
    await user.click(nextButton());
    await submitStep2(user);

    expect(authState.registerWithEmail).toHaveBeenCalledWith(
      'new@example.com',
      'abcd1234',
      { marketingAgreed: false }
    );
  });
});
