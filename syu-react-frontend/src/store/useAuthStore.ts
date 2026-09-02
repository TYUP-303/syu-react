// src/store/useAuthStore.ts
// Zustand 기반 인증 상태 관리 스토어

import { create } from 'zustand';
import { persist, devtools } from 'zustand/middleware';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth, signInWithGoogle, signOutUser, syncUserToFirestore } from '../api/firebase';
// 문서 스토어를 세션 스토어가 부르는 방향은 이쪽 하나뿐이다 (동의 기록).
// useConsentStore는 useAuthStore를 알지 못하므로 순환 참조가 아니다.
import { useConsentStore } from './useConsentStore';
import { COPY } from '../constants/copy';
import { rememberLastLoginMethod } from '../utils/lastLoginMethod';
// 백엔드가 없어 실패가 서버에 남지 않으므로, 가입/재발송 실패를 GA4 이벤트로
// 남겨 시각별 진단을 가능하게 한다 (api/analytics.ts의 배경 주석 참조).
import { trackEvent, errorCode } from '../api/analytics';

// ⚠️ 의도된 예외: 이 스토어만 공용 플래그(IS_MOCK_MODE, src/api/env.ts)를 따르지 않습니다.
//
// 팀장님 요청으로 Auth의 Mock 경로를 걷어내고 항상 실제 Firebase Auth를 사용하도록
// 명시적으로 false 처리한 상태입니다. IS_MOCK_MODE로 교체하면 동작이 바뀌므로
// 변경 전 반드시 팀 합의를 거치세요.
//
// 부작용: VITE_FIREBASE_API_KEY가 없는 환경(신규 세팅 등)에서는 로그인만 실패하고
// 캐릭터/검사/시나리오는 localStorage Mock으로 정상 동작합니다. 원인 추적 시 참고.
const isMockMode = false;

// ─── Firebase 에러 메시지 한글 변환 헬퍼 ───────────────────
function getAuthErrorMessage(err: any, defaultMsg: string): string {
  if (err && err.code) {
    switch (err.code) {
      case 'auth/invalid-credential':
        return COPY.errors.auth.invalidCredential;
      case 'auth/invalid-email':
        return COPY.errors.auth.invalidEmail;
      case 'auth/user-disabled':
        return COPY.errors.auth.userDisabled;
      case 'auth/email-already-in-use':
        return COPY.errors.auth.emailAlreadyInUse;
      case 'auth/weak-password':
        return COPY.errors.auth.weakPassword;
      case 'auth/too-many-requests':
        return COPY.errors.auth.tooManyRequests;
      case 'auth/requires-recent-login':
        return COPY.errors.auth.requiresRecentLogin;
      case 'auth/network-request-failed':
        return COPY.errors.auth.networkRequestFailed;
      default:
        return defaultMsg;
    }
  }
  return err instanceof Error ? err.message : defaultMsg;
}

// ─── 이메일 미인증 계정 차단 ───────────────────────────
//
// createUserWithEmailAndPassword는 계정을 **즉시** 만들고 그 자리에서 로그인까지
// 시켜 버린다. 그래서 인증 메일만 받아 놓고 창을 닫아도 계정은 남고, 그 계정으로
// 다시 로그인하면 아무 제지 없이 들어와졌다 (2026-08-12 UAT 최우선 지적).
//
// 차단은 **Firebase 세션이 아니라 앱 세션(store.user)** 에 건다. 가입 플로우
// Step 3은 auth.currentUser.reload()로 인증 여부를 확인하므로 Firebase 세션까지
// 끊으면 "인증 완료 확인" 버튼이 죽는다. user만 비워 두면 App.tsx의 라우팅 가드가
// 홈 진입을 막으면서도 reload()는 그대로 동작한다.
//
// 구글 계정은 emailVerified가 항상 true라 애초에 걸리지 않지만, persist 복원본처럼
// providerData가 없는 객체를 잘못 잠그지 않도록 제공자를 명시적으로 확인한다.
function isUnverifiedEmailUser(user: User | null): boolean {
  if (!user) return false;
  if (user.emailVerified) return false;

  const providers = user.providerData ?? [];
  if (providers.length === 0) {
    // persist에서 복원된 축약 객체 — 저장해 둔 emailVerified가 명시적으로
    // false일 때만 차단한다 (필드가 없는 구버전 저장분은 리스너가 정리한다).
    return user.emailVerified === false;
  }
  return providers.some((provider) => provider?.providerId === 'password');
}

