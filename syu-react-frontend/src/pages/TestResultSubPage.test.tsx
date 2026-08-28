// src/pages/TestResultSubPage.test.tsx
// @vitest-environment jsdom
//
// 결과 화면이 검사 종류·유형별로 "무엇을 보여주고 무엇을 감추는지"를 고정한다.
// 특히 판별 불가는 점수·유형 카드를 그리면 안 되고 재검사 버튼이 있어야 한다
// (결과가 저장되지 않은 상태이므로 화면이 완료처럼 보이면 안 된다).
//
// 이 저장소는 Firebase Auth가 Mock 모드를 따르지 않아 로컬에서 로그인 없이
// 검사 화면까지 클릭으로 도달할 수 없다. 그래서 플랜의 "Mock 모드 수동 확인"을
// 이 렌더 테스트로 대신한다.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { parseQuestionsCsv } from '../utils/csvParser';

import adhdCsv from '../assets/data/adhd_questions.csv?raw';
import stressCsv from '../assets/data/stress_questions.csv?raw';

vi.mock('../api/env', () => ({ IS_MOCK_MODE: true }));
vi.mock('../api/firebase', () => ({ db: {} }));

import TestResultSubPage from './TestResultSubPage';
import { useTestStore } from '../store/useTestStore';
import {
  STRESS_RESULT_TYPE_DESCRIPTION,
  STRESS_RESULT_TYPE_EMPHASIS,
} from '../constants/reactionType';

const adhdQuestions = parseQuestionsCsv(adhdCsv);
const stressQuestions = parseQuestionsCsv(stressCsv);

const resetStore = () =>
  useTestStore.setState({
    activeTest: null,
    questions: [],
    currentIndex: 0,
    answers: {},
    isLoading: false,
    isSubmitting: false,
    error: null,
    adhdResult: null,
    stressResult: null,
    invalidStressAttempt: false,
  });

beforeEach(resetStore);
afterEach(cleanup);

describe('TestResultSubPage — ADHD', () => {
  it('환산점수와 빈도 구간 설명문을 보여준다', () => {
    useTestStore.setState({
      activeTest: 'adhd',
      questions: adhdQuestions,
      adhdResult: {
        testType: 'adhd',
        answers: {},
        score: 63,
        rawScore: 15,
        completedAt: '2026-08-06T00:00:00.000Z',
      },
    });

    render(<TestResultSubPage testType="adhd" onGoHome={() => {}} />);

    expect(screen.getByText('63')).toBeInTheDocument();
    // 평균 2.5 → '때때로'와 '자주' 사이
    expect(
      screen.getByText(/'때때로\(한 달에 몇 번\)'과 '자주\(일주일에 몇 번\)' 사이의 빈도/),
    ).toBeInTheDocument();
    // 공통 설명문의 핵심 문장
    expect(screen.getByText(/백분위를 의미하지 않습니다/)).toBeInTheDocument();
  });
});

