// src/utils/strategyStats.test.ts
// 축 B 집계 유틸의 단위 테스트.
//
// 이 테스트는 특성화 테스트가 아니라 **사양 테스트**다 — 회복일기·보고서가
// 보여주는 숫자의 정의(비중 %, 도움 체감률, 요인 Top3의 동점 규칙)를
// 여기서 확정한다. 깨지면 화면의 숫자가 달라진 것이므로 의도한 변경인지
// 먼저 확인할 것.

import { describe, it, expect } from 'vitest';
import type { EpisodeData, ThemeCategory } from '../api/scenarioMockData';
import type { EpisodeProgress, ScenarioProgressMap } from '../store/useScenarioStore';
import {
  MIN_SAMPLE_FOR_PERCENT,
  canShowPercent,
  collectClearedProgress,
  computeAlbumProgress,
  computeOverallStats,
  computeStrategyStats,
  computeThemeStats,
  findLatestPlayedThemeId,
  summarizeThemeProgress,
  topReasons,
} from './strategyStats';

// ── 픽스처 ──

/** EpisodeProgress 한 건. 스키마 필드를 전부 채운다(불변 계약). */
function prog(
  selectedAngel: EpisodeProgress['selectedAngel'],
  wasHelpful: boolean,
  selectedReason = '이유',
  updatedAt = '2026-08-01T00:00:00.000Z',
): EpisodeProgress {
  return { cleared: true, selectedAngel, wasHelpful, selectedReason, updatedAt };
}

/** 에피소드 n개짜리 테마. */
function makeTheme(id: string, episodeCount: number, title = id): ThemeCategory {
  const episodes = Array.from({ length: episodeCount }, (_, i) => ({
    id: `${id}-ep${i + 1}`,
    episodeNumber: i + 1,
  })) as EpisodeData[];
  return { id, title, description: `${title} 설명`, icon: 'work', episodes };
}

describe('computeStrategyStats — 카운트와 비중', () => {
  it('전략별 선택 수와 전체 대비 비중(%)을 낸다', () => {
    const stats = computeStrategyStats([
      prog('accept', true),
      prog('accept', true),
      prog('reappraisal', false),
      prog('refocus', true),
    ]);

    expect(stats.totalCleared).toBe(4);
    expect(stats.byStrategy.accept.count).toBe(2);
    expect(stats.byStrategy.accept.ratio).toBe(50);
    expect(stats.byStrategy.reappraisal.count).toBe(1);
    expect(stats.byStrategy.reappraisal.ratio).toBe(25);
    expect(stats.byStrategy.refocus.ratio).toBe(25);
  });

  it('완주 기록이 없으면 dominant는 null이다 (0회를 최빈으로 부르지 않는다)', () => {
    const stats = computeStrategyStats([]);
    expect(stats.totalCleared).toBe(0);
    expect(stats.dominant).toBeNull();
    expect(stats.helpfulRate).toBeNull();
    expect(stats.byStrategy.accept.ratio).toBe(0);
    expect(stats.helpfulReasonsTop3).toEqual([]);
    expect(stats.unhelpfulReasonsTop3).toEqual([]);
  });

  it('최빈 전략이 동점이면 STRATEGY_KEYS 순서상 앞선 키가 이긴다', () => {
    // accept 2 · reappraisal 2 → 선언 순서상 accept
    const stats = computeStrategyStats([
      prog('reappraisal', true),
      prog('reappraisal', true),
      prog('accept', true),
      prog('accept', true),
    ]);
    expect(stats.dominant).toBe('accept');
  });

  it('스키마 밖 전략 키가 섞여 있어도 크래시 없이 건너뛴다 (레거시 방어)', () => {
    const legacy = { ...prog('accept', true), selectedAngel: 'unknown' } as unknown as EpisodeProgress;
    const stats = computeStrategyStats([prog('accept', true), legacy]);
    expect(stats.totalCleared).toBe(1);
    expect(stats.byStrategy.accept.count).toBe(1);
  });
});

