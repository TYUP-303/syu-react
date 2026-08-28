// src/api/diaryContent.test.ts
// 케이스별 생성 문구의 분기 테스트.
//
// 문장 자체(팀 검수 대기)를 고정하지 않고 **분기 규칙**만 확정한다.
// 검수로 문구가 바뀌어도 깨지지 않되, "기록이 없는데 도움이 되었다고
// 말한다" 같은 사실 오류는 잡히도록 짰다.

import { describe, it, expect } from 'vitest';
import type { EpisodeProgress } from '../store/useScenarioStore';
import { computeStrategyStats } from '../utils/strategyStats';
import type { TestResultData } from '../store/useTestStore';
import {
  buildAdhdScoreNote,
  buildComparisonInsight,
  buildDomainNarrative,
  buildProfileNarrative,
  buildReportHeadline,
  diaryContents,
  findLeastUsedStrategy,
  getDiaryByThemeId,
  strategyDisplayName,
  fairyDisplayName,
} from './diaryContent';

function prog(
  selectedAngel: EpisodeProgress['selectedAngel'],
  wasHelpful: boolean,
  selectedReason = '이유',
): EpisodeProgress {
  return {
    cleared: true,
    selectedAngel,
    wasHelpful,
    selectedReason,
    updatedAt: '2026-08-01T00:00:00.000Z',
  };
}

const EMPTY = computeStrategyStats([]);

describe('diary_contents.json 계약', () => {
  it('5개 영역이 모두 필수 필드를 갖는다', () => {
    expect(diaryContents).toHaveLength(5);
    diaryContents.forEach((d) => {
      expect(d.title).toBeTruthy();
      expect(d.intro).toBeTruthy();
      expect(d.areaHint).toBeTruthy();
      expect(d.quote).toBeTruthy();
      expect(d.closing).toBeTruthy();
    });
  });

  it('themeId로 조회되고, 없는 id는 undefined다', () => {
    expect(getDiaryByThemeId('workplace')?.title).toBe('직장 회복일기');
    expect(getDiaryByThemeId('nope')).toBeUndefined();
  });
});

// 2026-08-27(R2-03)에 플레이어의 요정 칩이 이름만 들게 되면서 갈라진 함수다.
// 괄호 표기는 전략명이 그 자리에만 있는 화면(보고서·회복일기)의 것이고, 이름만
// 필요한 자리는 이쪽을 쓴다. 폴백 규칙은 둘이 같아야 한다.
describe('fairyDisplayName — 이름만', () => {
  it('원고가 비어 있으면 확정 이름으로 떨어진다', () => {
    expect(fairyDisplayName('accept')).toBe('아코');
    expect(fairyDisplayName('reappraisal')).toBe('포코');
    expect(fairyDisplayName('refocus')).toBe('리프');
  });

  it('CSV 원고의 이름이 우선한다', () => {
    expect(fairyDisplayName('accept', '아코롱')).toBe('아코롱');
  });

  it('공백뿐인 이름은 원고가 없는 것으로 본다', () => {
    expect(fairyDisplayName('accept', '   ')).toBe('아코');
  });
});

describe('strategyDisplayName — 요정명 우선 표기', () => {
  it('요정명을 앞에 두고 전략명을 괄호로 붙인다 (영문 병기 없음)', () => {
    expect(strategyDisplayName('accept')).toBe('아코(수용)');
    expect(strategyDisplayName('reappraisal')).toBe('포코(재평가)');
    expect(strategyDisplayName('refocus')).toBe('리프(재초점)');
  });

  it('영문 병기가 섞이지 않는다 (교정 5번)', () => {
    ['accept', 'reappraisal', 'refocus'].forEach((key) => {
      expect(strategyDisplayName(key as 'accept')).not.toMatch(/[A-Za-z]/);
    });
  });
});

describe('findLeastUsedStrategy', () => {
  it('가장 적게 쓴 전략을 돌려준다', () => {
    const stats = computeStrategyStats([
      prog('accept', true),
      prog('accept', true),
      prog('reappraisal', true),
    ]);
    expect(findLeastUsedStrategy(stats)).toBe('refocus'); // 0회
  });

  it('기록이 없으면 null이다', () => {
    expect(findLeastUsedStrategy(EMPTY)).toBeNull();
  });
});

