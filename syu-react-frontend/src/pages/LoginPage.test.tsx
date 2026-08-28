// src/pages/LoginPage.test.tsx
// @vitest-environment jsdom
//
// "가장 최근에 로그인" 말풍선의 **표시** 계약.
//
// 뱃지 문구는 두 경로가 같고 어느 버튼에 붙어 있는지가 곧 수단 표시라,
// 여기서는 aria-label(수단 명시)로 어느 쪽을 가리키는지 고정한다.
// 기록 쪽 계약은 store/useAuthStore.test.ts가 담당한다.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';

// 스토어를 통째로 대체해 Firebase 임포트 체인을 끊는다.
// LoginPage는 useAuthStore()를 셀렉터 없이 호출하므로 객체 하나면 충분하다.
const authState = vi.hoisted(() => ({
  user: null as unknown,
  isLoading: false,
  error: null as string | null,
  loginWithGoogle: vi.fn(),
  loginWithEmail: vi.fn(),
  resetPassword: vi.fn(),
  initAuthListener: vi.fn(() => () => {}),
}));

vi.mock('../store/useAuthStore', () => ({
  useAuthStore: () => authState,
}));

import LoginPage from './LoginPage';
import { COPY } from '../constants/copy';

// jsdom 환경이어도 localStorage는 전역에 실리지 않는다 — Node가 먼저
// globalThis.localStorage를 (undefined로) 선점해 vitest가 덮어쓰기를
// 건너뛴다. 다른 스토어 테스트와 같은 Map 스텁으로 대체한다.
const storage = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => void storage.set(key, value),
  removeItem: (key: string) => void storage.delete(key),
  clear: () => storage.clear(),
});

const GOOGLE_BADGE = '가장 최근에 로그인한 수단: 구글';
const EMAIL_BADGE = '가장 최근에 로그인한 수단: 이메일';

const onLoginSuccess = vi.fn();

function renderLoginPage() {
  return render(
    <LoginPage onLoginSuccess={onLoginSuccess} onBack={() => {}} onSignup={() => {}} />,
  );
}

beforeEach(() => {
  storage.clear();
  vi.clearAllMocks();
  authState.user = null;
  authState.error = null;
  authState.initAuthListener.mockReturnValue(() => {});
});

afterEach(cleanup);

describe('마지막 로그인 수단 말풍선', () => {
  it('기록이 없으면 어느 쪽에도 뱃지를 띄우지 않는다', () => {
    renderLoginPage();

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('구글로 로그인한 이력이면 구글 버튼 쪽 뱃지를 띄운다', () => {
    localStorage.setItem('react_last_login_method', 'google');

    renderLoginPage();

    expect(screen.getByRole('status', { name: GOOGLE_BADGE })).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: EMAIL_BADGE })).not.toBeInTheDocument();
  });

  it('이메일로 로그인한 이력이면 이메일 로그인 쪽 뱃지를 띄운다', () => {
    // 회귀 방지: 예전에는 이메일 수단이 기록만 되고 화면에는 구글 분기밖에
    // 없어서, 이메일 사용자에게는 뱃지가 영영 뜨지 않았다.
    localStorage.setItem('react_last_login_method', 'email');

    renderLoginPage();

    expect(screen.getByRole('status', { name: EMAIL_BADGE })).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: GOOGLE_BADGE })).not.toBeInTheDocument();
  });

  it('알 수 없는 값이 저장돼 있으면 뱃지를 띄우지 않는다', () => {
    localStorage.setItem('react_last_login_method', 'kakao');

    renderLoginPage();

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('이메일 뱃지는 이메일 로그인 버튼과 같은 폼 안에 놓인다', () => {
    localStorage.setItem('react_last_login_method', 'email');

    const { container } = renderLoginPage();

    const form = container.querySelector('form');
    const badge = screen.getByRole('status', { name: EMAIL_BADGE });
    expect(form).toContainElement(badge);
    expect(form).toContainElement(screen.getByRole('button', { name: /로그인/ }));
  });
});

// ─────────────────────────────────────────────────────
// 이메일 미인증 계정 차단의 **화면** 계약 (2026-08-12 UAT 최우선 지적).
// 차단 판단 자체는 useAuthStore가 한다(store/useAuthStore.test.ts). 여기서는
// 그 결과가 사용자에게 보이는지, 그리고 홈으로 넘어가지 않는지를 고정한다.
// ─────────────────────────────────────────────────────
describe('이메일 미인증 계정 차단 안내', () => {
  it('스토어가 미인증 에러를 올리면 폼에 안내 문구가 뜬다', () => {
    authState.error = COPY.errors.emailNotVerified;

    renderLoginPage();

    expect(screen.getByText(COPY.errors.emailNotVerified, { exact: false })).toBeInTheDocument();
  });

  it('차단된 로그인은 홈으로 넘기지 않는다', async () => {
    const user = userEvent.setup();
    // 스토어는 세션을 만들지 않고 false를 돌려준다 (미인증 차단)
    authState.loginWithEmail.mockResolvedValue(false);
    authState.user = null;

    renderLoginPage();
    await user.type(screen.getByLabelText('이메일'), 'ghost@b.com');
    await user.type(screen.getByLabelText('비밀번호'), 'password123');
    await user.click(screen.getByRole('button', { name: /로그인/ }));

    expect(authState.loginWithEmail).toHaveBeenCalledWith('ghost@b.com', 'password123');
    expect(onLoginSuccess).not.toHaveBeenCalled();
  });

  it('인증이 끝난 계정은 기존대로 홈으로 넘어간다 (회귀 방지)', () => {
    authState.user = { uid: 'u-1', emailVerified: true };

    renderLoginPage();

    expect(onLoginSuccess).toHaveBeenCalled();
  });
});
