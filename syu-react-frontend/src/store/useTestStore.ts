// src/store/useTestStore.ts
// ADHD 및 스트레스 검사의 문항 로드, 진행 상태, 답안 제출을 관리하는 Zustand 스토어

import { create } from 'zustand';
import { db } from '../api/firebase';
import { IS_MOCK_MODE } from '../api/env';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { COLLECTIONS, CSV_TEXT_FIELD, USER_FIELDS } from '../api/firestoreKeys';
import { parseQuestionsCsv, type QuestionItem } from '../utils/csvParser';
import type { ReactionTypeKey, StressResultType } from '../constants/reactionType';
import { scoreAdhdTest, scoreStressTest } from '../utils/testScoring';

import adhdCsv from '../assets/data/adhd_questions.csv?raw';
import stressCsv from '../assets/data/stress_questions.csv?raw';
import { COPY } from '../constants/copy';

export interface TestResultData {
  testType: 'adhd' | 'stress';
  answers: Record<number, number>; // questionId -> selectedOptionIndex
  // ADHD: 환산점수 0~100 / 스트레스: '예' 총수 0~12 (검사 종류로 의미가 다르다)
  score: number;
  completedAt: string;
  // ── 2축 개편 공유 계약 필드 — T 패키지(검사 엔진)가 채운다 ──
  // 계약: docs/superpowers/plans/2026-08-06-axis-master.md
  // 확정 채점 스펙: docs/superpowers/specs/2026-08-06-test-content-spec.md
  rawScore?: number; // ADHD: 응답 배점 원점수 합 (ASRS-6 기준 0~24). score는 (raw/24)*100 환산
  counts?: Record<ReactionTypeKey, number>; // 스트레스: 영역별 '예' 응답 수 (각 0~4)
  // 스트레스: 8유형 분류. 표시·설명문용이자 시나리오 분기의 입력 —
  // 에피소드 배치는 getReactionTypeCycle(resultType) 순환 규칙을 따른다.
  // 'undetermined'는 저장하지 않는다(검사 미완료 처리·재검사 유도).
  // 없으면 레거시 데이터 → 소비처는 ['cognitive'] 폴백.
  resultType?: StressResultType;
}

interface TestState {
  activeTest: 'adhd' | 'stress' | null;
  questions: QuestionItem[];
  currentIndex: number;
  answers: Record<number, number>; // questionId -> optionIndex
  isLoading: boolean;
  isSubmitting: boolean;
  error: string | null;

  // 유저 DB 저장 결과
  adhdResult: TestResultData | null;
  stressResult: TestResultData | null;

  /**
   * 직전 스트레스 검사 제출이 '판별 불가'였는지 (2026-08-06 확정).
   * 전부 '예'/전부 '아니요'는 검사 미완료로 처리해 stressResult를 세팅하지도
   * 저장하지도 않는다 — 세팅하면 시나리오 게이트(검사 완료 조건)가 열려버린다.
   * 결과 화면이 안내문과 재검사 버튼을 그릴 수 있도록 남기는 상태이며,
   * **스트레스 검사를 새로 시작(initTest('stress'))하면** 사라진다.
   *
   * ⚠️ 세션 한정이다 — Firestore에 저장하지 않으므로 새로고침·재로그인하면
   * 사라진다. 홈 화면의 "판별이 어려웠어요" 안내(HomeTab)도 같은 한계를
   * 가지며, 그 경우 홈은 검사를 아직 안 한 것과 같은 표시로 되돌아간다.
   * 영속화하려면 users/{uid}에 필드를 추가해야 하고(어드민 계약 변경),
   * 검사 미완료 상태를 DB에 남기는 것이 옳은지부터 결정해야 한다.
   */
  invalidStressAttempt: boolean;

  // Actions
  initTest: (testType: 'adhd' | 'stress') => Promise<void>;
  selectAnswer: (questionId: number, optionIndex: number) => void;
  nextQuestion: () => void;
  prevQuestion: () => void;
  submitTest: (uid: string) => Promise<boolean>;
  fetchTestResults: (uid: string) => Promise<void>;
  deleteTestResults: (uid: string) => Promise<boolean>;
  resetAnswers: () => void;
  resetTestProgress: () => void;
}

