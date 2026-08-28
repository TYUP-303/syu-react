// src/pages/TestResultSubPage.tsx
// 검사 결과 서브 페이지 — 검사 종류별 뷰(ADHD / 스트레스 / 판별 불가)를 고르고
// 헤더·CTA만 책임진다. 점수 표시와 설명문은 components/test/의 카드가 그린다.
//
// 데이터는 useTestStore의 adhdResult / stressResult에서 읽는다. 스트레스 검사가
// '판별 불가'였다면 결과가 저장되지 않고 invalidStressAttempt만 서 있으므로,
// 점수 대신 안내문과 "다시 검사하기"를 보여준다 (2026-08-06 확정).

import PageLayout from '../components/ui/PageLayout';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';
import AdhdResultCard from '../components/test/AdhdResultCard';
import StressResultCard from '../components/test/StressResultCard';
import StressUndeterminedCard from '../components/test/StressUndeterminedCard';
import { COPY } from '../constants/copy';
import { TEST_THEME } from '../constants/testTheme';
import { useTestStore } from '../store/useTestStore';

interface TestResultSubPageProps {
  testType: 'adhd' | 'stress';
  onGoHome: () => void;
  onNextTest?: () => void;
  /** 판별 불가 시 검사를 처음부터 다시 시작한다 */
  onRetryTest?: () => void;
}

export default function TestResultSubPage({
  testType,
  onGoHome,
  onNextTest,
  onRetryTest,
}: TestResultSubPageProps) {
  const isAdhd = testType === 'adhd';
  const t = COPY.test.byType[testType];
  // 진행 화면과 같은 검사별 색 축. 원색 토큰을 직접 쓰지 말 것 — constants/testTheme.ts 참고
  const theme = TEST_THEME[testType];

  const adhdResult = useTestStore((s) => s.adhdResult);
  const stressResult = useTestStore((s) => s.stressResult);
  const invalidStressAttempt = useTestStore((s) => s.invalidStressAttempt);
  const questions = useTestStore((s) => s.questions);

  const result = isAdhd ? adhdResult : stressResult;
  const isUndetermined = !isAdhd && invalidStressAttempt;

  const footer = (
    <div className="px-6 pt-4 pb-6 flex flex-col gap-3 bg-surface border-t border-outline-variant/20">
      {isUndetermined && onRetryTest ? (
        <>
          <Button variant="primary" onClick={onRetryTest} icon="refresh">
            {COPY.test.resultRetryTest}
          </Button>
          <Button variant="outline" onClick={onGoHome}>
            {COPY.test.resultLater}
          </Button>
        </>
      ) : isAdhd && onNextTest ? (
        <>
          <Button variant="primary" onClick={onNextTest} icon="arrow_forward">
            {COPY.test.resultNextTest}
          </Button>
          <Button variant="outline" onClick={onGoHome}>
            {COPY.test.resultLater}
          </Button>
        </>
      ) : (
        <Button variant="primary" onClick={onGoHome} icon="home">
          {COPY.test.resultGoHome}
        </Button>
      )}
    </div>
  );

  return (
    <PageLayout
      className="animate-fadeIn"
      header={<PageHeader title={t.resultNavTitle} onClose={onGoHome} />}
      footer={footer}
      contentClassName="px-6 pt-6 pb-8"
    >
      <div className="flex flex-col gap-5">
        {/* 완료 배지 · 헤드라인 */}
        {!isUndetermined && (
          <div className="flex flex-col items-center gap-2 text-center">
            <span
              className={`text-[12px] px-3 py-1 rounded-full font-bold ${theme.containerBg} ${theme.onContainerText}`}
            >
              {t.resultStepBadge}
            </span>
            <h2 className="text-[20px] font-bold text-on-surface font-headline">
              {t.resultHeadline}
            </h2>
          </div>
        )}

        {isUndetermined ? (
          <StressUndeterminedCard />
        ) : isAdhd ? (
          result && (
            <AdhdResultCard
              result={result}
              optionLabels={questions[0]?.options ?? []}
              questionCount={questions.length}
            />
          )
        ) : (
          result?.counts &&
          result.resultType && (
            <StressResultCard
              counts={result.counts}
              resultType={result.resultType}
              yesCount={result.score}
              questionCount={questions.length || Object.keys(result.answers).length}
            />
          )
        )}
      </div>
    </PageLayout>
  );
}
