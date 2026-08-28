// src/store/useTestStore.test.ts
// 검사 스토어의 "현재 동작"을 고정하는 특성화 테스트(characterization test).
//
// csvParser.test.ts와 같은 성격입니다. 올바른 사양을 정의하는 것이 아니라,
// 스토어 로직을 수정할 때 무엇이 달라졌는지 즉시 드러나게 하는 기준선입니다.
//
// 2026-08-06 2축 개편으로 submitTest의 "선택지 인덱스 단순 합산" 임시 로직이
// 확정 채점 스펙으로 교체되면서 점수 관련 케이스가 전부 갱신되었습니다.
// 채점 규칙 자체의 검증은 utils/testScoring.test.ts가 담당하고, 여기서는
// 스토어의 책임(문항 로드 · 저장 경로 · 판별 불가 시 미저장)만 고정합니다.
//
// Firestore/Firebase는 모킹하고 Mock 모드(localStorage 경로)로 고정해 테스트합니다.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseQuestionsCsv, type QuestionItem } from '../utils/csvParser';

import adhdCsv from '../assets/data/adhd_questions.csv?raw';
import stressCsv from '../assets/data/stress_questions.csv?raw';

vi.mock('../api/env', () => ({ IS_MOCK_MODE: true }));
vi.mock('../api/firebase', () => ({ db: {} }));

import { useTestStore } from './useTestStore';

const adhdQuestions = parseQuestionsCsv(adhdCsv);
const stressQuestions = parseQuestionsCsv(stressCsv);

/** 전 문항에 같은 선택지를 답한 answers */
const answerAll = (questions: QuestionItem[], optionIndex: number): Record<number, number> =>
  Object.fromEntries(questions.map((q) => [q.id, optionIndex]));

// vitest 기본 환경(node)에는 localStorage가 없으므로 Map 기반 스텁을 주입합니다.
const storage = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => void storage.set(key, value),
  removeItem: (key: string) => void storage.delete(key),
  clear: () => storage.clear(),
});

const makeQuestion = (id: number): QuestionItem => ({
  id,
  part: '주의력',
  question: `문항 ${id}`,
  type: 'scale',
  options: ['전혀 아니다', '가끔', '자주', '항상'],
});

beforeEach(() => {
  storage.clear();
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
});

describe('selectAnswer', () => {
  it('questionId별로 선택한 옵션 인덱스를 저장한다', () => {
    useTestStore.getState().selectAnswer(1, 2);
    useTestStore.getState().selectAnswer(2, 0);

    expect(useTestStore.getState().answers).toEqual({ 1: 2, 2: 0 });
  });

  it('같은 문항을 다시 선택하면 기존 답변을 덮어쓴다', () => {
    useTestStore.getState().selectAnswer(1, 3);
    useTestStore.getState().selectAnswer(1, 0);

    expect(useTestStore.getState().answers).toEqual({ 1: 0 });
  });

  // 2026-08-07 검수 확정: 같은 선택지 재클릭은 선택 해제다.
  it('같은 선택지를 다시 누르면 해당 문항의 답변이 사라진다 (토글 해제)', () => {
    useTestStore.getState().selectAnswer(1, 2);
    useTestStore.getState().selectAnswer(1, 2);

    expect(useTestStore.getState().answers).toEqual({});
  });

  it('해제는 값을 남기지 않고 키 자체를 지운다 (미응답과 0번 선택지를 구분)', () => {
    useTestStore.getState().selectAnswer(1, 0);
    useTestStore.getState().selectAnswer(1, 0);

    expect(useTestStore.getState().answers).not.toHaveProperty('1');
    expect(useTestStore.getState().answers[1]).toBeUndefined();
  });

  it('해제해도 다른 문항의 답변은 남는다', () => {
    useTestStore.getState().selectAnswer(1, 2);
    useTestStore.getState().selectAnswer(2, 1);
    useTestStore.getState().selectAnswer(1, 2);

    expect(useTestStore.getState().answers).toEqual({ 2: 1 });
  });

  it('해제한 문항을 다시 선택하면 정상적으로 저장된다', () => {
    useTestStore.getState().selectAnswer(1, 2);
    useTestStore.getState().selectAnswer(1, 2);
    useTestStore.getState().selectAnswer(1, 2);

    expect(useTestStore.getState().answers).toEqual({ 1: 2 });
  });
});