describe('TestResultSubPage — 스트레스', () => {
  it('혼합형(인지 3·정서 3·행동 1)은 유형 카드와 순환 안내를 함께 보여준다', () => {
    useTestStore.setState({
      activeTest: 'stress',
      questions: stressQuestions,
      stressResult: {
        testType: 'stress',
        answers: {},
        score: 7,
        counts: { cognitive: 3, emotional: 3, behavioral: 1 },
        resultType: 'cognitive-emotional',
        completedAt: '2026-08-06T00:00:00.000Z',
      },
    });

    render(<TestResultSubPage testType="stress" onGoHome={() => {}} />);

    expect(screen.getByText('나의 반응 유형은 인지·정서형입니다')).toBeInTheDocument();
    expect(screen.getByText('훈련은 해당 유형들을 번갈아 진행합니다.')).toBeInTheDocument();
    // 비율 막대 3개 — (3,3,1)/7 → 43% · 43% · 14%
    expect(screen.getByLabelText('인지 43%')).toBeInTheDocument();
    expect(screen.getByLabelText('정서 43%')).toBeInTheDocument();
    expect(screen.getByLabelText('행동 14%')).toBeInTheDocument();
    expect(screen.getByText("12문항 중 '예' 7개")).toBeInTheDocument();
  });

  it('단일형은 순환 안내를 붙이지 않는다', () => {
    useTestStore.setState({
      activeTest: 'stress',
      questions: stressQuestions,
      stressResult: {
        testType: 'stress',
        answers: {},
        score: 5,
        counts: { cognitive: 4, emotional: 1, behavioral: 0 },
        resultType: 'cognitive',
        completedAt: '2026-08-06T00:00:00.000Z',
      },
    });

    render(<TestResultSubPage testType="stress" onGoHome={() => {}} />);

    expect(screen.getByText('나의 반응 유형은 인지형입니다')).toBeInTheDocument();
    expect(screen.queryByText('훈련은 해당 유형들을 번갈아 진행합니다.')).not.toBeInTheDocument();
  });

  // 설명문 원문은 그대로 두고 핵심 구절만 굵게 얹는다 (2026-08-07 검수 확정).
  // 구절 목록과 원문의 정합성은 constants/reactionType.test.ts가 지킨다.
  it('유형 설명문은 원문을 그대로 유지한 채 핵심 구절만 굵게 표시한다', () => {
    useTestStore.setState({
      activeTest: 'stress',
      questions: stressQuestions,
      stressResult: {
        testType: 'stress',
        answers: {},
        score: 5,
        counts: { cognitive: 4, emotional: 1, behavioral: 0 },
        resultType: 'cognitive',
        completedAt: '2026-08-06T00:00:00.000Z',
      },
    });

    const { container } = render(<TestResultSubPage testType="stress" onGoHome={() => {}} />);

    const strongs = Array.from(container.querySelectorAll('strong'));
    expect(strongs.length).toBe(STRESS_RESULT_TYPE_EMPHASIS.cognitive.length);
    expect(strongs.map((el) => el.textContent)).toEqual([
      ...STRESS_RESULT_TYPE_EMPHASIS.cognitive,
    ]);
    // 원문은 한 글자도 빠지거나 늘지 않는다
    expect(container.textContent).toContain(STRESS_RESULT_TYPE_DESCRIPTION.cognitive);
  });

  it('판별 불가는 점수·유형 대신 안내문과 "다시 검사하기"를 보여준다', () => {
    useTestStore.setState({
      activeTest: 'stress',
      questions: stressQuestions,
      stressResult: null,
      invalidStressAttempt: true,
    });

    render(
      <TestResultSubPage testType="stress" onGoHome={() => {}} onRetryTest={() => {}} />,
    );

    expect(screen.getByText('반응 유형을 판별하지 못했어요')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /다시 검사하기/ })).toBeInTheDocument();
    // 완료 배지·유형 카드는 나오지 않는다
    expect(screen.queryByText('검사 2/2 완료!')).not.toBeInTheDocument();
    expect(screen.queryByText(/나의 반응 유형은/)).not.toBeInTheDocument();
  });
});

// 배지는 검사 2종 중 몇 번째를 마쳤는지 알리고, 색은 검사별 별칭 컨테이너를 쓴다
// (2026-08-07 검수 확정). 이전 문구 'Step N 클리어!'는 온보딩 단계 번호였다.
describe('TestResultSubPage — 완료 배지', () => {
  it('ADHD는 "검사 1/2 완료!"를 ADHD 컨테이너 색으로 보여준다', () => {
    useTestStore.setState({
      activeTest: 'adhd',
      questions: adhdQuestions,
      adhdResult: {
        testType: 'adhd',
        answers: {},
        score: 63,
        rawScore: 15,
        completedAt: '2026-08-06T00:00:00.000Z',
      },
    });

    render(<TestResultSubPage testType="adhd" onGoHome={() => {}} />);

    const badge = screen.getByText('검사 1/2 완료!');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('bg-test-adhd-container', 'text-test-adhd-on-container');
  });

  it('스트레스는 "검사 2/2 완료!"를 스트레스 컨테이너 색으로 보여준다', () => {
    useTestStore.setState({
      activeTest: 'stress',
      questions: stressQuestions,
      stressResult: {
        testType: 'stress',
        answers: {},
        score: 5,
        counts: { cognitive: 4, emotional: 1, behavioral: 0 },
        resultType: 'cognitive',
        completedAt: '2026-08-06T00:00:00.000Z',
      },
    });

    render(<TestResultSubPage testType="stress" onGoHome={() => {}} />);

    const badge = screen.getByText('검사 2/2 완료!');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('bg-test-stress-container', 'text-test-stress-on-container');
    // 카드 안쪽 배지도 같은 검사 액센트로 통일한다
    expect(screen.getByText('나의 스트레스 반응 유형')).toHaveClass('bg-test-stress-container');
  });
});
