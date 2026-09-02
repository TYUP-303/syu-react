// src/store/useAuthStore.test.ts
// @vitest-environment jsdom
//
// "마지막 로그인 수단" 기록 계약을 고정한다.
//
// 이 뱃지는 이메일 · 구글 두 경로가 **대칭**이어야 의미가 있다. 예전에는
// 스토어가 두 경로 모두 기록하는데 로그인 화면이 구글만 표시해서, 이메일
// 사용자에게는 뱃지가 영영 뜨지 않았다(LoginPage.test.tsx가 표시 쪽을,
// 이 파일이 기록 쪽을 고정한다).
//
// Firebase Auth는 통째로 모킹한다 — 여기서 검증하는 것은 네트워크가 아니라
// "성공했을 때만 기록한다"는 분기다.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// jsdom 환경이어도 localStorage는 전역에 실리지 않는다 — Node가 먼저
// globalThis.localStorage를 (undefined로) 선점해 vitest가 덮어쓰기를
// 건너뛴다. 다른 스토어 테스트와 같은 Map 스텁으로 대체한다.
//
// 스텁은 **import보다 먼저** 꽂혀야 한다. useAuthStore의 persist 미들웨어가
// 모듈 초기화 시점에 localStorage를 붙잡기 때문에, 나중에 스텁하면
// setState 한 번에 터진다. 그래서 vi.hoisted 안에서 등록한다.
const storage = vi.hoisted(() => {
  const map = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    clear: () => map.clear(),
  });
  return map;
});

const mocks = vi.hoisted(() => ({
  // auth 객체는 테스트가 currentUser를 갈아 끼울 수 있도록 참조를 유지한다
  // (checkEmailVerified가 reload() 후 auth.currentUser를 다시 읽기 때문).
  auth: { currentUser: null as any },
  signInWithGoogle: vi.fn(),
  signOutUser: vi.fn(),
  syncUserToFirestore: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  sendEmailVerification: vi.fn(),
  onAuthStateChanged: vi.fn(() => () => {}),
}));

vi.mock('../api/firebase', () => ({
  auth: mocks.auth,
  signInWithGoogle: mocks.signInWithGoogle,
  signOutUser: mocks.signOutUser,
  syncUserToFirestore: mocks.syncUserToFirestore,
}));

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: mocks.onAuthStateChanged,
  signInWithEmailAndPassword: mocks.signInWithEmailAndPassword,
  createUserWithEmailAndPassword: mocks.createUserWithEmailAndPassword,
  sendEmailVerification: mocks.sendEmailVerification,
  sendPasswordResetEmail: vi.fn(),
  deleteUser: vi.fn(),
}));

// GA4 계측 래퍼는 모킹해 호출만 관찰한다 — 실제 firebase/analytics 모듈이 jsdom에
// 로드되는 것을 피하고, errorCode는 실제 구현을 그대로 통과시킨다(코드 추출 검증).
const analyticsMocks = vi.hoisted(() => ({ trackEvent: vi.fn() }));
vi.mock('../api/analytics', () => ({
  trackEvent: analyticsMocks.trackEvent,
  errorCode: (err: unknown) => (err as { code?: string })?.code ?? 'unknown',
}));

import { useAuthStore } from './useAuthStore';
import { getLastLoginMethod } from '../utils/lastLoginMethod';
import { COPY } from '../constants/copy';

/** 이메일 인증까지 끝난 정상 계정 */
const FAKE_USER = {
  uid: 'u-1', email: 'a@b.com', displayName: '테스터', photoURL: null,
  emailVerified: true,
  providerData: [{ providerId: 'password' }],
};

/** 인증 메일만 받고 이탈한 계정 — 이번 수정의 차단 대상 */
const UNVERIFIED_USER = {
  uid: 'u-2', email: 'ghost@b.com', displayName: null, photoURL: null,
  emailVerified: false,
  providerData: [{ providerId: 'password' }],
};

beforeEach(() => {
  storage.clear();
  vi.clearAllMocks();
  analyticsMocks.trackEvent.mockClear();
  mocks.auth.currentUser = null;
  mocks.syncUserToFirestore.mockResolvedValue(undefined);
  mocks.signOutUser.mockResolvedValue(undefined);
  useAuthStore.setState({ user: null, isLoading: false, error: null });
});

