// src/pages/LoginPage.tsx
// Stitch 로그인 화면 (531b7a25...) 기반
// 디자인 시스템: Serene Azure
// Firebase Auth (useAuthStore) 실제 연동

import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import Button from '../components/ui/Button';
import InputField from '../components/ui/InputField';
import Divider from '../components/ui/Divider';
import AlertDialog from '../components/ui/AlertDialog';
import GoogleIcon from '../components/ui/GoogleIcon';
import LastLoginBadge from '../components/ui/LastLoginBadge';
import { COPY } from '../constants/copy';
import { getLastLoginMethod } from '../utils/lastLoginMethod';

interface LoginPageProps {
  onLoginSuccess: () => void; // 로그인 성공 시 콜백
  onBack: () => void;          // 뒤로 가기 (랜딩으로)
  onSignup: () => void;        // 회원가입 페이지로
}

export default function LoginPage({ onLoginSuccess, onBack, onSignup }: LoginPageProps) {
  const { user, isLoading, error, loginWithGoogle, loginWithEmail, initAuthListener, resetPassword } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Firebase Auth 세션 복원 리스너
  useEffect(() => {
    const unsubscribe = initAuthListener();
    return () => unsubscribe();
  }, [initAuthListener]);

  // 로그인 성공 시 콜백 호출
  useEffect(() => {
    if (user) {
      onLoginSuccess();
    }
  }, [user, onLoginSuccess]);

  // 마지막으로 성공한 로그인 수단 (useAuthStore가 성공 시 기록).
  // 마운트 시점 값을 한 번만 읽는다 — 이 화면에 머무는 동안 값이 바뀔 일은
  // 로그인 성공뿐이고, 그때는 곧바로 화면을 떠나므로 갱신할 이유가 없다.
  const [lastLoginMethod] = useState(getLastLoginMethod);

  const handleEmailLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLocalError('');
    if (!email.trim()) {
      setLocalError(COPY.errors.emailRequired);
      return;
    }
    if (!password.trim()) {
      setLocalError(COPY.errors.passwordRequired);
      return;
    }
    await loginWithEmail(email.trim(), password);
  };

  const handleResetPassword = async () => {
    setLocalError('');
    if (!email.trim()) {
      setLocalError(COPY.errors.resetEmailRequired);
      return;
    }
    const success = await resetPassword(email.trim());
    if (success) {
      setNotice(COPY.login.resetEmailSent);
    } else {
      setLocalError(COPY.errors.resetEmailSendFailed);
    }
  };

  return (
    <div className="relative w-full h-full flex flex-col overflow-y-auto overscroll-y-none">

      {/* ── 뒤로 가기 버튼 ── */}
      <button
        id="btn-back-to-landing"
        onClick={onBack}
        className="
          absolute top-4 left-4 z-20
          flex items-center gap-1
          text-on-surface-variant hover:text-primary
          transition-colors text-[14px] font-body
        "
        aria-label="랜딩 페이지로 돌아가기"
      >
        <span className="material-symbols-outlined text-[20px]">arrow_back</span>
        <span className="text-[14px]">뒤로</span>
      </button>

      {/* ── 메인 콘텐츠 (수직 중앙 정렬) ──
          375×667(아이폰 SE)에서 스크롤이 생긴다는 UAT 지적(2026-08-27)으로
          바깥 여백 py-16(128px) → py-6(48px), 블록 간격 gap-8(32px) →
          gap-4(16px)로 줄여 총 144px을 회수했다(실측 677px → 645px, 여유
          22px). 줄인 것은 **여백뿐**이다 — 입력 필드·버튼의 터치 높이와
          글자 크기는 그대로 두었다. */}
      <main className="
        relative z-10
        flex flex-col justify-center gap-4
        grow px-6 py-6
      ">
        {/* Header — 로고 */}
        <header className="text-center shrink-0">
          {/* 팀 로고 마크(조세현, 2026-08-26). BrandHeader와 **같은 에셋·같은
              규약**을 쓴다 — 바로 아래 'REACT' 글자가 이름을 말하므로 마크는
              장식이고, alt는 빈 문자열로 두어 접근 가능한 이름에 아무것도
              더하지 않는다. 예전에는 Stitch 시절의 psychology 아이콘(48px)이
              있었는데 헤더의 마크와 서로 다른 로고처럼 보였다.
              width/height는 h-12로 그려지기 전 자리를 잡아 두기 위한 원본 비율. */}
          <div className="flex justify-center mb-3">
            <img
              src="/brand/logo-mark.webp"
              alt=""
              aria-hidden
              width={512}
              height={352}
              className="h-12 w-auto"
            />
          </div>
          <h1 className="
            text-[40px] font-bold leading-[48px] tracking-[-0.02em]
            text-primary
            font-headline mb-1
          ">
            REACT
          </h1>
          <p className="text-[16px] text-on-surface-variant font-body">
            다시 만나서 반가워요!
          </p>
        </header>

        {/* ── 로그인 폼 카드 ── */}
        {/* <form>으로 감싸 Enter 키 제출(암묵적 제출)을 지원한다 */}
        <form
          onSubmit={handleEmailLogin}
          className="
            bg-card-bg border border-card-border
            rounded-pane p-6
            flex flex-col gap-4
            shadow-2xl shrink-0
          "
        >
          {/* 이메일 필드 */}
          <InputField
            id="email"
            type="email"
            label="이메일"
            icon="mail"
            placeholder="이메일 주소를 입력하세요"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          {/* 비밀번호 필드 */}
          <InputField
            id="password"
            type="password"
            label="비밀번호"
            icon="lock"
            placeholder="••••••••"
            showToggle
            isPasswordShown={showPassword}
            onToggleShow={() => setShowPassword((v) => !v)}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            labelAction={
              <button
                type="button"
                onClick={handleResetPassword}
                className="text-[12px] text-primary hover:text-primary-fixed transition-colors font-body font-semibold"
              >
                비밀번호 재설정
              </button>
            }
          />

          {(localError || error) && (
            <p className="text-[13px] text-error font-body px-1">
              ⚠️ {localError || error}
            </p>
          )}

          {/* 이메일 로그인 버튼 — 최근 사용 칩이 우상단 모서리에 겹쳐 붙는다 */}
          <div className="relative mt-2">
            {lastLoginMethod === 'email' && <LastLoginBadge method="email" />}
            <Button
              id="btn-email-login"
              type="submit"
              variant="primary"
              loading={isLoading}
              icon="arrow_forward"
            >
              로그인
            </Button>
          </div>
        </form>

        {/* ── 구분선 ── */}
        <Divider text="또는 다음으로 계속하기" />

        {/* ── Google 로그인 ── */}
        {/* 추가 마진 없음 — main의 gap-8(32px)이 폼~구분선과 같은 리듬을 만든다.
            (말풍선 시절의 mt-4가 이 구간만 48px로 벌리고 있었음, 2026-08-08 검수) */}
        <div className="relative shrink-0">
          {/* 최근 사용 칩 — 구글 로그인 이력이 있을 때만, 버튼 우상단에 부착 */}
          {lastLoginMethod === 'google' && <LastLoginBadge method="google" />}

          <Button
            id="btn-google-login"
            variant="outline"
            onClick={loginWithGoogle}
            loading={isLoading}
            className="hover:border-primary-container/50"
          >
            <GoogleIcon />
            구글로 계속하기
          </Button>
        </div>

        {/* ── 회원가입 링크 ── */}
        <div className="flex flex-col items-center gap-3 shrink-0">
          <p className="text-[16px] text-on-surface-variant font-body text-center">
            계정이 없으신가요?{' '}
            <button id="btn-goto-signup" onClick={onSignup} className="text-primary font-bold hover:text-primary-fixed transition-colors">
              회원가입
            </button>
          </p>
        </div>
      </main>

      <AlertDialog message={notice} tone="success" onClose={() => setNotice(null)} />
    </div>
  );
}
