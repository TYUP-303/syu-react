// src/utils/testScoring.test.ts
// 확정 채점 스펙을 고정하는 단위 테스트.
//
// csvParser.test.ts와 성격이 다르다: 여기는 "현재 동작"이 아니라 대학원팀
// 확정본(docs/superpowers/specs/2026-08-06-test-content-spec.md)을 검증한다.
// 깨지면 리팩터링 사고이거나 스펙이 바뀐 것이며, 후자라면 스펙 문서를 먼저
// 고쳤어야 한다.
//
// 확정 문항 CSV 자체도 여기서 함께 고정한다 — 문항 수·part 매핑·선택지는
// 채점 결과를 좌우하는 입력이라 파서 통과 여부만으로는 부족하다.

import { describe, expect, it } from 'vitest';
import {
  ADHD_MAX_RAW_SCORE,
  describeAdhdFrequency,
  getStressRatios,
  scoreAdhdTest,
  scoreStressTest,
} from './testScoring';
import { parseQuestionsCsv, type QuestionItem } from './csvParser';
import { REACTION_TYPE_KEYS, reactionKeyFromCsvLabel } from '../constants/reactionType';

import adhdCsv from '../assets/data/adhd_questions.csv?raw';
import stressCsv from '../assets/data/stress_questions.csv?raw';

const adhdQuestions = parseQuestionsCsv(adhdCsv);
const stressQuestions = parseQuestionsCsv(stressCsv);

/** 모든 ADHD 문항에 같은 배점을 답한 answers를 만든다. */
const answerAll = (questions: QuestionItem[], optionIndex: number): Record<number, number> =>
  Object.fromEntries(questions.map((q) => [q.id, optionIndex]));

/** part 라벨별로 '예'(0)/'아니요'(1)를 지정해 스트레스 answers를 만든다. */
const answerStress = (yesCountByPart: Record<string, number>): Record<number, number> => {
  const remaining = { ...yesCountByPart };
  return Object.fromEntries(
    stressQuestions.map((q) => {
      const left = remaining[q.part] ?? 0;
      if (left > 0) {
        remaining[q.part] = left - 1;
        return [q.id, 0]; // 예
      }
      return [q.id, 1]; // 아니요
    }),
  );
};

