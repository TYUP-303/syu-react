// src/pages/SignupPage.tsx
// 이메일 가입 3단계 흐름 — UI Only (Firebase 연동 없음)
// Stitch 화면 기반: Step1(약관) → Step2(이메일/PW) → Step3(이메일 인증)

import { useState, useEffect } from 'react';
import Button from '../components/ui/Button';
import AlertDialog from '../components/ui/AlertDialog';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import InputField from '../components/ui/InputField';
import PageLayout from '../components/ui/PageLayout';
import LegalDocumentSheet from '../components/ui/LegalDocumentSheet';
import { useAuthStore } from '../store/useAuthStore';
import { COPY } from '../constants/copy';
import { useSettingsStore } from '../store/useSettingsStore';
import { type LegalDocument } from '../constants/legal';

type SignupStep = 1 | 2 | 3 | 4;

interface SignupPageProps {
  onBack: () => void;          // 로그인 페이지로
  onComplete: () => void;      // 가입 완료 → 홈
}

function SignupHeader({ step, onBack, onClose }: { step: 1 | 2 | 3 | 4; onBack?: () => void; onClose?: () => void }) {
  const percent = step * 25;
  return (
    <div className="w-full bg-surface/80 backdrop-blur-md px-6 pt-4 pb-2">
      <header className="flex justify-between items-center w-full h-12">
        {onBack ? (
          <button onClick={onBack} className="text-on-surface hover:text-primary transition-colors flex items-center justify-center w-10 h-10 -ml-2 rounded-full" aria-label="뒤로">
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
        ) : (
          <div className="w-10" />
        )}

        <div className="text-[12px] font-semibold text-outline uppercase tracking-[0.15em] font-body">
          STEP {step} OF 4
        </div>

        {onClose ? (
          <button onClick={onClose} className="text-on-surface hover:text-primary transition-colors flex items-center justify-center w-10 h-10 -mr-2 rounded-full" aria-label="닫기">
            <span className="material-symbols-outlined">close</span>
          </button>
        ) : (
          <div className="w-10" />
        )}
      </header>

      {/* 진행 바 */}
      <div className="w-full mt-1">
        <div className="h-1 w-full bg-surface-container-high rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500 bg-primary"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
    </div>
  );
}


/* ──────────────────────────────────────────
   STEP 1 — 약관 동의
────────────────────────────────────────── */
interface Step1Props {
  agreedTerms: boolean;
  setAgreedTerms: (val: boolean) => void;
  agreedPrivacy: boolean;
  setAgreedPrivacy: (val: boolean) => void;
  agreedMarketing: boolean;
  setAgreedMarketing: (val: boolean) => void;
  onNext: () => void;
  onClose: () => void;
}