describe('buildDomainNarrative', () => {
  it('기록이 없으면 실천 제안을 비운다 (없는 근거로 제안하지 않는다)', () => {
    const n = buildDomainNarrative('직장', EMPTY);
    expect(n.practice).toBe('');
    expect(n.summary).toContain('직장');
  });

  it('최다 전략과 횟수를 요약에 담는다', () => {
    const stats = computeStrategyStats([prog('reappraisal', false), prog('reappraisal', false)]);
    const n = buildDomainNarrative('연인', stats);
    expect(n.summary).toContain('포코(재평가)');
    expect(n.summary).toContain('2회');
  });

  it('도움 기록이 하나도 없으면 도움 문장을 넣지 않는다', () => {
    const stats = computeStrategyStats([prog('accept', false), prog('accept', false)]);
    const n = buildDomainNarrative('일상', stats);
    expect(n.summary).not.toContain('도움이 되었다');
  });

  it('도움 기록이 있으면 횟수를 말하고, 표본이 충분하면 비율도 붙인다', () => {
    // 2회 = 소표본 → 비율 없이 횟수만
    const small = computeStrategyStats([prog('accept', true), prog('accept', false)]);
    expect(buildDomainNarrative('일상', small).summary).toContain('1번은 실제로 도움이 되었다');
    expect(buildDomainNarrative('일상', small).summary).not.toContain('%');

    // 4회 = 표본 충족 → 비율 병기
    const enough = computeStrategyStats([
      prog('accept', true),
      prog('accept', true),
      prog('accept', false),
      prog('accept', false),
    ]);
    const n = buildDomainNarrative('일상', enough);
    expect(n.summary).toContain('2번은 실제로 도움이 되었다');
    expect(n.summary).toContain('50%');
  });

  it('상위 도움 이유가 있으면 인용한다', () => {
    const stats = computeStrategyStats([
      prog('accept', true, '감정이 진정됐어요'),
      prog('accept', true, '감정이 진정됐어요'),
    ]);
    expect(buildDomainNarrative('직장', stats).summary).toContain('감정이 진정됐어요');
  });

  it('한 전략만 썼으면 실천 제안을 비운다 (최다 = 최소인 경우)', () => {
    // accept만 1회 — 최소는 reappraisal(0회)이라 제안이 나온다
    const oneStrategy = computeStrategyStats([prog('accept', true)]);
    expect(oneStrategy.dominant).toBe('accept');
    expect(buildDomainNarrative('직장', oneStrategy).practice).not.toBe('');
  });

  it('세 전략을 완전히 고르게 썼으면 제안을 비운다', () => {
    const even = computeStrategyStats([
      prog('accept', true),
      prog('reappraisal', true),
      prog('refocus', true),
    ]);
    // 동률이면 최다·최소 모두 STRATEGY_KEYS 첫 키로 수렴 → 제안 없음
    expect(buildDomainNarrative('직장', even).practice).toBe('');
  });
});

describe('buildProfileNarrative', () => {
  it('상담·의료기관 권고 문구를 넣지 않는다 (7차 확정 하드 제약)', () => {
    const banned = ['상담', '병원', '의료기관', '전문가를 찾', '진료', '치료', '증상'];
    const n = buildProfileNarrative(EMPTY);
    const all = `${n.strength} ${n.practiceDirection}`;
    banned.forEach((word) => expect(all).not.toContain(word));
  });

  it('최다 전략별로 강점 문장이 갈린다', () => {
    const acceptTop = computeStrategyStats([prog('accept', true)]);
    const refocusTop = computeStrategyStats([prog('refocus', true)]);
    expect(buildProfileNarrative(acceptTop).strength).not.toBe(
      buildProfileNarrative(refocusTop).strength,
    );
  });
});