describe('구글 로그인의 마지막 수단 기록', () => {
  it('성공하면 google로 기록한다', async () => {
    mocks.signInWithGoogle.mockResolvedValue({ user: FAKE_USER });

    await useAuthStore.getState().loginWithGoogle();

    expect(getLastLoginMethod()).toBe('google');
    expect(useAuthStore.getState().user).toEqual(FAKE_USER);
  });

  it('실패하면 기록하지 않고 직전 값을 그대로 둔다', async () => {
    mocks.signInWithGoogle.mockResolvedValue({ user: FAKE_USER });
    await useAuthStore.getState().loginWithGoogle();

    mocks.signInWithGoogle.mockRejectedValue({ code: 'auth/invalid-credential' });
    await useAuthStore.getState().loginWithGoogle();

    expect(getLastLoginMethod()).toBe('google');
    expect(useAuthStore.getState().error).toBeTruthy();
  });
});

describe('이메일 로그인의 마지막 수단 기록', () => {
  it('성공하면 email로 기록한다', async () => {
    mocks.signInWithEmailAndPassword.mockResolvedValue({ user: FAKE_USER });

    const ok = await useAuthStore.getState().loginWithEmail('a@b.com', 'pw');

    expect(ok).toBe(true);
    expect(getLastLoginMethod()).toBe('email');
  });

  it('실패하면 기록하지 않는다', async () => {
    mocks.signInWithEmailAndPassword.mockRejectedValue({ code: 'auth/invalid-credential' });

    const ok = await useAuthStore.getState().loginWithEmail('a@b.com', 'wrong');

    expect(ok).toBe(false);
    expect(getLastLoginMethod()).toBeNull();
  });

  it('구글 → 이메일 순으로 로그인하면 마지막 값인 email이 남는다', async () => {
    mocks.signInWithGoogle.mockResolvedValue({ user: FAKE_USER });
    mocks.signInWithEmailAndPassword.mockResolvedValue({ user: FAKE_USER });

    await useAuthStore.getState().loginWithGoogle();
    await useAuthStore.getState().loginWithEmail('a@b.com', 'pw');

    expect(getLastLoginMethod()).toBe('email');
  });
});

describe('이메일 회원가입의 마지막 수단 기록', () => {
  it('가입 성공도 email로 기록한다 (가입 직후는 이메일 인증 상태)', async () => {
    mocks.createUserWithEmailAndPassword.mockResolvedValue({ user: FAKE_USER });
    mocks.sendEmailVerification.mockResolvedValue(undefined);

    const ok = await useAuthStore.getState().registerWithEmail('a@b.com', 'pw');

    expect(ok).toBe(true);
    expect(getLastLoginMethod()).toBe('email');
  });

  it('가입 실패는 기록하지 않는다', async () => {
    mocks.createUserWithEmailAndPassword.mockRejectedValue({ code: 'auth/email-already-in-use' });

    const ok = await useAuthStore.getState().registerWithEmail('a@b.com', 'pw');

    expect(ok).toBe(false);
    expect(getLastLoginMethod()).toBeNull();
  });
});

// ─────────────────────────────────────────────────────
// 인증 메일 발송 실패는 '가입 실패'가 아니다 (2026-09-02)
//
// createUserWithEmailAndPassword가 계정을 이미 만든 뒤 sendEmailVerification이
// 실패하면(예: 인증 메일 rate limit, 인앱 브라우저 네트워크), 예전에는 catch로
// 떨어져 가입 전체가 false가 됐다. 그러나 계정은 롤백되지 않으므로 "화면엔 실패,
// 서버엔 고아 계정"이라는 모순이 남았다(김영원 선생님 신고 · users 문서는 정상
// 생성되어 있었음). 메일 발송은 재발송으로 복구 가능한 별개 단계이므로, 가입
// 성사 여부를 여기에 묶지 않는다.
// ─────────────────────────────────────────────────────
describe('인증 메일 발송 실패 처리', () => {
  it('메일 발송이 실패해도 가입은 성공으로 처리하고 계정을 유지한다', async () => {
    mocks.createUserWithEmailAndPassword.mockResolvedValue({ user: UNVERIFIED_USER });
    mocks.sendEmailVerification.mockRejectedValue({ code: 'auth/too-many-requests' });

    const ok = await useAuthStore.getState().registerWithEmail('ghost@b.com', 'pw');

    // 계정은 이미 만들어졌다 → 가입은 성사, Step 3(인증 대기)으로 넘어간다
    expect(ok).toBe(true);
    expect(mocks.syncUserToFirestore).toHaveBeenCalledTimes(1);
    expect(getLastLoginMethod()).toBe('email');
    // 미인증이므로 앱 세션은 여전히 비운다 (기존 차단 계약 유지)
    expect(useAuthStore.getState().user).toBeNull();
    // 서버에 안 남는 실패를 GA4 이벤트로 남긴다 (원인 코드 포함)
    expect(analyticsMocks.trackEvent).toHaveBeenCalledWith(
      'signup_verification_email_failed',
      { reason: 'auth/too-many-requests' }
    );
  });

  it('계정 생성 실패는 signup_failed 이벤트로 남긴다', async () => {
    mocks.createUserWithEmailAndPassword.mockRejectedValue({ code: 'auth/email-already-in-use' });

    await useAuthStore.getState().registerWithEmail('a@b.com', 'pw');

    expect(analyticsMocks.trackEvent).toHaveBeenCalledWith(
      'signup_failed',
      { reason: 'auth/email-already-in-use' }
    );
  });
});