function Step1({
  agreedTerms, setAgreedTerms,
  agreedPrivacy, setAgreedPrivacy,
  agreedMarketing, setAgreedMarketing,
  onNext, onClose
}: Step1Props) {

  // 전문 열람 시트. 이 화살표 버튼들은 onClick이 없어 눌러도 아무 일이
  // 없었다 — 전문을 읽을 수 없는 동의 화면이라 법적으로도 흠이었다.
  // 전문은 DB(settings/legal) 우선이고 없으면 코드 상수로 폴백한다.
  //
  // marketingConsentEnabled는 마케팅 항목을 **화면에서 뺄지**의 스위치이고,
  // ConsentGate와 같은 소스(settings/legal)를 본다. 가입 Step 1에만 따로
  // 남아 있던 마케팅 행이 어드민 설정을 무시하면, 같은 서비스가 창구마다
  // 다른 동의를 받는 셈이 된다.
  const { terms, privacy, marketing, marketingConsentEnabled } = useSettingsStore(
    (state) => state.legal
  );
  const [openDocument, setOpenDocument] = useState<LegalDocument | null>(null);

  const requiredChecked = agreedTerms && agreedPrivacy;
  // 숨겨 둔 항목은 "모두 동의"의 대상이 아니다 (ConsentGate와 같은 판정).
  // 빼지 않으면 화면의 체크를 전부 켜도 '모두 동의'가 꺼진 채로 남는다.
  const allChecked = requiredChecked && (!marketingConsentEnabled || agreedMarketing);

  const handleCheckAll = (checked: boolean) => {
    setAgreedTerms(checked);
    setAgreedPrivacy(checked);
    if (marketingConsentEnabled) setAgreedMarketing(checked);
  };

  return (
    // Step 1은 이전 단계가 없다. ←에 onClose를 물려 두면 ✕와 완전히 같은
    // 동작이 두 번 놓이고, 화살표는 "한 단계 뒤로" 기호라 실제 동작(가입 이탈)과
    // 어긋난다. onBack을 넘기지 않으면 SignupHeader가 폭만 맞춘 스페이서를 그린다.
    <PageLayout header={<SignupHeader step={1} onClose={onClose} />}>
      <div className="min-h-full flex flex-col px-6 pt-6 pb-8">

        {/* 타이틀 */}
        <div className="mb-8">
          <h1 className="text-[32px] font-bold leading-[40px] tracking-tight text-on-surface font-headline mb-2">
            이메일 회원가입
          </h1>
          <p className="text-[16px] text-on-surface-variant font-body">
            서비스 이용을 위해 약관에 동의해 주세요.
          </p>
        </div>

        {/* 아이콘 비주얼 */}
        <div className="flex justify-center mb-8 relative py-8">
          <div className="absolute inset-0 bg-primary-container/5 blur-[40px] rounded-full" />
          {/* ConsentGate와 같은 조형 — 스크림 토큰은 라이트 서피스 위에서
              시커먼 원판이 되므로 밝은 컨테이너 + 아웃라인으로 맞춘다. */}
          <div className="w-24 h-24 rounded-full bg-surface-container border border-outline-variant flex items-center justify-center z-10">
            <span
              className="material-symbols-outlined text-[40px] text-primary"
              style={{
                fontVariationSettings: "'FILL' 0",
                filter: 'drop-shadow(0 0 8px var(--color-primary-fixed-glow-60))',
              }}
            >
              fact_check
            </span>
          </div>
        </div>

        {/* 약관 목록 */}
        <div className="flex-grow flex flex-col gap-4">
          {/* 모두 동의 */}
          <label className="flex items-center gap-4 p-4 rounded-pane bg-card-bg border border-card-border cursor-pointer hover:border-primary-container/50 transition-colors">
            <input
              className="signup-checkbox"
              type="checkbox"
              checked={allChecked}
              onChange={(e) => handleCheckAll(e.target.checked)}
            />
            <span className="text-[18px] font-semibold text-on-surface font-body flex-grow">
              모두 동의
            </span>
          </label>

          <div className="h-px w-full bg-outline-variant/30 my-1" />

          {/* 서비스 이용약관 */}
          <label className="flex items-center gap-4 py-2 px-2 cursor-pointer group">
            <input
              className="signup-checkbox"
              type="checkbox"
              checked={agreedTerms}
              onChange={(e) => setAgreedTerms(e.target.checked)}
            />
            <div className="flex-grow flex items-center justify-between">
              <span className="text-[16px] text-on-surface-variant group-hover:text-on-surface transition-colors font-body">
                서비스 이용약관 동의{' '}
                <span className="text-tertiary text-[12px] font-semibold">(필수)</span>
              </span>
              {/* label 안의 버튼이라 기본 동작(체크박스 토글)을 막아야
                  "전문을 열었을 뿐인데 동의도 됐다"가 되지 않는다 */}
              <button
                type="button"
                aria-label={COPY.consent.viewDocumentLabel(terms.title)}
                onClick={(e) => {
                  e.preventDefault();
                  setOpenDocument(terms);
                }}
                className="text-outline hover:text-primary transition-colors ml-2"
              >
                <span className="material-symbols-outlined text-[18px]">chevron_right</span>
              </button>
            </div>
          </label>

          {/* 개인정보 수집 */}
          <label className="flex items-center gap-4 py-2 px-2 cursor-pointer group">
            <input
              className="signup-checkbox"
              type="checkbox"
              checked={agreedPrivacy}
              onChange={(e) => setAgreedPrivacy(e.target.checked)}
            />
            <div className="flex-grow flex items-center justify-between">
              <span className="text-[16px] text-on-surface-variant group-hover:text-on-surface transition-colors font-body">
                개인정보 수집 및 이용 동의{' '}
                <span className="text-tertiary text-[12px] font-semibold">(필수)</span>
              </span>
              <button
                type="button"
                aria-label={COPY.consent.viewDocumentLabel(privacy.title)}
                onClick={(e) => {
                  e.preventDefault();
                  setOpenDocument(privacy);
                }}
                className="text-outline hover:text-primary transition-colors ml-2"
              >
                <span className="material-symbols-outlined text-[18px]">chevron_right</span>
              </button>
            </div>
          </label>

          {/* 마케팅 동의 — 표시 여부는 settings/legal.marketingConsentEnabled가 정한다.
              선택 항목이라 아예 빼도 [다음] 활성 조건(requiredChecked)에 영향이 없다. */}
          {marketingConsentEnabled && (
            <label className="flex items-center gap-4 py-2 px-2 cursor-pointer group">
              <input
                className="signup-checkbox"
                type="checkbox"
                checked={agreedMarketing}
                onChange={(e) => setAgreedMarketing(e.target.checked)}
              />
              <div className="flex-grow flex items-center justify-between">
                <span className="text-[16px] text-on-surface-variant group-hover:text-on-surface transition-colors font-body">
                  {COPY.consent.marketingLabel}{' '}
                  <span className="text-outline-variant text-[12px] font-semibold">
                    {COPY.consent.optional}
                  </span>
                </span>
                {/* 마케팅 전문도 ConsentGate와 같은 소스(settings/legal의 marketing)를
                    쓴다. 예전에는 legal.ts에 마케팅 문서가 없어 화살표 자체를 뺐었다. */}
                <button
                  type="button"
                  aria-label={COPY.consent.viewDocumentLabel(marketing.title)}
                  onClick={(e) => {
                    e.preventDefault();
                    setOpenDocument(marketing);
                  }}
                  className="text-outline hover:text-primary transition-colors ml-2"
                >
                  <span className="material-symbols-outlined text-[18px]">chevron_right</span>
                </button>
              </div>
            </label>
          )}
        </div>

        {/* 다음 버튼 */}
        <div className="mt-auto pt-8">
          <Button
            id="btn-signup-step1-next"
            onClick={onNext}
            disabled={!requiredChecked}
            variant="primary"
            icon="arrow_forward"
            className="py-4"
          >
            다음
          </Button>
        </div>
      </div>

      {openDocument && (
        <LegalDocumentSheet doc={openDocument} onClose={() => setOpenDocument(null)} />
      )}
    </PageLayout>
  );
}