describe('computeStrategyStats — 도움 체감률', () => {
  it('전략별 체감률은 그 전략의 선택 수 대비 비율이다', () => {
    const stats = computeStrategyStats([
      prog('reappraisal', true),
      prog('reappraisal', true),
      prog('reappraisal', true),
      prog('reappraisal', false),
    ]);
    // 4회 중 3회 → 75%
    expect(stats.byStrategy.reappraisal.helpfulCount).toBe(3);
    expect(stats.byStrategy.reappraisal.helpfulRate).toBe(75);
  });

  it('한 번도 쓰지 않은 전략의 체감률은 0%가 아니라 null이다', () => {
    const stats = computeStrategyStats([prog('accept', true)]);
    expect(stats.byStrategy.refocus.count).toBe(0);
    // "1회 중 0회 도움됨(0%)"과 "쓴 적 없음"은 화면에서 다르게 읽혀야 한다
    expect(stats.byStrategy.refocus.helpfulRate).toBeNull();
  });

  it('썼지만 한 번도 도움이 안 됐으면 0%다 (null과 구분)', () => {
    const stats = computeStrategyStats([prog('refocus', false)]);
    expect(stats.byStrategy.refocus.helpfulRate).toBe(0);
  });

  it('전체 체감률은 완주 수 대비 도움 응답 수다', () => {
    const stats = computeStrategyStats([
      prog('accept', true),
      prog('reappraisal', false),
      prog('refocus', true),
    ]);
    expect(stats.helpfulCount).toBe(2);
    expect(stats.helpfulRate).toBe(67); // 2/3 = 66.67 → 반올림
  });
});

describe('topReasons — 요인 빈도 Top3', () => {
  it('빈도 내림차순으로 최대 3개를 돌려준다', () => {
    const top = topReasons(['A', 'B', 'A', 'C', 'A', 'B', 'D']);
    expect(top).toEqual([
      { reason: 'A', count: 3 },
      { reason: 'B', count: 2 },
      { reason: 'C', count: 1 },
    ]);
  });

  it('동점이면 먼저 등장한 요인이 앞선다 (결정론적)', () => {
    const top = topReasons(['늦게', '먼저', '먼저', '늦게']);
    // 둘 다 2회 — 첫 등장이 빠른 '늦게'가 앞
    expect(top.map((r) => r.reason)).toEqual(['늦게', '먼저']);
  });

  it('빈 문자열·공백만 있는 요인은 집계에서 뺀다 (레거시 기록 방어)', () => {
    const top = topReasons(['', '   ', 'A', '', 'A']);
    expect(top).toEqual([{ reason: 'A', count: 2 }]);
  });

  it('데이터가 없으면 빈 배열이다 (공란 처리)', () => {
    expect(topReasons([])).toEqual([]);
    expect(topReasons(['', ''])).toEqual([]);
  });

  it('도움된 이유와 어려웠던 이유를 wasHelpful로 갈라 담는다', () => {
    const stats = computeStrategyStats([
      prog('accept', true, '감정이 진정됐어요'),
      prog('accept', true, '감정이 진정됐어요'),
      prog('refocus', false, '막막했어요'),
    ]);
    expect(stats.helpfulReasonsTop3).toEqual([{ reason: '감정이 진정됐어요', count: 2 }]);
    expect(stats.unhelpfulReasonsTop3).toEqual([{ reason: '막막했어요', count: 1 }]);
  });
});

describe('collectClearedProgress / computeThemeStats', () => {
  const theme = makeTheme('workplace', 3);

  it('cleared가 아닌 에피소드와 기록 없는 에피소드는 제외한다', () => {
    const progress: ScenarioProgressMap = {
      'workplace-ep1': prog('accept', true),
      'workplace-ep2': { ...prog('refocus', true), cleared: false },
      // ep3은 기록 없음
    };
    expect(collectClearedProgress(theme.episodes, progress)).toHaveLength(1);
  });

  it('테마 id로 집계한다', () => {
    const progress: ScenarioProgressMap = {
      'workplace-ep1': prog('accept', true),
      'workplace-ep2': prog('accept', false),
      'other-ep1': prog('refocus', true), // 다른 테마 — 섞이면 안 된다
    };
    const stats = computeThemeStats([theme], 'workplace', progress);
    expect(stats.totalCleared).toBe(2);
    expect(stats.byStrategy.refocus.count).toBe(0);
  });

  it('없는 테마 id면 빈 집계를 돌려준다 (크래시 금지)', () => {
    const stats = computeThemeStats([theme], 'does-not-exist', {});
    expect(stats.totalCleared).toBe(0);
    expect(stats.dominant).toBeNull();
  });
});

describe('computeOverallStats — 전 영역 합산', () => {
  it('모든 테마의 완주 기록을 합쳐 집계한다', () => {
    const themes = [makeTheme('workplace', 2), makeTheme('daily', 2)];
    const progress: ScenarioProgressMap = {
      'workplace-ep1': prog('accept', true),
      'workplace-ep2': prog('accept', true),
      'daily-ep1': prog('refocus', false),
    };
    const stats = computeOverallStats(themes, progress);
    expect(stats.totalCleared).toBe(3);
    expect(stats.byStrategy.accept.count).toBe(2);
    expect(stats.dominant).toBe('accept');
  });
});