// ─────────────────────────────────────────────────────
// 인증 메일 재발송 — 발송이 실패했거나 유저가 메일을 못 받았을 때의 복구 창구.
// Step 3(인증 대기)에서 호출한다. 세션은 살아 있으므로 auth.currentUser로 보낸다.
// ─────────────────────────────────────────────────────
describe('인증 메일 재발송', () => {
  it('현재 세션 유저에게 인증 메일을 다시 보낸다', async () => {
    mocks.auth.currentUser = { ...UNVERIFIED_USER };
    mocks.sendEmailVerification.mockResolvedValue(undefined);

    const ok = await useAuthStore.getState().resendVerificationEmail();

    expect(ok).toBe(true);
    expect(mocks.sendEmailVerification).toHaveBeenCalledTimes(1);
  });

  it('로그인된 세션이 없으면 보내지 않는다', async () => {
    mocks.auth.currentUser = null;

    const ok = await useAuthStore.getState().resendVerificationEmail();

    expect(ok).toBe(false);
    expect(mocks.sendEmailVerification).not.toHaveBeenCalled();
  });

  it('발송이 rate limit에 걸리면 정확한 원인 문구를 error에 담는다', async () => {
    mocks.auth.currentUser = { ...UNVERIFIED_USER };
    mocks.sendEmailVerification.mockRejectedValue({ code: 'auth/too-many-requests' });

    const ok = await useAuthStore.getState().resendVerificationEmail();

    expect(ok).toBe(false);
    expect(useAuthStore.getState().error).toBe(COPY.errors.auth.tooManyRequests);
  });
});