/* ──────────────────────────────────────────
   STEP 2 — 이메일 / 비밀번호 입력
────────────────────────────────────────── */
interface Step2Props {
  onNext: (email: string, password: string) => void;
  onBack: () => void;
  onClose: () => void;
}

function Step2({ onNext, onBack, onClose }: Step2Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const pwValid = password.length >= 8 && /(?=.*[a-zA-Z])(?=.*\d)/.test(password);
  const pwMatch = password === confirmPassword && confirmPassword.length > 0;
  const canNext = emailValid && pwValid && pwMatch;

  const step2Footer = (
    <div className="w-full px-6 py-4 bg-surface border-t border-outline-variant/20">
      <Button
        id="btn-signup-step2-next"
        type="button"
        onClick={() => onNext(email, password)}
        disabled={!canNext}
        variant="primary"
        className="w-full h-14 rounded-full"
      >
        다음
      </Button>
    </div>
  );

  return (
    <PageLayout header={<SignupHeader step={2} onBack={onBack} onClose={onClose} />} footer={step2Footer}>
      {/* 본문 */}
      <div className="min-h-full px-6 pt-6 pb-8 flex flex-col">

        {/* 타이틀 */}
        <h1 className="text-[32px] font-bold leading-[40px] text-on-surface font-headline mb-2">
          이메일 회원가입
        </h1>
        <p className="text-[16px] text-on-surface-variant font-body mb-8">
          REACT에서 사용할 이메일과 비밀번호를 입력해 주세요.
        </p>

        {/* 폼 */}
        <form
          className="flex flex-col gap-6 flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (canNext) {
              onNext(email, password);
            }
          }}
        >
          {/* 이메일 */}
          <InputField
            id="signup-email"
            type="email"
            label="Email"
            icon="mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            required
          />

          {/* 비밀번호 */}
          <div>
            <InputField
              id="signup-password"
              type="password"
              label="Password"
              icon="lock"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              showToggle
              isPasswordShown={showPw}
              onToggleShow={() => setShowPw((v) => !v)}
              className="tracking-widest"
              required
            />
            <p className="text-[12px] text-outline-variant ml-1 font-body mt-2">
              최소 8자 이상, 영문/숫자 조합
            </p>
          </div>

          {/* 비밀번호 확인 */}
          <InputField
            id="signup-confirm-password"
            type="password"
            label="Confirm Password"
            icon="lock_clock"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="••••••••"
            showToggle
            isPasswordShown={showConfirmPw}
            onToggleShow={() => setShowConfirmPw((v) => !v)}
            className="tracking-widest"
            error={confirmPassword.length > 0 && !pwMatch ? COPY.errors.passwordMismatch : undefined}
            required
          />
          {/* 엔터 키 제출을 위한 숨겨진 submit 버튼 */}
          <button type="submit" className="hidden" disabled={!canNext} />
        </form>
      </div>
    </PageLayout>
  );
}