describe('확정 문항 CSV', () => {
  it('ADHD는 6문항이고 모두 part=A · scale · 5지선다다', () => {
    expect(adhdQuestions).toHaveLength(6);
    expect(adhdQuestions.map((q) => q.id)).toEqual([1, 2, 3, 4, 5, 6]);
    adhdQuestions.forEach((q) => {
      expect(q.part).toBe('A');
      expect(q.type).toBe('scale');
      expect(q.options).toHaveLength(5);
    });
  });

  it('ADHD 선택지는 폼 확정 라벨이다', () => {
    expect(adhdQuestions[0].options).toEqual([
      '전혀 없음',
      '거의 없음(한 달에 한 번 이하)',
      '때때로(한 달에 몇 번)',
      '자주(일주일에 몇 번)',
      '매우 자주(거의 매일)',
    ]);
  });

  it('ADHD 문항 배점 상한(문항 수 × 4)이 환산 분모 24와 일치한다', () => {
    expect(adhdQuestions.length * 4).toBe(ADHD_MAX_RAW_SCORE);
  });

  it('스트레스는 12문항이고 모두 yes-no · "예,아니요"다', () => {
    expect(stressQuestions).toHaveLength(12);
    expect(stressQuestions.map((q) => q.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    stressQuestions.forEach((q) => {
      expect(q.type).toBe('yes-no');
      expect(q.options).toEqual(['예', '아니요']);
    });
  });

  it('스트레스 part는 인지/정서/행동 각 4문항이며 전부 도메인 키로 매핑된다', () => {
    const perKey = { cognitive: 0, emotional: 0, behavioral: 0 };
    stressQuestions.forEach((q) => {
      const key = reactionKeyFromCsvLabel(q.part);
      expect(key).not.toBeNull();
      if (key) perKey[key] += 1;
    });
    expect(perKey).toEqual({ cognitive: 4, emotional: 4, behavioral: 4 });
  });

  it('스트레스 part는 문항 1~4/5~8/9~12 순서로 배치된다', () => {
    expect(stressQuestions.map((q) => q.part)).toEqual([
      '인지', '인지', '인지', '인지',
      '정서', '정서', '정서', '정서',
      '행동', '행동', '행동', '행동',
    ]);
  });
});

describe('scoreAdhdTest', () => {
  it('전부 0점이면 원점수 0 · 환산 0', () => {
    const { rawScore, score } = scoreAdhdTest(adhdQuestions, answerAll(adhdQuestions, 0));
    expect(rawScore).toBe(0);
    expect(score).toBe(0);
  });

  it('전부 만점(4)이면 원점수 24 · 환산 100', () => {
    const { rawScore, score } = scoreAdhdTest(adhdQuestions, answerAll(adhdQuestions, 4));
    expect(rawScore).toBe(24);
    expect(score).toBe(100);
  });

  it('원점수 15는 환산 63으로 반올림된다 (62.5 → 63)', () => {
    const answers = { 1: 4, 2: 4, 3: 4, 4: 3, 5: 0, 6: 0 };
    const { rawScore, score } = scoreAdhdTest(adhdQuestions, answers);
    expect(rawScore).toBe(15);
    expect(score).toBe(63);
  });

  it('미응답 문항은 0점으로 처리한다', () => {
    const { rawScore, score, average } = scoreAdhdTest(adhdQuestions, { 1: 4, 2: 2 });
    expect(rawScore).toBe(6);
    expect(score).toBe(25);
    expect(average).toBe(1);
  });

  it('평균은 원점수를 문항 수로 나눈 값이다', () => {
    const { average } = scoreAdhdTest(adhdQuestions, answerAll(adhdQuestions, 3));
    expect(average).toBe(3);
  });

  it('문항이 없으면 0으로 떨어진다 (0 나누기 방어)', () => {
    expect(scoreAdhdTest([], {})).toEqual({ rawScore: 0, score: 0, average: 0 });
  });
});

describe('scoreStressTest — 집계와 8유형 분류', () => {
  it('단일 우세형: 인지 4 · 정서 1 · 행동 0 → cognitive', () => {
    const { counts, score, resultType } = scoreStressTest(
      stressQuestions,
      answerStress({ 인지: 4, 정서: 1, 행동: 0 }),
    );
    expect(counts).toEqual({ cognitive: 4, emotional: 1, behavioral: 0 });
    expect(score).toBe(5);
    expect(resultType).toBe('cognitive');
  });

  it('단일 우세형: 정서만 최고 → emotional', () => {
    const { resultType } = scoreStressTest(
      stressQuestions,
      answerStress({ 인지: 1, 정서: 3, 행동: 2 }),
    );
    expect(resultType).toBe('emotional');
  });

  it('단일 우세형: 행동만 최고 → behavioral', () => {
    const { resultType } = scoreStressTest(
      stressQuestions,
      answerStress({ 인지: 0, 정서: 1, 행동: 3 }),
    );
    expect(resultType).toBe('behavioral');
  });

  it('혼합형: 인지·정서 동률 최고 → cognitive-emotional', () => {
    const { counts, resultType } = scoreStressTest(
      stressQuestions,
      answerStress({ 인지: 3, 정서: 3, 행동: 1 }),
    );
    expect(counts).toEqual({ cognitive: 3, emotional: 3, behavioral: 1 });
    expect(resultType).toBe('cognitive-emotional');
  });

  it('혼합형: 인지·행동 동률 최고 → cognitive-behavioral', () => {
    const { resultType } = scoreStressTest(
      stressQuestions,
      answerStress({ 인지: 4, 정서: 2, 행동: 4 }),
    );
    expect(resultType).toBe('cognitive-behavioral');
  });

  it('혼합형: 정서·행동 동률 최고 → emotional-behavioral', () => {
    const { resultType } = scoreStressTest(
      stressQuestions,
      answerStress({ 인지: 1, 정서: 2, 행동: 2 }),
    );
    expect(resultType).toBe('emotional-behavioral');
  });

  it('균형형: 세 영역 동률(2/2/2) → balanced', () => {
    const { score, resultType } = scoreStressTest(
      stressQuestions,
      answerStress({ 인지: 2, 정서: 2, 행동: 2 }),
    );
    expect(score).toBe(6);
    expect(resultType).toBe('balanced');
  });

  it('전부 "예"(4/4/4)는 균형형이 아니라 undetermined다', () => {
    const { counts, score, resultType } = scoreStressTest(
      stressQuestions,
      answerAll(stressQuestions, 0),
    );
    expect(counts).toEqual({ cognitive: 4, emotional: 4, behavioral: 4 });
    expect(score).toBe(12);
    expect(resultType).toBe('undetermined');
  });

  it('전부 "아니요"(0/0/0)도 undetermined다', () => {
    const { score, resultType } = scoreStressTest(stressQuestions, answerAll(stressQuestions, 1));
    expect(score).toBe(0);
    expect(resultType).toBe('undetermined');
  });

  it('미응답은 "아니요"로 처리한다 (전부 미응답 → undetermined)', () => {
    const { counts, resultType } = scoreStressTest(stressQuestions, {});
    expect(counts).toEqual({ cognitive: 0, emotional: 0, behavioral: 0 });
    expect(resultType).toBe('undetermined');
  });

  it('part가 인지/정서/행동이 아니면 어느 영역에도 집계되지 않는다', () => {
    const legacy: QuestionItem[] = [
      { id: 1, part: '수용', question: 'q', type: 'yes-no', options: ['예', '아니요'] },
      { id: 2, part: '인지', question: 'q', type: 'yes-no', options: ['예', '아니요'] },
    ];
    const { counts, score } = scoreStressTest(legacy, { 1: 0, 2: 0 });
    expect(counts).toEqual({ cognitive: 1, emotional: 0, behavioral: 0 });
    expect(score).toBe(1);
  });
});

describe('getStressRatios', () => {
  it('세 영역 합을 분모로 백분율을 낸다', () => {
    expect(getStressRatios({ cognitive: 2, emotional: 1, behavioral: 1 })).toEqual({
      cognitive: 50,
      emotional: 25,
      behavioral: 25,
    });
  });

  it('합이 0이면 전부 0이다 (0 나누기 방어)', () => {
    expect(getStressRatios({ cognitive: 0, emotional: 0, behavioral: 0 })).toEqual({
      cognitive: 0,
      emotional: 0,
      behavioral: 0,
    });
  });

  it('반올림 결과의 합이 100이 아닐 수 있다 (1/1/1 → 33+33+33)', () => {
    const ratios = getStressRatios({ cognitive: 1, emotional: 1, behavioral: 1 });
    const sum = REACTION_TYPE_KEYS.reduce((acc, key) => acc + ratios[key], 0);
    expect(sum).toBe(99);
  });
});

describe('describeAdhdFrequency', () => {
  const labels = adhdQuestions[0].options;

  it('평균이 정수면 라벨 하나로 표기한다', () => {
    expect(describeAdhdFrequency(3, labels)).toBe("'자주(일주일에 몇 번)'의 빈도");
  });

  it('평균이 0이면 첫 라벨 하나로 표기한다', () => {
    expect(describeAdhdFrequency(0, labels)).toBe("'전혀 없음'의 빈도");
  });

  it('평균이 최댓값이면 마지막 라벨 하나로 표기한다', () => {
    expect(describeAdhdFrequency(4, labels)).toBe("'매우 자주(거의 매일)'의 빈도");
  });

  it('평균이 정수가 아니면 인접 두 라벨 사이로 표기한다', () => {
    expect(describeAdhdFrequency(2.5, labels)).toBe(
      "'때때로(한 달에 몇 번)'과 '자주(일주일에 몇 번)' 사이의 빈도",
    );
  });

  it('범위를 벗어난 평균은 라벨 범위로 잘라낸다', () => {
    expect(describeAdhdFrequency(9, labels)).toBe("'매우 자주(거의 매일)'의 빈도");
    expect(describeAdhdFrequency(-1, labels)).toBe("'전혀 없음'의 빈도");
  });

  it('선택지 라벨이 없으면 빈 문자열을 돌려준다 (호출부가 설명문을 생략)', () => {
    expect(describeAdhdFrequency(2.5, [])).toBe('');
  });
});