// ─────────────────────────────────────────────────────
// 이메일 미인증 계정 차단 (2026-08-12 UAT 최우선 지적)
//
// createUserWithEmailAndPassword가 계정을 즉시 만들고 로그인까지 시키기 때문에,
// 인증 메일만 받아 놓고 이탈해도 그 계정으로 다시 들어와졌다. 차단은 Firebase
// 세션이 아니라 **앱 세션(store.user)** 에 건다 — 가입 플로우 Step 3이
// auth.currentUser.reload()로 인증을 확인하므로 세션 자체는 살아 있어야 한다.
// ─────────────────────────────────────────────────────
describe('이메일 미인증 계정 차단', () => {
  it('미인증 계정으로 로그인하면 실패하고 세션을 즉시 끊는다', async () => {
    mocks.signInWithEmailAndPassword.mockResolvedValue({ user: UNVERIFIED_USER });

    const ok = await useAuthStore.getState().loginWithEmail('ghost@b.com', 'pw');

    expect(ok).toBe(false);
    expect(mocks.signOutUser).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().error).toBe(COPY.errors.emailNotVerified);
    // 차단된 시도는 '마지막 로그인 수단'에도 남지 않는다 (성공한 적이 없다)
    expect(getLastLoginMethod()).toBeNull();
    expect(mocks.syncUserToFirestore).not.toHaveBeenCalled();
  });

  it('인증을 마친 계정은 그대로 로그인된다', async () => {
    mocks.signInWithEmailAndPassword.mockResolvedValue({ user: FAKE_USER });

    const ok = await useAuthStore.getState().loginWithEmail('a@b.com', 'pw');

    expect(ok).toBe(true);
    expect(mocks.signOutUser).not.toHaveBeenCalled();
    expect(useAuthStore.getState().user).toEqual(FAKE_USER);
  });

  it('구글 계정은 emailVerified 여부와 무관하게 통과한다 (회귀 방지)', async () => {
    // 구글 계정은 Firebase가 항상 emailVerified=true로 주지만, 이 차단이
    // 제공자를 가리지 않고 걸리면 구글 로그인이 통째로 막힌다.
    const googleUser = {
      uid: 'g-1', email: 'g@b.com', displayName: '구글', photoURL: null,
      emailVerified: false,
      providerData: [{ providerId: 'google.com' }],
    };
    mocks.signInWithGoogle.mockResolvedValue({ user: googleUser });

    await useAuthStore.getState().loginWithGoogle();

    expect(useAuthStore.getState().user).toEqual(googleUser);
    expect(useAuthStore.getState().error).toBeNull();
    expect(mocks.signOutUser).not.toHaveBeenCalled();
  });

  it('가입 직후에는 계정만 만들고 앱 세션은 주지 않는다', async () => {
    mocks.createUserWithEmailAndPassword.mockResolvedValue({ user: UNVERIFIED_USER });
    mocks.sendEmailVerification.mockResolvedValue(undefined);

    const ok = await useAuthStore.getState().registerWithEmail('ghost@b.com', 'pw');

    expect(ok).toBe(true); // 가입 자체는 성공 → Step 3(인증 대기)으로 넘어간다
    expect(useAuthStore.getState().user).toBeNull();
    // 가입 플로우가 계속 돌아가야 하므로 Firebase 세션은 끊지 않는다
    expect(mocks.signOutUser).not.toHaveBeenCalled();
    expect(mocks.sendEmailVerification).toHaveBeenCalledTimes(1);
  });

  it('인증 확인 버튼은 아직 미인증이면 세션을 올리지 않는다', async () => {
    mocks.auth.currentUser = { ...UNVERIFIED_USER, reload: vi.fn().mockResolvedValue(undefined) };

    const verified = await useAuthStore.getState().checkEmailVerified();

    expect(verified).toBe(false);
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('인증이 확인되는 순간 그 액션이 앱 세션을 채운다', async () => {
    // reload()가 서버 상태를 받아 오면 auth.currentUser가 인증된 객체로 바뀐다.
    const verifiedUser = { ...UNVERIFIED_USER, emailVerified: true };
    mocks.auth.currentUser = {
      ...UNVERIFIED_USER,
      reload: vi.fn().mockImplementation(async () => {
        mocks.auth.currentUser = verifiedUser;
      }),
    };

    const verified = await useAuthStore.getState().checkEmailVerified();

    expect(verified).toBe(true);
    expect(useAuthStore.getState().user).toEqual(verifiedUser);
  });
});

describe('세션 복원 리스너의 미인증 차단', () => {
  /** initAuthListener가 onAuthStateChanged에 넘긴 콜백을 꺼낸다 */
  function captureListener() {
    useAuthStore.getState().initAuthListener();
    const call = mocks.onAuthStateChanged.mock.calls[0] as unknown as [unknown, (u: unknown) => void];
    return call[1];
  }

  it('새로고침으로 복원된 미인증 세션은 앱에 올리지 않는다', () => {
    const onUser = captureListener();

    onUser(UNVERIFIED_USER);

    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().isLoading).toBe(false);
  });

  it('미인증이어도 signOut까지 하지는 않는다 (가입 중 인증 대기 화면 보존)', () => {
    // Step 3은 이 세션 위에서 reload()를 돌린다. 리스너가 세션을 끊어 버리면
    // "인증 완료 확인" 버튼이 아무 것도 못 하는 상태가 된다.
    const onUser = captureListener();

    onUser(UNVERIFIED_USER);

    expect(mocks.signOutUser).not.toHaveBeenCalled();
  });

  it('인증된 세션은 그대로 복원한다', () => {
    const onUser = captureListener();

    onUser(FAKE_USER);

    expect(useAuthStore.getState().user).toEqual(FAKE_USER);
  });

  it('로그아웃(null) 통지는 그대로 반영한다', () => {
    const onUser = captureListener();

    onUser(FAKE_USER);
    onUser(null);

    expect(useAuthStore.getState().user).toBeNull();
  });
});

describe('저장 값 파싱', () => {
  it('알 수 없는 문자열이 들어 있으면 null로 취급한다 (뱃지 미표시)', () => {
    localStorage.setItem('react_last_login_method', 'kakao');
    expect(getLastLoginMethod()).toBeNull();
  });
});