/* ──────────────────────────────────────────
   STEP 3 — 이메일 인증
────────────────────────────────────────── */
interface Step3Props {
  email: string;
  onComplete: () => void;
  onBack: () => void;
  onClose: () => void;
}

function Step3({ email, onComplete, onBack, onClose }: Step3Props) {
  const { checkEmailVerified, resendVerificationEmail, isLoading } = useAuthStore();
  const [notice, setNotice] = useState<string | null>(null);
  // 재발송 성공은 안내(info), 인증 미완료·재발송 실패는 경고(error)로 구분한다.
  const [noticeTone, setNoticeTone] = useState<'info' | 'error'>('info');

  const handleVerify = async () => {
    const isVerified = await checkEmailVerified();
    if (isVerified) {
      onComplete();
    } else {
      setNoticeTone('error');
      setNotice(COPY.signup.verifyIncomplete);
    }
  };

  const handleResend = async () => {
    const ok = await resendVerificationEmail();
    if (ok) {
      setNoticeTone('info');
      setNotice(COPY.signup.resendSuccess);
    } else {
      // 재발송이 rate limit 등으로 막히면 스토어가 정확한 원인을 error에 담는다.
      const reason = useAuthStore.getState().error;
      setNoticeTone('error');
      setNotice(reason || COPY.errors.verifyResendFailed);
    }
  };
  const step3Footer = (
    <div className="w-full px-6 py-4 bg-surface border-t border-outline-variant/20">
      <Button
        id="btn-signup-verify"
        onClick={handleVerify}
        disabled={isLoading}
        variant="primary"
        className="w-full text-[20px] py-4 rounded-control"
      >
        {isLoading ? '확인 중...' : '인증 완료 확인'}
      </Button>
    </div>
  );

  return (
    <PageLayout header={<SignupHeader step={3} onBack={onBack} onClose={onClose} />} footer={step3Footer}>
      {/* Ambient 배경 */}
      <div className="absolute inset-0 pointer-events-none z-0">
        <div className="absolute top-[20%] left-1/2 -translate-x-1/2 w-[300px] h-[300px] bg-primary-container/10 rounded-full blur-[100px]" />
      </div>

      {/* 본문 */}
      <div className="relative z-10 px-6 pt-8 pb-8">
        {/* 아이콘 + 타이틀 */}
        <div className="flex flex-col items-center text-center gap-4 mb-10">
          <div className="w-20 h-20 rounded-full bg-surface-container-high border border-disabled-bg flex items-center justify-center relative overflow-hidden">
            <div className="absolute inset-0 bg-primary-container/5 blur-xl" />
            <span
              className="material-symbols-outlined text-[40px] text-primary"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              mail
            </span>
          </div>
          <h1 className="text-[32px] font-bold leading-[40px] text-on-surface font-headline">
            이메일 인증
          </h1>
          <div className="space-y-4">
            <p className="text-[18px] text-on-surface-variant font-body leading-[28px]">
              입력하신 이메일로 인증 링크를 보냈습니다.<br />
              메일함에서 링크를 클릭한 후 아래 버튼을 눌러주세요.
            </p>
            <div className="inline-block bg-card-bg border border-card-border rounded-control px-4 py-2">
              <span className="text-[14px] font-semibold text-secondary tracking-[0.1em] font-body">
                {email || 'your@email.com'}
              </span>
            </div>
            <p className="text-[12px] text-error font-body mt-4 font-bold">
              * 메일이 도착하지 않았다면 스팸 메일함을 꼭 확인해 주세요.
            </p>
            {/* 최초 발송이 실패했거나 메일이 오지 않았을 때의 복구 창구.
                계정은 이미 만들어졌으므로 재발송만으로 인증을 이어갈 수 있다. */}
            <button
              type="button"
              onClick={handleResend}
              disabled={isLoading}
              className="text-primary hover:text-primary-container transition-colors text-[14px] font-bold font-body underline underline-offset-4 disabled:opacity-50"
            >
              {COPY.signup.resendButton}
            </button>
            <AlertDialog message={notice} tone={noticeTone} onClose={() => setNotice(null)} />
          </div>
        </div>
      </div>
    </PageLayout>
  );
}