export const useTestStore = create<TestState>((set, get) => ({
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

  initTest: async (testType) => {
    set({ isLoading: true, error: null });
    
    let rawCsv = testType === 'adhd' ? adhdCsv : stressCsv; // default local CSV
    
    if (!IS_MOCK_MODE) {
      try {
        const docRef = doc(db, COLLECTIONS.QUESTIONS, testType);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists() && docSnap.data()[CSV_TEXT_FIELD]) {
          rawCsv = docSnap.data()[CSV_TEXT_FIELD];
        }
      } catch (err) {
        console.error('Failed to fetch questions from Firestore, falling back to local', err);
      }
    }

    const parsed = parseQuestionsCsv(rawCsv);

    set((state) => ({
      activeTest: testType,
      questions: parsed,
      currentIndex: 0,
      answers: {},
      isLoading: false,
      // 판별 불가 플래그는 **스트레스 검사를 새로 시작할 때만** 지운다.
      // ADHD 검사에 들어갔다고 지우면, 스트레스 재검사 안내(홈 Step 3 카드)가
      // 무관한 검사 하나 때문에 조용히 사라진다.
      invalidStressAttempt: testType === 'stress' ? false : state.invalidStressAttempt,
    }));
  },

  // 같은 선택지를 다시 누르면 **선택 해제**한다 (2026-08-07 검수 확정).
  // 해제는 answers에서 키를 지우는 것이지 값을 -1 등으로 두는 것이 아니다 —
  // 화면의 '다음' 활성 조건과 채점(scoreAdhdTest/scoreStressTest)이 모두
  // `answers[id] === undefined`를 미응답으로 읽기 때문에, 키를 남기면 미응답이
  // 0번 선택지로 채점되어 버린다.
  selectAnswer: (questionId, optionIndex) => {
    set((state) => {
      if (state.answers[questionId] === optionIndex) {
        const next = { ...state.answers };
        delete next[questionId];
        return { answers: next };
      }
      return {
        answers: {
          ...state.answers,
          [questionId]: optionIndex,
        },
      };
    });
  },

  nextQuestion: () => {
    set((state) => {
      if (state.currentIndex < state.questions.length - 1) {
        return { currentIndex: state.currentIndex + 1 };
      }
      return state;
    });
  },

  prevQuestion: () => {
    set((state) => {
      if (state.currentIndex > 0) {
        return { currentIndex: state.currentIndex - 1 };
      }
      return state;
    });
  },

  submitTest: async (uid: string) => {
    const { activeTest, answers, questions } = get();
    if (!activeTest) return false;

    set({ isSubmitting: true, error: null });

    // 채점은 확정 스펙(utils/testScoring)에 위임한다.
    //   ADHD  : score = 환산점수(0~100), rawScore = 원점수(0~24)
    //   스트레스: score = '예' 총수(0~12), counts = 영역별 '예' 수, resultType = 8유형
    const resultData: TestResultData =
      activeTest === 'adhd'
        ? (() => {
            const { rawScore, score } = scoreAdhdTest(questions, answers);
            return {
              testType: activeTest,
              answers,
              score,
              rawScore,
              completedAt: new Date().toISOString(),
            };
          })()
        : (() => {
            const { counts, score, resultType } = scoreStressTest(questions, answers);
            return {
              testType: activeTest,
              answers,
              score,
              counts,
              resultType,
              completedAt: new Date().toISOString(),
            };
          })();

    // 판별 불가(전부 '예'/전부 '아니요')는 검사 미완료다 — 저장도 세팅도 하지
    // 않고 플래그만 남긴다. 결과 화면이 안내문 + 재검사를 안내한다.
    if (activeTest === 'stress' && resultData.resultType === 'undetermined') {
      set({ isSubmitting: false, invalidStressAttempt: true });
      return true;
    }

    if (IS_MOCK_MODE) {
      await new Promise((resolve) => setTimeout(resolve, 600));
      const storageKey = `react_test_${activeTest}_${uid}`;
      localStorage.setItem(storageKey, JSON.stringify(resultData));

      if (activeTest === 'adhd') {
        set({ adhdResult: resultData, isSubmitting: false });
      } else {
        set({ stressResult: resultData, isSubmitting: false, invalidStressAttempt: false });
      }
      return true;
    }

    try {
      const docRef = doc(db, COLLECTIONS.USERS, uid);
      const fieldName = activeTest === 'adhd' ? USER_FIELDS.ADHD_RESULT : USER_FIELDS.STRESS_RESULT;
      await setDoc(docRef, { [fieldName]: resultData }, { merge: true });

      if (activeTest === 'adhd') {
        set({ adhdResult: resultData, isSubmitting: false });
      } else {
        set({ stressResult: resultData, isSubmitting: false, invalidStressAttempt: false });
      }
      return true;
    } catch (err) {
      // Firebase가 던지는 message는 영어 원문("Missing or insufficient
      // permissions." 등)이라 그대로 화면에 뜨면 사용자가 읽을 수 없다.
      // 원문은 콘솔에만 남기고 화면에는 확정 문구를 고정한다.
      console.error('Error submitting test:', err);
      set({ error: COPY.errors.testSaveFailed, isSubmitting: false });
      return false;
    }
  },

  fetchTestResults: async (uid: string) => {
    set({ isLoading: true, error: null });

    if (IS_MOCK_MODE) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      const adhdLocal = localStorage.getItem(`react_test_adhd_${uid}`);
      const stressLocal = localStorage.getItem(`react_test_stress_${uid}`);

      set({
        adhdResult: adhdLocal ? JSON.parse(adhdLocal) : null,
        stressResult: stressLocal ? JSON.parse(stressLocal) : null,
        isLoading: false,
      });
      return;
    }

    try {
      const docRef = doc(db, COLLECTIONS.USERS, uid);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        set({
          adhdResult: data[USER_FIELDS.ADHD_RESULT] ? (data[USER_FIELDS.ADHD_RESULT] as TestResultData) : null,
          stressResult: data[USER_FIELDS.STRESS_RESULT] ? (data[USER_FIELDS.STRESS_RESULT] as TestResultData) : null,
          isLoading: false,
        });
        return;
      }
      set({ adhdResult: null, stressResult: null, isLoading: false });
    } catch (err) {
      console.error('Error fetching test results:', err);
      set({
        error: err instanceof Error ? err.message : COPY.errors.testLoadFailed,
        isLoading: false,
      });
    }
  },

  deleteTestResults: async (uid: string) => {
    set({ isLoading: true, error: null });

    if (IS_MOCK_MODE) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      localStorage.removeItem(`react_test_adhd_${uid}`);
      localStorage.removeItem(`react_test_stress_${uid}`);
      // 데이터 초기화는 "검사를 한 적 없는 상태"로 되돌리는 동작이다 —
      // 직전 판별 불가 안내도 함께 지워야 홈이 사실과 맞는다.
      set({ adhdResult: null, stressResult: null, isLoading: false, invalidStressAttempt: false });
      return true;
    }

    try {
      const docRef = doc(db, COLLECTIONS.USERS, uid);
      await setDoc(docRef, { [USER_FIELDS.ADHD_RESULT]: null, [USER_FIELDS.STRESS_RESULT]: null }, { merge: true });
      set({ adhdResult: null, stressResult: null, isLoading: false, invalidStressAttempt: false });
      return true;
    } catch (err) {
      console.error('Error deleting test results:', err);
      set({
        error: err instanceof Error ? err.message : COPY.errors.testDeleteFailed,
        isLoading: false,
      });
      return false;
    }
  },

  // 검사를 중도 이탈했을 때 답안만 버린다 (2026-08-07 검수 확정).
  // questions/activeTest는 남겨 두므로 준비 화면에서 다시 시작해도 문항을
  // 재조회하지 않는다 — 화면 전체를 접는 resetTestProgress와 구분할 것.
  resetAnswers: () => {
    set({ currentIndex: 0, answers: {} });
  },

  // 검사 화면을 떠날 때 진행 상태를 접는다 (TestUnifiedPage 언마운트).
  //
  // invalidStressAttempt는 **일부러 남긴다**. 여기서 지우면 판별 불가로 끝난
  // 뒤 홈으로 나가는 순간 플래그가 사라져, 홈의 재검사 안내가 절대 뜨지
  // 못한다(2026-08-08 확정). 지우는 시점은 스트레스 재검사 시작(initTest)과
  // 데이터 초기화(deleteTestResults) 두 곳이다.
  resetTestProgress: () => {
    set({
      activeTest: null,
      questions: [],
      currentIndex: 0,
      answers: {},
      error: null,
    });
  },
}));