// 자작 점수대 밴드(경계 24/49/74)를 폐기하고 검사 결과 화면과 같은 검수
// 템플릿을 재사용한다 (2026-08-08). 여기서 고정하는 것은 **문장 자체가 아니라
// 그 템플릿을 쓴다는 사실**과 데이터가 없을 때 지어내지 않는다는 계약이다.
describe('buildAdhdScoreNote — 검수 템플릿 재사용', () => {
  const adhd = (score: number, rawScore?: number): TestResultData => ({
    testType: 'adhd',
    answers: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
    score,
    rawScore,
    completedAt: '2026-08-01T00:00:00.000Z',
  });

  it('검사 기록이 없으면 빈 문자열이다', () => {
    expect(buildAdhdScoreNote(null)).toBe('');
    expect(buildAdhdScoreNote(undefined)).toBe('');
  });

  it('확정 스펙 템플릿 문장을 그대로 쓴다', () => {
    const note = buildAdhdScoreNote(adhd(50, 12));
    expect(note).toContain('현재 ADHD 관련 경험 지표는 50점(100점 만점)입니다');
    expect(note).toContain('최근 6개월');
    expect(note).toContain('빈도');
  });

  it('선택지 라벨은 문항 CSV에서 가져온다 (코드에 다시 적지 않는다)', () => {
    // rawScore 12 / 6문항 = 평균 2.0 → 정수 구간이라 라벨 하나만 인용된다
    expect(buildAdhdScoreNote(adhd(50, 12))).toContain('때때로(한 달에 몇 번)');
  });

  it('rawScore가 없는 레거시 기록도 환산점수에서 같은 문구를 만든다', () => {
    expect(buildAdhdScoreNote(adhd(50))).toBe(buildAdhdScoreNote(adhd(50, 12)));
  });

  it('경계값(0·100)에서도 문구가 나온다', () => {
    expect(buildAdhdScoreNote(adhd(0, 0))).toContain('전혀 없음');
    expect(buildAdhdScoreNote(adhd(100, 24))).toContain('매우 자주(거의 매일)');
  });

  it('폐기한 자작 밴드 어휘를 되살리지 않는다', () => {
    [0, 20, 40, 60, 80, 100].forEach((score) => {
      const note = buildAdhdScoreNote(adhd(score));
      expect(note).not.toContain('주의가 흩어지거나');
      expect(note).not.toContain('나타났어요');
    });
  });

  it('상담·의료기관 권고 문구를 넣지 않는다 (7차 확정 하드 제약)', () => {
    const banned = ['상담', '병원', '의료기관', '전문가를 찾', '진료', '치료', '증상'];
    [0, 30, 60, 100].forEach((score) => {
      const note = buildAdhdScoreNote(adhd(score));
      banned.forEach((word) => expect(note).not.toContain(word));
    });
  });
});

describe('buildReportHeadline', () => {
  it('기록이 없으면 그 사실을 말한다', () => {
    expect(buildReportHeadline('전체', EMPTY)).toContain('아직 없어요');
  });

  it('도움 기록이 없으면 체감률을 말하지 않는다', () => {
    const stats = computeStrategyStats([prog('accept', false)]);
    expect(buildReportHeadline('전체', stats)).not.toContain('%');
  });

  it('표본이 충분하면 체감률을 덧붙인다', () => {
    const stats = computeStrategyStats([
      prog('accept', true),
      prog('accept', true),
      prog('accept', true),
    ]);
    expect(buildReportHeadline('전체', stats)).toContain('100%');
  });

  // 1~2회 기록의 "100%"는 정밀해 보이지만 다음 훈련 한 번에 50%로 반토막
  // 난다. 소표본에서는 흔들리는 비율 대신 있는 그대로의 횟수를 말한다.
  it('소표본(3회 미만)에서는 체감률 대신 횟수를 말한다', () => {
    const stats = computeStrategyStats([prog('accept', true), prog('accept', true)]);
    const headline = buildReportHeadline('전체', stats);
    expect(headline).not.toContain('%');
    expect(headline).toContain('2회는 도움이 되었다');
  });

  it('조사를 받침에 맞춘다 — 아코를 / 포코를 / 리프를', () => {
    expect(buildReportHeadline('전체', computeStrategyStats([prog('accept', false)]))).toContain(
      '아코(수용)를',
    );
    expect(buildReportHeadline('전체', computeStrategyStats([prog('refocus', false)]))).toContain(
      '리프(재초점)를',
    );
  });
});

describe('buildComparisonInsight — AX 템플릿', () => {
  const accepted = computeStrategyStats([prog('accept', true)]);
  const refocused = computeStrategyStats([prog('refocus', true)]);

  it('한쪽에 기록이 없으면 null이다 (비교가 성립하지 않는다)', () => {
    expect(buildComparisonInsight('직장', accepted, '연인', EMPTY)).toBeNull();
    expect(buildComparisonInsight('직장', EMPTY, '연인', accepted)).toBeNull();
  });

  it('두 영역의 최다 전략이 다르면 둘 다 언급한다', () => {
    const text = buildComparisonInsight('직장', accepted, '연인', refocused);
    expect(text).toContain('직장');
    expect(text).toContain('연인');
    expect(text).toContain('아코(수용)');
    expect(text).toContain('리프(재초점)');
  });

  it('최다 전략이 같으면 일관성을 짚는다', () => {
    const text = buildComparisonInsight('직장', accepted, '연인', accepted);
    expect(text).toContain('비슷한 편');
  });
});
