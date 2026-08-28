// src/utils/testScoring.ts
// 검사 채점의 순수 함수 모음 — 스토어(useTestStore.submitTest)가 이 결과를
// 그대로 TestResultData에 담아 저장한다.
//
// 확정 스펙: docs/superpowers/specs/2026-08-06-test-content-spec.md
//   §1 ADHD(ASRS-V1.1 스크리너 6문항) — 리커트 0~4점, 환산점수 = (원점수/24)×100
//   §2 스트레스 12문항 이분형 — 영역별 '예' 수 → classifyStressResult로 8유형 분류
//
// 스토어에서 분리한 이유는 채점 규칙이 심리학부 확정 콘텐츠라서 UI·저장 경로와
// 무관하게 단위 테스트로 고정해 두어야 하기 때문이다. 규칙을 바꿀 일이 생기면
// 스펙 문서를 먼저 고치고 여기와 testScoring.test.ts를 함께 갱신할 것.

import {
  REACTION_TYPE_KEYS,
  classifyStressResult,
  reactionKeyFromCsvLabel,
  type ReactionTypeKey,
  type StressResultType,
} from '../constants/reactionType';
import type { QuestionItem } from './csvParser';
import { conjunctionParticle } from './koreanParticle';

/**
 * ASRS-6 원점수의 최댓값 (6문항 × 4점). 환산 공식의 분모로 쓰는 시트 확정 상수다.
 * 문항 수가 아니라 이 고정값을 분모로 쓰는 것이 확정 공식이므로, 어드민이
 * questions/adhd에 6문항이 아닌 CSV를 올리면 환산점수가 0~100을 벗어날 수 있다.
 * (어드민 A 패키지가 문항 수 검증을 담당한다.)
 */
export const ADHD_MAX_RAW_SCORE = 24;

/** 스트레스 검사에서 '예'에 해당하는 응답 인덱스 (확정 CSV의 첫 옵션). */
export const STRESS_YES_INDEX = 0;

export interface AdhdScore {
  /** 응답 배점(선택지 인덱스 0~4)의 합. 0~24 */
  rawScore: number;
  /** 환산점수 (rawScore/24)×100 반올림. 0~100 */
  score: number;
  /** 평균 응답 배점 = rawScore / 문항 수. 설명문 빈도 구간 산출용 */
  average: number;
}

/**
 * ADHD 검사를 채점한다.
 * 미응답 문항은 0점('전혀없음')으로 처리한다 — 현 UI는 전 문항 응답을 강제하므로
 * 방어적 처리이며, 이 규칙이 바뀌면 미응답 검사 자체를 막는 쪽이 옳다.
 */
export function scoreAdhdTest(
  questions: QuestionItem[],
  answers: Record<number, number>,
): AdhdScore {
  const rawScore = questions.reduce((sum, q) => sum + (answers[q.id] ?? 0), 0);
  const score = Math.round((rawScore / ADHD_MAX_RAW_SCORE) * 100);
  const average = questions.length > 0 ? rawScore / questions.length : 0;
  return { rawScore, score, average };
}

export interface StressScore {
  /** 영역별 '예' 응답 수 (각 0~4) */
  counts: Record<ReactionTypeKey, number>;
  /** '예' 총수 = counts 합. 0~12 */
  score: number;
  /** 확정 기준에 따른 8유형 */
  resultType: StressResultType;
}

/**
 * 스트레스 검사를 채점한다.
 * part가 인지/정서/행동이 아닌 문항(레거시·오입력 CSV)은 어느 영역에도 집계되지
 * 않으며, 미응답은 '아니요'로 처리한다.
 */
export function scoreStressTest(
  questions: QuestionItem[],
  answers: Record<number, number>,
): StressScore {
  const counts: Record<ReactionTypeKey, number> = {
    cognitive: 0,
    emotional: 0,
    behavioral: 0,
  };

  questions.forEach((q) => {
    const key = reactionKeyFromCsvLabel(q.part);
    if (key && answers[q.id] === STRESS_YES_INDEX) {
      counts[key] += 1;
    }
  });

  const score = REACTION_TYPE_KEYS.reduce((sum, key) => sum + counts[key], 0);
  return { counts, score, resultType: classifyStressResult(counts) };
}

/**
 * 영역별 비율(%) — 그래프용. 확정 스펙 §2의 "(영역점수 / 세 영역 합) × 100".
 * 합이 0이면(전부 '아니요' = 판별 불가) 모두 0으로 돌려준다.
 */
export function getStressRatios(
  counts: Record<ReactionTypeKey, number>,
): Record<ReactionTypeKey, number> {
  const total = REACTION_TYPE_KEYS.reduce((sum, key) => sum + counts[key], 0);
  const ratio = (value: number) => (total === 0 ? 0 : Math.round((value / total) * 100));
  return {
    cognitive: ratio(counts.cognitive),
    emotional: ratio(counts.emotional),
    behavioral: ratio(counts.behavioral),
  };
}

/**
 * ADHD 개인 설명문의 빈도 구간 표현을 만든다 (확정 스펙 §1 템플릿).
 *
 *   평균이 정수      → "'자주(일주일에 몇 번)'의 빈도"
 *   평균이 정수가 아님 → "'때때로(한 달에 몇번)'과 '자주(일주일에 몇 번)' 사이의 빈도"
 *
 * 스펙 예문은 '과'로 적혀 있지만 라벨에 따라 '와'가 맞는 경우가 있어
 * (예: "거의 없음(한 달에 한 번 이하)와") 조사를 받침으로 판정한다.
 *
 * 선택지 라벨은 문항 CSV에서 그대로 가져온다 — 폼 확정 라벨이므로 코드에서
 * 다시 쓰지 않는다. 라벨을 얻을 수 없으면(빈 CSV 등) 빈 문자열을 돌려주고,
 * 호출부가 설명문 전체를 생략한다.
 */
export function describeAdhdFrequency(average: number, optionLabels: string[]): string {
  if (optionLabels.length === 0) return '';

  const maxIndex = optionLabels.length - 1;
  const clamped = Math.min(Math.max(average, 0), maxIndex);
  const lower = Math.floor(clamped);
  const upper = Math.ceil(clamped);

  if (lower === upper) {
    return `'${optionLabels[lower]}'의 빈도`;
  }
  // 조사를 '과'로 고정하면 "…한 번 이하)'과"처럼 틀린 문장이 나온다.
  // 선택지 라벨은 괄호로 끝나므로 그 앞 음절의 받침으로 판정한다.
  const lowerLabel = optionLabels[lower];
  return `'${lowerLabel}'${conjunctionParticle(lowerLabel)} '${optionLabels[upper]}' 사이의 빈도`;
}
