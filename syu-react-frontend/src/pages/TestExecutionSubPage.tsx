// src/pages/TestExecutionSubPage.tsx
// 검사 질문지 렌더링 및 답안 수집 서브 페이지

import { useState } from 'react';
import { useTestStore } from '../store/useTestStore';
import Button from '../components/ui/Button';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import PageLayout from '../components/ui/PageLayout';
import ProgressBar from '../components/ui/ProgressBar';
import ScaleSelector from '../components/test/ScaleSelector';
import YesNoSelector from '../components/test/YesNoSelector';
import MultipleChoiceSelector from '../components/test/MultipleChoiceSelector';
import TestTypeBadge from '../components/test/TestTypeBadge';
import { COPY } from '../constants/copy';
import { TEST_THEME } from '../constants/testTheme';

interface TestExecutionSubPageProps {
  /** 검사 이탈 — 답안을 버리고 홈으로 나간다 (TestUnifiedPage.handleExitTest) */
  onExit: () => void;
  onComplete: () => void;
}

export default function TestExecutionSubPage({
  onExit,
  onComplete,
}: TestExecutionSubPageProps) {
  const {
    activeTest,
    questions,
    currentIndex,
    answers,
    selectAnswer,
    nextQuestion,
    prevQuestion,
    isSubmitting,
    error,
  } = useTestStore();

  // 이탈 확인 모달. 훅이므로 아래 로딩 early return보다 위에 있어야 한다.
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  // activeTest는 initTest에서 questions와 함께 세팅되므로 둘 중 하나라도
  // 비어 있으면 아직 로딩 중이다. 여기서 함께 막아야 아래에서 검사 종류를
  // 안전하게(널 폴백 없이) 쓸 수 있다.
  if (!questions || questions.length === 0 || !activeTest) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 bg-surface px-6">
        <div className="w-10 h-10 rounded-full border-2 border-primary-container border-t-transparent animate-spin" />
        <p className="text-[14px] text-outline font-body">{COPY.test.loadingQuestions}</p>
      </div>
    );
  }

  const currentQuestion = questions[currentIndex];
  const totalQuestions = questions.length;
  // 검사별 색 축. 원색 토큰(bg-primary 등)을 직접 쓰지 말 것 — constants/testTheme.ts 참고
  const theme = TEST_THEME[activeTest];
  const selectedOptionIndex = answers[currentQuestion.id];
  const isAnswered = selectedOptionIndex !== undefined;
  const isLastQuestion = currentIndex === totalQuestions - 1;

  // 문항 이동과 검사 이탈을 서로 다른 버튼에 분리해 둔다 (2026-08-08 확정).
  // 하단 [이전]은 prevQuestion 전용이라 답안을 건드리지 않고, 1번 문항에서는
  // 비활성이다. 검사를 벗어나는 동선은 상단 ✕ 하나뿐이며 확인 모달을
  // 거친다 — 이탈하면 TestUnifiedPage가 답안을 버리고 홈으로 보낸다.
  // ←(arrow_back)는 두지 않는다: 화살표는 "한 단계 뒤로" 기호인데 실제
  // 동작이 "검사 전체 이탈"이라 의미가 어긋나고, ✕와 완전 중복이었다.
  const isFirstQuestion = currentIndex === 0;

  const handleConfirmExit = () => {
    setShowExitConfirm(false);
    onExit();
  };

  const handleNextOrSubmit = () => {
    if (!isAnswered) return;

    if (isLastQuestion) {
      onComplete();
    } else {
      nextQuestion();
    }
  };

  // ── 헤더 + 프로그레스 바 ──
  // 둘 다 PageLayout의 header 슬롯에 넣어 스크롤과 무관하게 붙여 둔다
  // (슬롯이 shrink-0·z-20을 붙여 준다).
  const header = (
    <>
      <header className="
        w-full flex justify-between items-center
        px-6 h-16 border-b border-outline-variant/30
        bg-surface/80 backdrop-blur-md
      ">
        {/* ✕(우측)와 폭을 맞춘 스페이서 — justify-between에서 가운데 배지를
            수평 중앙에 유지한다 (✕는 p-2 40px − mr-2 8px = 유효 32px) */}
        <div className="w-8" aria-hidden="true" />
        <div className="flex flex-col items-center gap-0.5 min-w-0">
          <TestTypeBadge testType={activeTest} />
          <span className={`text-[11px] font-bold ${theme.accentText}`}>
            {COPY.test.questionMeta(currentIndex + 1)}
          </span>
        </div>
        <button
          onClick={() => setShowExitConfirm(true)}
          className="text-outline hover:text-primary transition-colors p-2 -mr-2 rounded-full"
          aria-label={COPY.test.exitCloseLabel}
        >
          <span className="material-symbols-outlined">close</span>
        </button>
      </header>

      {/* 프로그레스 바 (트랙·필 모두 검사별 색) */}
      <ProgressBar
        percent={((currentIndex + 1) / totalQuestions) * 100}
        trackClassName={theme.containerBg}
        fillClassName={theme.accentBg}
        ariaLabel={COPY.test.questionProgress(currentIndex + 1, totalQuestions)}
      />
    </>
  );

  // ── 하단 네비게이션 (이전 / 다음 or 제출) ── 2026-08-27 UAT R1-08
  // 예전에는 콘텐츠 맨 끝(mt-auto)에 있어서, 선택지가 긴 문항에서는 스크롤을
  // 내려야 [다음]이 나타났다. 답을 고른 직후 눌러야 하는 버튼이 화면 밖에
  // 있으면 검사가 멈춘 것처럼 보인다. footer 슬롯으로 옮겨 문항 유형
  // (scale · yes-no · multiple-choice)과 무관하게 늘 같은 자리에 둔다.
  const footer = (
    <div className="px-6 pt-4 pb-6 flex flex-col gap-3 bg-surface border-t border-outline-variant/20">
      {/* 제출 실패 배너.
          submitTest가 실패하면 TestUnifiedPage가 결과 화면으로 넘어가지
          않는데, 예전에는 화면에 아무 변화가 없어 "제출 버튼이 안 눌린다"로
          보였다. 스토어 error를 그대로 렌더링한다 — 문구의 단일 출처가
          스토어라는 규약을 따르고, 재시도 시 submitTest가 error를 비운다.
          (플레이어 쪽 EvaluationPanel의 submitError 배너와 같은 형태) */}
      {error && (
        <div
          role="alert"
          className="w-full py-2.5 px-4 rounded-control bg-error-container/60 border border-error/30 text-[12px] text-on-error-container font-body text-center"
        >
          {error}
        </div>
      )}

      <div className="w-full flex gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={prevQuestion}
          className="w-1/3"
          disabled={isFirstQuestion || isSubmitting}
        >
          {COPY.test.prev}
        </Button>

        <Button
          type="button"
          variant="primary"
          onClick={handleNextOrSubmit}
          disabled={!isAnswered || isSubmitting}
          className="w-2/3"
        >
          {isSubmitting
            ? COPY.test.submitting
            : isLastQuestion
            ? COPY.test.submit
            : COPY.test.next}
        </Button>
      </div>
    </div>
  );

  return (
    <>
      <PageLayout className="animate-fadeIn" header={header} footer={footer}>
        {/* PageLayout이 시맨틱 <main>을 렌더링하므로 여기는 div여야 한다 (main 중첩 금지) */}
        <div className="px-6 pt-6 pb-8 min-h-full flex flex-col gap-6">

        {/* 질문 카드 */}
        <div className="w-full bento-card p-6 bg-surface-container/60 border border-card-border flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className={`text-[12px] px-3 py-1 rounded-full font-bold ${theme.containerGlow} ${theme.accentText}`}>
              {COPY.test.questionProgress(currentIndex + 1, totalQuestions)}
            </span>
            <span className="text-[12px] text-outline font-body">
              {currentQuestion.type === 'scale' && COPY.test.typeScale}
              {currentQuestion.type === 'yes-no' && COPY.test.typeYesNo}
              {currentQuestion.type === 'multiple-choice' && COPY.test.typeMultipleChoice}
            </span>
          </div>

          {/* ADHD 응답 기준 (UAT 2026-08-11 조세현).
              결과 화면에만 있던 "최근 6개월" 기준을 문항을 푸는 자리에도 둔다.
              ⚠️ ASRS 고유 프레이밍이라 스트레스 검사에는 노출하지 않는다 —
              스트레스 문항에는 기간 개념이 없어 없는 기준을 만들어 낸다.
              문항마다 같은 높이로 들어가므로 아래 h3의 줄 수 예약은 그대로다. */}
          {activeTest === 'adhd' && (
            <p className="flex items-start gap-1.5 text-[12px] leading-[18px] text-on-surface-variant font-body">
              <span className={`material-symbols-outlined text-[16px] leading-[18px] shrink-0 ${theme.accentText}`}>
                history
              </span>
              {COPY.test.adhdTimeframeNotice}
            </p>
          )}

          {/* 3줄(28px × 3) + pt-1(4px) = 88px를 항상 예약한다. 문항 길이에 따라
              카드가 줄었다 늘었다 하면 아래 선택지 전체의 y좌표가 문항마다
              달라진다(육안 검수 C5).

              예약 근거 — 콘텐츠 폭은 430px 프레임 − px-6×2(48) − 카드 p-6×2(48)
              = 334px. 현재 최장 문항은 ADHD 1번("어떤 일의 어려운 부분이 끝난
              후 …")으로 한글 45자 + 공백 16 + 문장부호 2 ≈ 905px 진행폭이라
              334px 폭에서 3줄이다(한글은 글자 단위로 줄바꿈된다). 스트레스
              12문항과 나머지 ADHD 문항은 모두 2줄 이하다.

              짧은 문항에서 최대 28px의 여백이 남는 것은 수용한 트레이드오프다.

              단, 예약은 폭에 의존한다 — 프레임이 좁아지면 같은 문항의 줄 수가
              늘어난다. 그래서 뷰포트가 412px 미만이면 4줄(116px)로 올려 잡는다
              (Tailwind v4의 max-[N]은 width < N, 즉 "미만"으로 컴파일된다):
              390px(콘텐츠 폭 294px)에서 ADHD 1번은 실제 4줄이고, 412px(316px)은
              2.9줄로 3줄 경계라 산정 오차 여유까지 포함한 문턱이다. 413px 이상
              (실질적으로 430px 프레임)은 3줄 예약이면 충분하다. */}
          <h3 className="text-[18px] leading-[28px] font-bold text-on-surface font-headline pt-1 min-h-[88px] max-[412px]:min-h-[116px]">
            {currentQuestion.question}
          </h3>
        </div>

        {/* 선택지 컴포넌트 렌더링 */}
        <div className="w-full flex-grow flex flex-col justify-center">
          {currentQuestion.type === 'scale' && (
            <ScaleSelector
              options={currentQuestion.options}
              testType={activeTest}
              selectedIndex={selectedOptionIndex}
              onSelect={(idx) => selectAnswer(currentQuestion.id, idx)}
            />
          )}

          {currentQuestion.type === 'yes-no' && (
            <YesNoSelector
              options={currentQuestion.options}
              testType={activeTest}
              selectedIndex={selectedOptionIndex}
              onSelect={(idx) => selectAnswer(currentQuestion.id, idx)}
            />
          )}

          {currentQuestion.type === 'multiple-choice' && (
            <MultipleChoiceSelector
              options={currentQuestion.options}
              testType={activeTest}
              selectedIndex={selectedOptionIndex}
              onSelect={(idx) => selectAnswer(currentQuestion.id, idx)}
            />
          )}
        </div>

        {/* 이전/다음 버튼과 제출 실패 배너는 이 자리가 아니라 PageLayout의
            footer 슬롯에 있다 (2026-08-27 UAT R1-08). 위 footer 상수 참고. */}
        </div>
      </PageLayout>

      {/* 이탈 확인 — 나가면 답안이 초기화되므로 되묻는다.
          #app-modal-root로 포털 렌더링되므로 PageLayout 밖에 둔다. */}
      <ConfirmDialog
        open={showExitConfirm}
        tone="destructive"
        icon="logout"
        title={COPY.test.exitConfirmTitle}
        message={COPY.test.exitConfirmBody}
        cancelLabel={COPY.test.exitConfirmCancel}
        confirmLabel={COPY.test.exitConfirmExit}
        onCancel={() => setShowExitConfirm(false)}
        onConfirm={handleConfirmExit}
      />
    </>
  );
}
