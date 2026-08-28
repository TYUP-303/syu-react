// src/pages/TestExecutionSubPage.test.tsx
// @vitest-environment jsdom
//
// 진행 화면의 "이전 문항 vs 검사 이탈" 역할 분리 계약을 고정한다 (2026-08-08 확정).
//   - 하단 [이전]은 문항 이동 전용이다. 답안을 지우지 않고, 1번 문항에서는 비활성.
//   - 상단 ✕는 검사 이탈 전용이며 반드시 확인 모달을 거친다 (←는 "한 단계
//     뒤로" 기호가 전체 이탈과 어긋나 제거됨, 2026-08-08 검수 확정).
// 이전에는 하단 [이전]과 상단 ←가 같은 핸들러를 공유해, 1번 문항에서 [이전]을
// 누르면 답안이 통째로 날아가는데도 경고가 없었다.
//
// 이탈 후 "답안 초기화 + 홈 이동"은 TestUnifiedPage.handleExitTest의 책임이므로
// 여기서는 onExit이 불렸는지/안 불렸는지만 확인한다.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { parseQuestionsCsv } from '../utils/csvParser';

import adhdCsv from '../assets/data/adhd_questions.csv?raw';
import stressCsv from '../assets/data/stress_questions.csv?raw';

vi.mock('../api/env', () => ({ IS_MOCK_MODE: true }));
vi.mock('../api/firebase', () => ({ db: {} }));

import TestExecutionSubPage from './TestExecutionSubPage';
import { useTestStore } from '../store/useTestStore';
import { COPY } from '../constants/copy';

const questions = parseQuestionsCsv(adhdCsv);
const stressQuestions = parseQuestionsCsv(stressCsv);

const onExit = vi.fn();
const onComplete = vi.fn();

function seed(currentIndex: number, answers: Record<number, number> = {}, error: string | null = null) {
  useTestStore.setState({
    activeTest: 'adhd',
    questions,
    currentIndex,
    answers,
    isSubmitting: false,
    error,
  });
}

function seedStress(currentIndex: number, answers: Record<number, number> = {}) {
  useTestStore.setState({
    activeTest: 'stress',
    questions: stressQuestions,
    currentIndex,
    answers,
    isSubmitting: false,
    error: null,
  });
}

const renderPage = () =>
  render(<TestExecutionSubPage onExit={onExit} onComplete={onComplete} />);

beforeEach(() => {
  onExit.mockClear();
  onComplete.mockClear();
  // Modal은 #app-modal-root로 포털 렌더링된다 (MobileWrapper가 소유).
  const root = document.createElement('div');
  root.id = 'app-modal-root';
  document.body.appendChild(root);
});

afterEach(() => {
  cleanup();
  document.getElementById('app-modal-root')?.remove();
  useTestStore.setState({
    activeTest: null,
    questions: [],
    currentIndex: 0,
    answers: {},
    isSubmitting: false,
    error: null,
  });
});

describe('TestExecutionSubPage — 하단 [이전] (문항 이동 전용)', () => {
  it('1번 문항에서는 비활성이라 검사를 벗어날 수 없다', () => {
    seed(0);
    renderPage();

    expect(screen.getByRole('button', { name: COPY.test.prev })).toBeDisabled();
  });

  it('답안을 지우지 않고 이전 문항으로만 이동한다', async () => {
    const user = userEvent.setup();
    const answers = { 1: 3, 2: 1, 3: 0 };
    seed(2, answers);
    renderPage();

    await user.click(screen.getByRole('button', { name: COPY.test.prev }));

    expect(useTestStore.getState().currentIndex).toBe(1);
    expect(useTestStore.getState().answers).toEqual(answers);
    expect(screen.getByText(questions[1].question)).toBeInTheDocument();
    expect(onExit).not.toHaveBeenCalled();
  });
});