/* ──────────────────────────────────────────
   메인 SignupPage — 단계 라우터
────────────────────────────────────────── */
/* ──────────────────────────────────────────
   STEP 4 — 가입 완료
   ────────────────────────────────────────── */
interface Step4Props {
  email: string;
  onComplete: () => void;
}

function Step4({ email, onComplete }: Step4Props) {
  // Step 1~3과 같은 PageLayout header/footer 구조. 예전에는 이 단계만
  // 직접 flex 컬럼을 짜고 CTA를 `mt-auto pt-8`로 붙여 좌우 패딩이 없었고,
  // 그래서 [시작하기]가 430px 프레임 모서리에 그대로 붙어 있었다.
  const step4Footer = (
    <div className="w-full px-6 py-4 bg-surface border-t border-outline-variant/20">
      <Button
        id="btn-signup-finish"
        onClick={onComplete}
        variant="primary"
        icon="arrow_forward"
        className="w-full h-14 rounded-full"
      >
        시작하기
      </Button>
    </div>
  );

  return (
    <PageLayout header={<SignupHeader step={4} onClose={onComplete} />} footer={step4Footer}>
      {/* Glow 애니메이션 인라인 스타일 */}
      <style>{`
        @keyframes pulse-glow {
          0%, 100% {
            box-shadow: 0 0 20px 0px var(--color-success-glow-30);
          }
          50% {
            box-shadow: 0 0 40px 10px var(--color-success-glow-60);
          }
        }
        .glow-pulse {
          animation: pulse-glow 3s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
      `}</style>

      {/* Ambient 배경 */}
      <div className="absolute inset-0 pointer-events-none z-0">
        <div className="absolute top-[30%] left-1/2 -translate-x-1/2 w-[300px] h-[300px] bg-primary-container/10 rounded-full blur-[100px]" />
        <div className="absolute bottom-[20%] left-1/2 -translate-x-1/2 w-[250px] h-[250px] bg-secondary-container/10 rounded-full blur-[80px]" />
      </div>

      {/* 본문 콘텐츠 */}
      <div className="relative z-10 min-h-full flex flex-col items-center justify-center gap-8 px-6 pt-6 pb-8">
        {/* 성공 그래픽 */}
        <div className="relative flex items-center justify-center py-6">
          {/* 외곽 핑 애니메이션 링 */}
          <div className="absolute inset-0 rounded-full border border-success/20 scale-[1.7] animate-ping" style={{ animationDuration: '3s' }} />
          <div className="absolute inset-0 rounded-full border border-success/40 scale-[1.3] animate-ping" style={{ animationDuration: '3s', animationDelay: '0.5s' }} />

          {/* 메인 성공 링 */}
          <div className="w-28 h-28 rounded-full border-2 border-success bg-success/10 flex items-center justify-center glow-pulse backdrop-blur-sm z-10">
            <span className="material-symbols-outlined text-[64px] text-success" style={{ fontVariationSettings: "'FILL' 1" }}>
              check_circle
            </span>
          </div>
        </div>

        {/* 웰컴 텍스트 */}
        <div className="text-center space-y-3 max-w-[90%]">
          <h2 className="text-[28px] font-bold leading-9 text-on-surface font-headline">
            가입이 완료되었습니다!
          </h2>
          <p className="text-[14px] text-outline font-body leading-relaxed whitespace-pre-line">
            REACT의 회원이 되신 것을 환영합니다.{"\n"}
            이제 나에게 맞는 정서 조절 연습을 시작해 보세요.
          </p>
        </div>

        {/* 유저 정보 카드 */}
        <div className="w-full bg-surface-container/80 backdrop-blur-md border border-outline-variant/30 rounded-pane p-4 flex items-center gap-4 mt-4">
          <div className="w-12 h-12 rounded-full bg-card-bg flex items-center justify-center border border-outline-variant/40">
            <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>
              person
            </span>
          </div>
          <div className="flex flex-col flex-1 overflow-hidden">
            <span className="text-[10px] font-semibold text-outline uppercase tracking-wider font-body">
              등록된 이메일
            </span>
            <span className="text-[14px] font-medium text-on-surface truncate font-body">
              {email}
            </span>
          </div>
          <span className="material-symbols-outlined text-success text-[18px]">
            verified
          </span>
        </div>
      </div>
    </PageLayout>
  );
}