// 2026-08-07 검수 확정: 진행 화면 이탈(헤더 뒤로가기·닫기) 시 답안을 버린다.
describe('resetAnswers', () => {
  it('답안과 현재 인덱스를 초기화한다', () => {
    useTestStore.setState({
      questions: [makeQuestion(1), makeQuestion(2), makeQuestion(3)],
      currentIndex: 2,
      answers: { 1: 3, 2: 1 },
    });

    useTestStore.getState().resetAnswers();

    expect(useTestStore.getState().answers).toEqual({});
    expect(useTestStore.getState().currentIndex).toBe(0);
  });

  it('문항과 검사 종류는 유지한다 (준비 화면에서 재시작 시 재조회 불필요)', () => {
    useTestStore.setState({
      activeTest: 'stress',
      questions: [makeQuestion(1), makeQuestion(2)],
      answers: { 1: 0 },
    });

    useTestStore.getState().resetAnswers();

    expect(useTestStore.getState().activeTest).toBe('stress');
    expect(useTestStore.getState().questions).toHaveLength(2);
  });
});

describe('nextQuestion / prevQuestion', () => {
  beforeEach(() => {
    useTestStore.setState({ questions: [makeQuestion(1), makeQuestion(2), makeQuestion(3)] });
  });

  it('nextQuestion은 인덱스를 1 증가시킨다', () => {
    useTestStore.getState().nextQuestion();
    expect(useTestStore.getState().currentIndex).toBe(1);
  });

  it('마지막 문항에서는 nextQuestion이 더 진행되지 않는다', () => {
    useTestStore.setState({ currentIndex: 2 });
    useTestStore.getState().nextQuestion();
    expect(useTestStore.getState().currentIndex).toBe(2);
  });

  it('prevQuestion은 인덱스를 1 감소시킨다', () => {
    useTestStore.setState({ currentIndex: 2 });
    useTestStore.getState().prevQuestion();
    expect(useTestStore.getState().currentIndex).toBe(1);
  });

  it('첫 문항에서는 prevQuestion이 0 아래로 내려가지 않는다', () => {
    useTestStore.getState().prevQuestion();
    expect(useTestStore.getState().currentIndex).toBe(0);
  });
});

describe('initTest (Mock 모드 — 로컬 CSV 폴백)', () => {
  it('adhd는 로컬 확정 CSV 6문항을 로드한다', async () => {
    await useTestStore.getState().initTest('adhd');

    const state = useTestStore.getState();
    expect(state.activeTest).toBe('adhd');
    expect(state.questions).toHaveLength(6);
    expect(state.currentIndex).toBe(0);
    expect(state.answers).toEqual({});
  });

  it('stress는 로컬 확정 CSV 12문항을 로드한다', async () => {
    await useTestStore.getState().initTest('stress');
    expect(useTestStore.getState().questions).toHaveLength(12);
  });

  it('직전 판별 불가 플래그를 초기화한다', async () => {
    useTestStore.setState({ invalidStressAttempt: true });

    await useTestStore.getState().initTest('stress');

    expect(useTestStore.getState().invalidStressAttempt).toBe(false);
  });
});

