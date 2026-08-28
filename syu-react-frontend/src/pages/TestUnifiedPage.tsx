// src/pages/TestUnifiedPage.tsx
// ADHD 및 스트레스 검사의 전체 흐름(준비 -> 진행 -> 결과)을 통합 제어하는 최상위 페이지

import { useState, useEffect } from 'react';
import { useTestStore } from '../store/useTestStore';
import { useAuthStore } from '../store/useAuthStore';
import TestPrepSubPage from './TestPrepSubPage';
import TestExecutionSubPage from './TestExecutionSubPage';
import TestResultSubPage from './TestResultSubPage';

interface TestUnifiedPageProps {
  testType: 'adhd' | 'stress';
  onGoHome: () => void;
  onGoToStressTest?: () => void;
}

type TestStep = 'prep' | 'execution' | 'result';

export default function TestUnifiedPage({
  testType,
  onGoHome,
  onGoToStressTest,
}: TestUnifiedPageProps) {
  const [step, setStep] = useState<TestStep>('prep');
  const { initTest, submitTest, resetAnswers, resetTestProgress } = useTestStore();
  const { user } = useAuthStore();

  // 검사 종류가 바뀌거나 페이지 진입 시 문항 초기화
  useEffect(() => {
    initTest(testType);
    setStep('prep');

    return () => {
      resetTestProgress();
    };
  }, [testType, initTest, resetTestProgress]);

  const handleStartTest = () => {
    setStep('execution');
  };

  // 진행 화면 ✕로 이탈하면 답안을 버리고 **홈으로** 나간다 (2026-08-08 확정).
  //
  // 답안을 버리는 것은 2026-08-07 검수 확정 그대로다. 바뀐 것은 도착지다 —
  // 확인 모달의 버튼 라벨이 "나가기"인데 실제로는 준비 화면에 그대로 남아
  // 있어서, 나가겠다고 답한 사용자가 같은 검사 화면을 다시 마주했다.
  // 라벨과 도착지를 일치시킨다. (준비 화면 복귀가 필요한 소비처는 없다 —
  // TestExecutionSubPage 한 곳만 이 콜백을 쓴다.)
  const handleExitTest = () => {
    resetAnswers();
    onGoHome();
  };

  const handleCompleteTest = async () => {
    const uid = user?.uid ?? 'guest_user';
    const success = await submitTest(uid);
    if (success) {
      setStep('result');
    }
  };

  // 스트레스 검사가 '판별 불가'로 끝났을 때의 재검사 동선 (2026-08-06 확정).
  // 홈으로 나가지 않고 문항 1번부터 다시 시작한다 — initTest가 답안과
  // invalidStressAttempt 플래그를 함께 초기화한다.
  const handleRetryTest = async () => {
    await initTest(testType);
    setStep('execution');
  };

  return (
    <div className="w-full h-full bg-surface">
      {step === 'prep' && (
        <TestPrepSubPage
          testType={testType}
          onStart={handleStartTest}
          onBack={onGoHome}
        />
      )}

      {step === 'execution' && (
        <TestExecutionSubPage
          onExit={handleExitTest}
          onComplete={handleCompleteTest}
        />
      )}

      {step === 'result' && (
        <TestResultSubPage
          testType={testType}
          onGoHome={onGoHome}
          onNextTest={testType === 'adhd' ? onGoToStressTest : undefined}
          onRetryTest={handleRetryTest}
        />
      )}
    </div>
  );
}