// ─── 타입 정의 ────────────────────────────────────────
interface AuthState {
  /** 현재 로그인된 Firebase User 객체 (미로그인 시 null) */
  user: User | null;
  /** 로그인 / 세션 복원 로딩 상태 */
  isLoading: boolean;
  /** 에러 메시지 */
  error: string | null;

  // ── Actions ──────────────────────────────────────────
  /** 에러 메시지를 초기화합니다 */
  clearError: () => void;
  /** Google 팝업 로그인을 실행합니다 */
  loginWithGoogle: () => Promise<void>;
  /** 이메일/비밀번호로 개발자 로그인 바이패스를 실행합니다 */
  loginWithEmail: (email: string, password: string) => Promise<boolean>;
  /**
   * 이메일/비밀번호로 회원가입을 실행합니다.
   *
   * consent를 주면 계정 생성 직후 users/{uid}.termsConsent에 동의 기록을
   * 남깁니다 (가입 Step 1에서 받은 체크 결과). 주지 않으면 기록하지 않으며,
   * 그 계정은 다음 진입에서 App의 동의 게이트를 만납니다.
   */
  registerWithEmail: (
    email: string,
    password: string,
    consent?: { marketingAgreed: boolean }
  ) => Promise<boolean>;
  /** 비밀번호 재설정 이메일을 발송합니다 */
  resetPassword: (email: string) => Promise<boolean>;
  /**
   * 가입 중인 계정에 인증 메일을 다시 발송합니다 (Step 3의 재발송 창구).
   *
   * 최초 발송이 실패했거나(rate limit·인앱 브라우저 네트워크) 유저가 메일을
   * 받지 못했을 때 복구 수단입니다. 계정은 이미 만들어져 있고 Firebase 세션도
   * 살아 있으므로 auth.currentUser로 보냅니다.
   */
  resendVerificationEmail: () => Promise<boolean>;
  /** 현재 로그인된 유저의 이메일 인증 상태를 확인하고 갱신합니다 */
  checkEmailVerified: () => Promise<boolean>;
  /** 로그아웃을 실행합니다 */
  logout: () => Promise<void>;
  /** 현재 로그인된 계정을 탈퇴(삭제)합니다 */
  deleteAccount: () => Promise<boolean>;
  /** Firebase onAuthStateChanged 리스너를 초기화합니다 (App 마운트 시 1회 호출) */
  initAuthListener: () => () => void;
}
// ─── Zustand 스토어 ───────────────────────────────────
export const useAuthStore = create<AuthState>()(
  devtools(
    persist(
      (set) => ({
        user:      null,
        isLoading: true, // 초기에는 세션 복원 중
        error:     null,

        clearError: () => set({ error: null }),

        loginWithGoogle: async () => {
          set({ isLoading: true, error: null });

          if (isMockMode) {
            // Mock 로그인 시뮬레이션
            await new Promise((resolve) => setTimeout(resolve, 800));
            const mockUser = {
              uid:         'mock-user-12345',
              email:       'test-user@react-adhd.com',
              displayName: '홍길동',
              photoURL:    'https://api.dicebear.com/7.x/bottts/svg?seed=react',
            };
            set({ user: mockUser as any, isLoading: false });
            return;
          }

          try {
            const credential = await signInWithGoogle();
            await syncUserToFirestore(credential.user);
            rememberLastLoginMethod('google');
            set({ user: credential.user, isLoading: false });
          } catch (err) {
            const message = getAuthErrorMessage(err, COPY.errors.loginFailed);
            set({ error: message, isLoading: false });
          }
        },

        loginWithEmail: async (email, password) => {
          set({ isLoading: true, error: null });

          if (isMockMode) {
            // 개발용 바이패스 자격증명은 .env.local 에서만 온다 — 소스에 기본값을 두지 않는다.
            const devEmail = import.meta.env.VITE_DEV_LOGIN_EMAIL;
            const devPassword = import.meta.env.VITE_DEV_LOGIN_PASSWORD;
            if (devEmail && devPassword && email === devEmail && password === devPassword) {
              await new Promise((resolve) => setTimeout(resolve, 600));
              const devUser = {
                uid:         'dev-user-56789',
                email:       email,
                displayName: '개발용 유저',
                photoURL:    'https://api.dicebear.com/7.x/bottts/svg?seed=dev',
              };
              set({ user: devUser as any, isLoading: false });
              return true;
            } else {
              await new Promise((resolve) => setTimeout(resolve, 300));
              set({ error: '올바르지 않은 개발용 계정 정보입니다.', isLoading: false });
              return false;
            }
          }

          try {
            const { signInWithEmailAndPassword } = await import('firebase/auth');
            const credential = await signInWithEmailAndPassword(auth, email, password);

            // 이메일 인증을 마치지 않은 계정은 여기서 끊는다. 로그인 화면에는
            // reload()로 인증을 기다리는 흐름이 없으므로 Firebase 세션까지
            // 즉시 signOut해 미인증 세션이 남지 않게 한다.
            if (!credential.user.emailVerified) {
              await signOutUser();
              set({ user: null, error: COPY.errors.emailNotVerified, isLoading: false });
              return false;
            }

            await syncUserToFirestore(credential.user);
            rememberLastLoginMethod('email');
            set({ user: credential.user, isLoading: false });
            return true;
          } catch (err) {
            const message = getAuthErrorMessage(err, COPY.errors.emailLoginFailed);
            set({ error: message, isLoading: false });
            return false;
          }
        },

        registerWithEmail: async (email, password, consent) => {
          set({ isLoading: true, error: null });

          if (isMockMode) {
            await new Promise((resolve) => setTimeout(resolve, 800));
            set({ isLoading: false });
            return true;
          }

          try {
            const { createUserWithEmailAndPassword, sendEmailVerification } = await import('firebase/auth');
            const credential = await createUserWithEmailAndPassword(auth, email, password);
            await syncUserToFirestore(credential.user);

            // 가입 Step 1에서 받은 동의를 계정이 생긴 **바로 이 자리**에서
            // 기록한다. 이 스토어는 세션만 다루는 것이 원칙이지만, 미인증
            // 계정은 user를 비워 두는 설계라(아래 주석 참고) 화면 쪽에서는
            // uid를 알 방법이 없다. syncUserToFirestore도 같은 이유로 여기
            // 있으므로 문서 쓰기의 선례는 이미 있다.
            //
            // 실패해도 가입은 진행한다 — 계정은 이미 만들어졌고, 동의 기록이
            // 없으면 다음 진입에서 게이트가 다시 받아 내기 때문이다.
            if (consent) {
              await useConsentStore
                .getState()
                .saveConsent(credential.user.uid, { marketingAgreed: consent.marketingAgreed });
            }

            // 인증 메일 발송은 **계정 생성과 분리된 실패 지점**이다. 계정은 위에서
            // 이미 만들어졌으므로, 여기서 던진 예외를 바깥 catch로 흘려보내면 가입
            // 전체가 '실패'로 되돌아가면서도 계정은 그대로 남는다 — 화면엔 실패,
            // 서버엔 고아 계정이라는 모순(2026-08-30 김영원 선생님 신고의 정체).
            // 발송 실패는 Step 3의 재발송(resendVerificationEmail)으로 복구하므로
            // 여기서 삼키고 가입 자체는 성사시킨다.
            try {
              await sendEmailVerification(credential.user);
            } catch (mailErr) {
              // 서버에 실패 로그가 남지 않는 구조라, 브라우저 콘솔과 GA4 양쪽에
              // 원인 코드를 남겨 다음 진단의 단서로 삼는다. 계정은 성사됐으므로
              // 흐름은 그대로 진행한다.
              console.error('가입 인증 메일 발송 실패(가입은 성사됨):', mailErr);
              trackEvent('signup_verification_email_failed', { reason: errorCode(mailErr) });
            }
            // 가입에 쓴 수단(이메일)을 여기서 기록한다. 빠뜨리면
            // 가입 → 재방문 시 뱃지가 아무 데도 안 붙는다.
            rememberLastLoginMethod('email');
            // user는 아직 채우지 않는다 — 방금 만든 계정은 정의상 미인증이라,
            // 여기서 앱 세션을 주면 인증을 건너뛴 채 홈에 들어갈 수 있다.
            // Firebase 세션은 살아 있으므로 Step 3의 checkEmailVerified가 동작하고,
            // 인증이 확인되는 순간 그 액션이 user를 채운다.
            set({ user: isUnverifiedEmailUser(credential.user) ? null : credential.user, isLoading: false });
            return true;
          } catch (err) {
            // 여기 도달하는 실패는 계정 생성(createUser) 단계다 — 이미 존재하는
            // 이메일, 형식 오류, IP rate limit 등. 원인 코드를 GA4에 남긴다.
            trackEvent('signup_failed', { reason: errorCode(err) });
            const message = getAuthErrorMessage(err, COPY.errors.signupFailed);
            set({ error: message, isLoading: false });
            return false;
          }
        },

        resendVerificationEmail: async () => {
          set({ isLoading: true, error: null });

          if (isMockMode) {
            await new Promise((resolve) => setTimeout(resolve, 500));
            set({ isLoading: false });
            return true;
          }

          try {
            const currentUser = auth.currentUser;
            // 세션이 없으면 보낼 대상이 없다. Step 3은 가입 직후라 세션이
            // 살아 있는 것이 정상이지만, 만료·복원 실패에 대비해 확인한다.
            if (!currentUser) {
              set({ isLoading: false });
              return false;
            }

            const { sendEmailVerification } = await import('firebase/auth');
            await sendEmailVerification(currentUser);
            set({ isLoading: false });
            return true;
          } catch (err) {
            // 재발송도 rate limit(auth/too-many-requests)에 걸릴 수 있다 —
            // 이때는 정확한 원인을 error에 담아 화면이 그대로 보여주게 하고,
            // 같은 원인 코드를 GA4에도 남긴다.
            trackEvent('verification_resend_failed', { reason: errorCode(err) });
            const message = getAuthErrorMessage(err, COPY.errors.verifyResendFailed);
            set({ error: message, isLoading: false });
            return false;
          }
        },

        checkEmailVerified: async () => {
          set({ isLoading: true, error: null });

          if (isMockMode) {
            await new Promise((resolve) => setTimeout(resolve, 500));
            set({ isLoading: false });
            return true;
          }

          try {
            const currentUser = auth.currentUser;
            if (currentUser) {
              await currentUser.reload();
              // reload() 후 auth.currentUser 객체는 최신 상태(emailVerified 등)를 반영합니다.
              const refreshed = auth.currentUser;
              // 인증이 확인된 순간에만 앱 세션에 올린다. 미인증 상태로 user를 채우면
              // 가입을 중단한 계정이 그대로 홈에 들어가는 이번 버그가 되살아난다.
              set({ user: isUnverifiedEmailUser(refreshed) ? null : refreshed, isLoading: false });
              return refreshed?.emailVerified ?? false;
            }
            set({ isLoading: false });
            return false;
          } catch (err) {
            const message = getAuthErrorMessage(err, COPY.errors.verifyCheckFailed);
            set({ error: message, isLoading: false });
            return false;
          }
        },

        resetPassword: async (email) => {
          set({ isLoading: true, error: null });
          
          if (isMockMode) {
            await new Promise((resolve) => setTimeout(resolve, 500));
            set({ isLoading: false });
            return true;
          }

          try {
            const { sendPasswordResetEmail } = await import('firebase/auth');
            await sendPasswordResetEmail(auth, email);
            set({ isLoading: false });
            return true;
          } catch (err) {
            const message = getAuthErrorMessage(err, COPY.errors.passwordResetFailed);
            set({ error: message, isLoading: false });
            return false;
          }
        },

        logout: async () => {
          set({ isLoading: true, error: null });

          if (isMockMode) {
            await new Promise((resolve) => setTimeout(resolve, 500));
            set({ user: null, isLoading: false });
            return;
          }

          try {
            await signOutUser();
            set({ user: null, isLoading: false });
          } catch (err) {
            const message = getAuthErrorMessage(err, COPY.errors.logoutFailed);
            set({ error: message, isLoading: false });
          }
        },

        deleteAccount: async () => {
          set({ isLoading: true, error: null });

          if (isMockMode) {
            await new Promise((resolve) => setTimeout(resolve, 500));
            set({ user: null, isLoading: false });
            return true;
          }

          try {
            const currentUser = auth.currentUser;
            if (!currentUser) throw new Error(COPY.errors.noCurrentUser);
            
            const { deleteUser } = await import('firebase/auth');
            await deleteUser(currentUser);
            set({ user: null, isLoading: false });
            return true;
          } catch (err: any) {
            const message = getAuthErrorMessage(err, COPY.errors.deleteAccountFailed);
            set({ error: message, isLoading: false });
            return false;
          }
        },

        initAuthListener: () => {
          if (isMockMode) {
            // Mock 모드에서는 로컬 스토리지 데이터 복원 완료 후 즉시 로딩 종료
            set({ isLoading: false });
            return () => {};
          }

          // Firebase 세션 복원: 새로고침 후에도 로그인 상태 유지
          const unsubscribe = onAuthStateChanged(auth, (user) => {
            // 새로고침·재방문으로 복원된 세션도 같은 관문을 지난다. 미인증
            // 이메일 계정은 user를 비워 앱 진입을 막되 signOut은 하지 않는다 —
            // 가입 플로우 Step 3이 이 세션 위에서 reload()를 돌리기 때문이다.
            set({ user: isUnverifiedEmailUser(user) ? null : user, isLoading: false });
          });
          // App 언마운트 시 리스너 해제를 위해 unsubscribe 반환
          return unsubscribe;
        },
      }),
      {
        name: 'syu-react-auth',
        // user 정보만 persist (민감 데이터 최소화)
        partialize: (state) => ({
          user: state.user
            ? {
                uid:           state.user.uid,
                email:         state.user.email,
                displayName:   state.user.displayName,
                photoURL:      state.user.photoURL,
                // 복원 직후(onAuthStateChanged가 아직 안 뜬 순간)에도 인증 여부를
                // 판정할 수 있어야 미인증 세션이 한 프레임이라도 홈을 그리지 않는다.
                emailVerified: state.user.emailVerified,
              }
            : null,
        }),
        // 기본 동작(얕은 병합)에 미인증 세션 폐기 한 단계를 덧댄다. 이 수정 이전에
        // 저장된 미인증 세션이 남아 있을 수 있어, 리스너가 뜨기 전에 먼저 버린다.
        merge: (persisted, current) => {
          const merged = { ...current, ...(persisted as Partial<AuthState> | undefined) };
          if (isUnverifiedEmailUser(merged.user)) merged.user = null;
          return merged;
        },
      }
    ),
    { name: 'AuthStore' }
  )
);