describe('TestExecutionSubPage — 상단 이탈 버튼 (확인 모달 경유)', () => {
  it('✕를 눌러도 곧바로 나가지 않고 확인 모달을 띄운다', async () => {
    const user = userEvent.setup();
    seed(1, { 1: 2 });
    renderPage();

    await user.click(screen.getByRole('button', { name: COPY.test.exitCloseLabel }));

    expect(screen.getByText(COPY.test.exitConfirmTitle)).toBeInTheDocument();
    expect(onExit).not.toHaveBeenCalled();
  });

  it('모달에서 나가기를 확인하면 이탈 경로를 탄다', async () => {
    const user = userEvent.setup();
    seed(1, { 1: 2 });
    renderPage();

    await user.click(screen.getByRole('button', { name: COPY.test.exitCloseLabel }));
    await user.click(screen.getByRole('button', { name: COPY.test.exitConfirmExit }));

    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('모달을 취소하면 나가지 않고 보던 문항에 그대로 머문다', async () => {
    const user = userEvent.setup();
    seed(1, { 1: 2 });
    renderPage();

    await user.click(screen.getByRole('button', { name: COPY.test.exitCloseLabel }));
    await user.click(screen.getByRole('button', { name: COPY.test.exitConfirmCancel }));

    expect(onExit).not.toHaveBeenCalled();
    expect(screen.queryByText(COPY.test.exitConfirmTitle)).not.toBeInTheDocument();
    expect(screen.getByText(questions[1].question)).toBeInTheDocument();
    expect(useTestStore.getState().currentIndex).toBe(1);
    expect(useTestStore.getState().answers).toEqual({ 1: 2 });
  });
});

// submitTest가 실패하면 TestUnifiedPage가 결과 화면으로 넘어가지 않는다.
// 예전에는 화면에 아무 변화가 없어 "제출 버튼이 안 눌린다"로 보였다.
describe('TestExecutionSubPage — 제출 실패 노출', () => {
  it('스토어 error가 있으면 제출 버튼 위에 배너로 드러난다', () => {
    seed(5, { 1: 2 }, COPY.errors.testSaveFailed);
    renderPage();

    expect(screen.getByRole('alert')).toHaveTextContent(COPY.errors.testSaveFailed);
  });

  it('error가 없으면 배너를 그리지 않는다', () => {
    seed(5, { 1: 2 });
    renderPage();

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

// ── UAT 2026-08-11 조세현 (심리 전문가) ──
// 문항을 푸는 화면은 응답에 영향을 주는 정보를 딱 두 가지 원칙으로 다룬다:
//   (a) 답할 기준이 되는 정보는 보여준다 — 단, 그 검사에 실제로 있는 기준만.
//   (b) 무엇을 재는지(측정 차원)는 보여주지 않는다 — 응답 편향이 생긴다.
describe('TestExecutionSubPage — ADHD 응답 기준 "최근 6개월"', () => {
  it('ADHD 문항에서는 기준 문구가 보인다', () => {
    seed(0);
    renderPage();

    expect(screen.getByText(COPY.test.adhdTimeframeNotice)).toBeInTheDocument();
  });

  // '최근 6개월'은 ASRS 고유 프레이밍이다. 스트레스 검사에는 기간 개념이
  // 없으므로 여기에 새면 없는 기준을 만들어 낸다.
  it('스트레스 문항에서는 기준 문구를 그리지 않는다', () => {
    seedStress(0);
    renderPage();

    expect(screen.queryByText(COPY.test.adhdTimeframeNotice)).not.toBeInTheDocument();
  });
});

describe('TestExecutionSubPage — 측정 차원(영역) 비노출', () => {
  it('스트레스 문항에 part(인지·정서·행동)를 붙이지 않는다', () => {
    // 1번 문항의 part는 '인지'다 — 예전에는 "Q1. (인지 영역)"으로 새어 나갔다.
    expect(stressQuestions[0].part).toBe('인지');

    seedStress(0);
    renderPage();

    expect(screen.getByText('Q1.')).toBeInTheDocument();
    expect(screen.queryByText(/영역/)).not.toBeInTheDocument();
    expect(screen.queryByText(/인지|정서|행동/)).not.toBeInTheDocument();
  });

  it('ADHD 문항도 번호만 보여준다', () => {
    seed(2);
    renderPage();

    expect(screen.getByText('Q3.')).toBeInTheDocument();
    expect(screen.queryByText(/영역/)).not.toBeInTheDocument();
  });
});