export default function SignupPage({ onBack, onComplete }: SignupPageProps) {
  // URL 쿼리 파라미터(?step=) 및 해시 쿼리(#signup?step=) 모두 지원
  const getInitialStep = (): SignupStep => {
    const search = window.location.search || (window.location.hash.includes('?') ? '?' + window.location.hash.split('?')[1] : '');
    const params = new URLSearchParams(search);
    const stepParam = parseInt(params.get('step') || '1', 10);
    if (stepParam >= 1 && stepParam <= 4) return stepParam as SignupStep;
    return 1;
  };

  const [step, setStepState] = useState<SignupStep>(getInitialStep);
  // 초기값은 빈 문자열이어야 한다 — 개발 편의로 남아 있던 'test@example.com'이
  // 가입 완료 화면의 "등록된 이메일"에 그대로 새어 나온 적이 있다.
  const [signupEmail, setSignupEmail] = useState('');
  // 가입 실패 알림 (Step2에서 발생, 단계 라우터가 소유)
  const [notice, setNotice] = useState<string | null>(null);
  // 가입 중단 확인 (Step 3 전용 — 아래 handleClose 주석 참조)
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  // Step 변경 시 URL 해시 및 쿼리 파라미터(#signup?step=) 동기화
  const setStep = (newStep: SignupStep) => {
    setStepState(newStep);
    window.location.hash = `signup?step=${newStep}`;
  };

  // 브라우저 뒤로가기/앞으로가기/주소창 입력 시 step 동기화
  useEffect(() => {
    const handleSyncStep = () => {
      const search = window.location.search || (window.location.hash.includes('?') ? '?' + window.location.hash.split('?')[1] : '');
      const params = new URLSearchParams(search);
      const stepParam = parseInt(params.get('step') || '1', 10);
      if (stepParam >= 1 && stepParam <= 4) {
        setStepState(stepParam as SignupStep);
      }
    };

    window.addEventListener('popstate', handleSyncStep);
    window.addEventListener('hashchange', handleSyncStep);
    return () => {
      window.removeEventListener('popstate', handleSyncStep);
      window.removeEventListener('hashchange', handleSyncStep);
    };
  }, []);

  // Step 1 상태 보존용
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [agreedPrivacy, setAgreedPrivacy] = useState(false);
  const [agreedMarketing, setAgreedMarketing] = useState(false);

  const { registerWithEmail } = useAuthStore();
  // 저장 시점에도 같은 스위치를 본다 — Step 1에서 체크한 뒤 운영팀이 설정을
  // 껐다면 그 동의는 근거를 잃는다 (ConsentGate.handleAgree와 같은 규약).
  const marketingConsentEnabled = useSettingsStore(
    (state) => state.legal.marketingConsentEnabled
  );

  // 가입 중단 확인은 **계정이 이미 만들어진 뒤**에만 건다 (2026-08-08 확정).
  // Step 2를 통과하면 registerWithEmail이 Firebase 계정을 만들어 둔 상태라,
  // 여기서 그냥 나가면 "인증만 남은 계정"이 남는다는 사실을 모른 채 떠난다.
  // Step 1·2는 아직 아무것도 만들어지지 않았으므로 기존대로 즉시 이탈한다.
  // Step 4(가입 완료)의 ✕는 이탈이 아니라 완료 동선(onComplete)이라 제외한다 —
  // 이미 끝난 가입에 "잠시 멈출까요?"를 묻는 것은 사실과 어긋난다.
  const handleClose = () => {
    if (step === 3) {
      setShowExitConfirm(true);
      return;
    }
    onBack();
  };

  return (
    <>
      {step === 1 && (
        <Step1
          agreedTerms={agreedTerms}
          setAgreedTerms={setAgreedTerms}
          agreedPrivacy={agreedPrivacy}
          setAgreedPrivacy={setAgreedPrivacy}
          agreedMarketing={agreedMarketing}
          setAgreedMarketing={setAgreedMarketing}
          onNext={() => setStep(2)}
          onClose={handleClose}
        />
      )}
      {step === 2 && (
        <Step2
          onNext={async (email, password) => {
            setSignupEmail(email);
            // Step 1에서 받은 동의를 계정 생성과 같은 호출에 실어 보낸다.
            // 예전에는 체크 결과가 이 컴포넌트 상태로만 남고 어디에도
            // 기록되지 않아, 동의를 받아 놓고 근거가 없는 상태였다.
            // 항목을 숨긴 상태에서는 무조건 false로 기록한다 — 묻지 않은
            // 동의를 받았다고 남기면 그 기록 자체가 근거 없는 것이 된다.
            const success = await registerWithEmail(email, password, {
              marketingAgreed: marketingConsentEnabled && agreedMarketing,
            });
            if (success) {
              setStep(3); // Firebase 이메일 인증 단계로 이동
            } else {
              // 스토어가 이미 원인별 정확한 문구(예: '이미 가입된 이메일입니다…',
              // '비정상적인 로그인 시도가 감지되었습니다…')를 error에 담아 두므로
              // 그것을 우선 보여준다. 예전에는 이 값을 버리고 두루뭉술한 일반 문구만
              // 띄워, 유저도 우리도 실패 원인을 구분할 수 없었다(신고의 한 원인).
              // 서버에 실패 로그가 남지 않는 구조라, 이 문구가 사실상의 진단 정보다.
              const reason = useAuthStore.getState().error;
              setNotice(reason || COPY.signup.failed);
            }
          }}
          onBack={() => setStep(1)}
          onClose={handleClose}
        />
      )}
      {step === 3 && (
        <Step3
          email={signupEmail}
          onComplete={() => setStep(4)}
          onBack={() => setStep(2)}
          onClose={handleClose}
        />
      )}
      {step === 4 && (
        <Step4
          email={signupEmail}
          onComplete={onComplete}
        />
      )}

      {/* 파괴적 확인이 아니다 — 계정은 남고 인증만 미루는 것이라 tone은 default */}
      <ConfirmDialog
        open={showExitConfirm}
        icon="schedule"
        title={COPY.signup.exitConfirmTitle}
        message={COPY.signup.exitConfirmBody}
        cancelLabel={COPY.signup.exitConfirmCancel}
        confirmLabel={COPY.signup.exitConfirmExit}
        onCancel={() => setShowExitConfirm(false)}
        onConfirm={() => {
          setShowExitConfirm(false);
          onBack();
        }}
      />

      <AlertDialog message={notice} tone="error" onClose={() => setNotice(null)} />
    </>
  );
}