describe('summarizeThemeProgress / computeAlbumProgress', () => {
  const themes = [makeTheme('workplace', 10), makeTheme('daily', 10)];

  function clearN(themeId: string, n: number): ScenarioProgressMap {
    const map: ScenarioProgressMap = {};
    for (let i = 1; i <= n; i += 1) map[`${themeId}-ep${i}`] = prog('accept', true);
    return map;
  }

  it('영역 진행 요약은 완주 수·비율·상태 플래그를 낸다', () => {
    const s = summarizeThemeProgress(themes[0], clearN('workplace', 3));
    expect(s.cleared).toBe(3);
    expect(s.total).toBe(10);
    expect(s.percent).toBe(30);
    expect(s.isComplete).toBe(false);
    expect(s.isStarted).toBe(true);
  });

  it('시작 전 영역은 isStarted가 false다', () => {
    const s = summarizeThemeProgress(themes[0], {});
    expect(s.isStarted).toBe(false);
    expect(s.percent).toBe(0);
  });

  it('앨범 진행 분모는 영역 수다 (시안의 1/5 표기는 오기 — 교정 3번)', () => {
    const progress = { ...clearN('workplace', 10), ...clearN('daily', 4) };
    const album = computeAlbumProgress(themes, progress);
    expect(album.completedThemes).toBe(1);
    expect(album.totalThemes).toBe(2);
    expect(album.percent).toBe(50);
    expect(album.isAllComplete).toBe(false);
    expect(album.clearedEpisodes).toBe(14);
    expect(album.totalEpisodes).toBe(20);
  });

  it('전 영역 완주면 isAllComplete가 true다', () => {
    const progress = { ...clearN('workplace', 10), ...clearN('daily', 10) };
    expect(computeAlbumProgress(themes, progress).isAllComplete).toBe(true);
  });

  it('테마 목록이 비어 있어도 0으로 안전하게 돌려준다', () => {
    const album = computeAlbumProgress([], {});
    expect(album.percent).toBe(0);
    expect(album.isAllComplete).toBe(false);
  });
});

describe('findLatestPlayedThemeId', () => {
  const themes = [makeTheme('workplace', 2), makeTheme('daily', 2)];

  it('updatedAt이 가장 늦은 기록의 테마를 돌려준다', () => {
    const progress: ScenarioProgressMap = {
      'workplace-ep1': prog('accept', true, '이유', '2026-08-01T10:00:00.000Z'),
      'daily-ep1': prog('refocus', true, '이유', '2026-08-03T10:00:00.000Z'),
      'workplace-ep2': prog('accept', true, '이유', '2026-08-02T10:00:00.000Z'),
    };
    expect(findLatestPlayedThemeId(themes, progress)).toBe('daily');
  });

  it('완주 기록이 없으면 null이다', () => {
    expect(findLatestPlayedThemeId(themes, {})).toBeNull();
  });

  it('미완주(cleared=false) 기록은 후보에서 뺀다', () => {
    const progress: ScenarioProgressMap = {
      'workplace-ep1': prog('accept', true, '이유', '2026-08-01T10:00:00.000Z'),
      'daily-ep1': { ...prog('refocus', true, '이유', '2026-08-09T10:00:00.000Z'), cleared: false },
    };
    expect(findLatestPlayedThemeId(themes, progress)).toBe('workplace');
  });
});

// 소표본에서 %를 접는 표시 규칙 (2026-08-08 확정).
// 집계값(ratio·helpfulRate)은 그대로 계산해 두고, "보여줄지"만 여기서 가른다 —
// 게이지 길이처럼 수치가 필요한 자리가 있기 때문이다.
describe('canShowPercent — 소표본 표기 규칙', () => {
  it('3회 미만이면 %를 쓰지 않는다', () => {
    expect(canShowPercent(0)).toBe(false);
    expect(canShowPercent(1)).toBe(false);
    expect(canShowPercent(2)).toBe(false);
  });

  it('3회부터 %를 쓴다', () => {
    expect(canShowPercent(3)).toBe(true);
    expect(canShowPercent(10)).toBe(true);
  });

  it('문턱은 상수 하나로만 정의된다', () => {
    expect(MIN_SAMPLE_FOR_PERCENT).toBe(3);
    expect(canShowPercent(MIN_SAMPLE_FOR_PERCENT)).toBe(true);
    expect(canShowPercent(MIN_SAMPLE_FOR_PERCENT - 1)).toBe(false);
  });

  it('집계값 자체는 소표본에서도 그대로 계산된다 (표시만 접는다)', () => {
    const stats = computeStrategyStats([prog('accept', true)]);
    expect(stats.byStrategy.accept.helpfulRate).toBe(100);
    expect(stats.byStrategy.accept.ratio).toBe(100);
    expect(canShowPercent(stats.totalCleared)).toBe(false);
  });
});