describe('submitTest (Mock 모드)', () => {
  it('activeTest가 없으면 저장하지 않고 false를 반환한다', async () => {
    const ok = await useTestStore.getState().submitTest('uid-1');
    expect(ok).toBe(false);
  });

  it('ADHD는 환산점수(score)와 원점수(rawScore)를 함께 저장한다', async () => {
    useTestStore.setState({
      activeTest: 'adhd',
      questions: adhdQuestions,
      answers: { 1: 4, 2: 4, 3: 4, 4: 3, 5: 0, 6: 0 },
    });

    const ok = await useTestStore.getState().submitTest('uid-1');

    expect(ok).toBe(true);
    const result = useTestStore.getState().adhdResult;
    expect(result?.testType).toBe('adhd');
    expect(result?.rawScore).toBe(15);
    expect(result?.score).toBe(63); // (15/24)*100 반올림
    expect(result?.answers).toEqual({ 1: 4, 2: 4, 3: 4, 4: 3, 5: 0, 6: 0 });
    expect(useTestStore.getState().isSubmitting).toBe(false);
  });

  it('스트레스는 counts와 resultType을 함께 저장한다', async () => {
    useTestStore.setState({
      activeTest: 'stress',
      questions: stressQuestions,
      // 인지 3 · 정서 3 · 행동 1 → 혼합형(인지·정서형)
      answers: {
        1: 0, 2: 0, 3: 0, 4: 1,
        5: 0, 6: 0, 7: 0, 8: 1,
        9: 0, 10: 1, 11: 1, 12: 1,
      },
    });

    await useTestStore.getState().submitTest('uid-1');

    const saved = JSON.parse(localStorage.getItem('react_test_stress_uid-1') ?? 'null');
    expect(saved?.testType).toBe('stress');
    expect(saved?.score).toBe(7); // '예' 총수
    expect(saved?.counts).toEqual({ cognitive: 3, emotional: 3, behavioral: 1 });
    expect(saved?.resultType).toBe('cognitive-emotional');

    const state = useTestStore.getState();
    expect(state.stressResult?.resultType).toBe('cognitive-emotional');
    expect(state.invalidStressAttempt).toBe(false);
  });

  it('판별 불가(전부 "예")는 저장하지도 stressResult를 세팅하지도 않는다', async () => {
    useTestStore.setState({
      activeTest: 'stress',
      questions: stressQuestions,
      answers: answerAll(stressQuestions, 0),
    });

    const ok = await useTestStore.getState().submitTest('uid-1');

    // 결과 화면으로는 넘어가되(true), 검사 완료로 치지 않는다 —
    // stressResult가 서면 시나리오 게이트가 열려버린다.
    expect(ok).toBe(true);
    expect(useTestStore.getState().stressResult).toBeNull();
    expect(useTestStore.getState().invalidStressAttempt).toBe(true);
    expect(localStorage.getItem('react_test_stress_uid-1')).toBeNull();
  });

  it('판별 불가(전부 "아니요")도 같은 경로를 탄다', async () => {
    useTestStore.setState({
      activeTest: 'stress',
      questions: stressQuestions,
      answers: answerAll(stressQuestions, 1),
    });

    await useTestStore.getState().submitTest('uid-1');

    expect(useTestStore.getState().stressResult).toBeNull();
    expect(useTestStore.getState().invalidStressAttempt).toBe(true);
  });

  it('저장한 결과를 fetchTestResults로 같은 키에서 다시 읽어온다', async () => {
    useTestStore.setState({
      activeTest: 'adhd',
      questions: adhdQuestions,
      answers: answerAll(adhdQuestions, 2),
    });
    await useTestStore.getState().submitTest('uid-1');
    useTestStore.setState({ adhdResult: null, stressResult: null });

    await useTestStore.getState().fetchTestResults('uid-1');

    expect(useTestStore.getState().adhdResult?.rawScore).toBe(12);
    expect(useTestStore.getState().adhdResult?.score).toBe(50);
    expect(useTestStore.getState().stressResult).toBeNull();
  });
});

describe('resetTestProgress', () => {
  it('진행 상태만 초기화하고 저장된 검사 결과는 유지한다', async () => {
    useTestStore.setState({
      activeTest: 'adhd',
      questions: adhdQuestions,
      answers: answerAll(adhdQuestions, 2),
    });
    await useTestStore.getState().submitTest('uid-1');
    useTestStore.setState({ questions: [makeQuestion(1)], currentIndex: 1 });

    useTestStore.getState().resetTestProgress();

    const state = useTestStore.getState();
    expect(state.activeTest).toBeNull();
    expect(state.questions).toEqual([]);
    expect(state.currentIndex).toBe(0);
    expect(state.answers).toEqual({});
    expect(state.adhdResult?.score).toBe(50); // 결과는 지우지 않는 것이 현재 동작
  });

  // 검사 화면을 떠날 때(언마운트) 호출되므로, 여기서 지우면 판별 불가로 끝난
  // 직후 홈으로 나가는 순간 플래그가 사라져 홈의 재검사 안내가 절대 못 뜬다.
  it('판별 불가 플래그는 남긴다 (홈의 재검사 안내가 이 값을 읽는다)', () => {
    useTestStore.setState({ invalidStressAttempt: true });

    useTestStore.getState().resetTestProgress();

    expect(useTestStore.getState().invalidStressAttempt).toBe(true);
  });
});

describe('invalidStressAttempt 수명', () => {
  it('ADHD 검사를 새로 시작해도 지우지 않는다', async () => {
    useTestStore.setState({ invalidStressAttempt: true });

    await useTestStore.getState().initTest('adhd');

    expect(useTestStore.getState().invalidStressAttempt).toBe(true);
  });

  it('데이터 초기화(deleteTestResults)는 함께 지운다', async () => {
    useTestStore.setState({ invalidStressAttempt: true });

    await useTestStore.getState().deleteTestResults('uid-1');

    expect(useTestStore.getState().invalidStressAttempt).toBe(false);
  });
});
