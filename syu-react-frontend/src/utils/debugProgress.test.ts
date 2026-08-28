// src/utils/debugProgress.test.ts
// 디버그 해금 합성기의 단위 테스트 — **사양 테스트**다.
//
// 여기서 고정하는 것은 "부분 해제 화면에 무엇이 보여야 하는가"다:
// 영역 순서대로 0 / 20 / 60 / 100 %가 나오고, 그 한 벌의 데이터를
// strategyStats가 집계했을 때 게이지·카드·상세 통계가 서로 맞아야 한다.

import { describe, it, expect } from 'vitest';
import type { EpisodeData, ThemeCategory } from '../api/scenarioMockData';
import {
  buildDebugProgress,
  debugClearedCount,
  debugThemePercent,
  nextDebugUnlockMode,
  resolveDisplayProgress,
  DEBUG_UNLOCK_MODES,
  PARTIAL_UNLOCK_PERCENTS,
} from './debugProgress';
import { computeAlbumProgress, computeOverallStats, summarizeThemeProgress } from './strategyStats';

// ── 픽스처 ──

function makeTheme(id: string, episodeCount = 10): ThemeCategory {
  const episodes = Array.from({ length: episodeCount }, (_, i) => ({
    id: `${id}-ep${i + 1}`,
    episodeNumber: i + 1,
    reasons: {
      helpful: ['감정을 편안하게 해줌', '새로운 관점을 제시함', '실질적인 도움이 됨'],
      unhelpful: ['상황에 맞지 않음', '공감되지 않음', '너무 이상적임'],
    },
  })) as EpisodeData[];
  return { id, title: id, description: `${id} 설명`, icon: 'work', episodes };
}

/** 실제 배치와 같은 4영역 × 10회차. */
const THEMES: ThemeCategory[] = [
  makeTheme('workplace'),
  makeTheme('job-prep'),
  makeTheme('relationship'),
  makeTheme('daily'),
];

describe('nextDebugUnlockMode — 3단 순환', () => {
  it('락 → 부분 → 전체 → 락 순으로 돈다', () => {
    expect(nextDebugUnlockMode('locked')).toBe('partial');
    expect(nextDebugUnlockMode('partial')).toBe('full');
    expect(nextDebugUnlockMode('full')).toBe('locked');
  });

  it('순환 목록은 3단 그대로다', () => {
    expect([...DEBUG_UNLOCK_MODES]).toEqual(['locked', 'partial', 'full']);
  });
});

describe('debugThemePercent / debugClearedCount', () => {
  it('부분 해제는 영역 순서대로 0 / 20 / 60 / 100 %다', () => {
    expect([0, 1, 2, 3].map((i) => debugThemePercent(i, 'partial'))).toEqual([...PARTIAL_UNLOCK_PERCENTS]);
  });

  it('영역이 4개보다 많으면 비율 목록을 순환한다', () => {
    expect(debugThemePercent(4, 'partial')).toBe(0);
    expect(debugThemePercent(5, 'partial')).toBe(20);
  });

  it('전체 해제는 영역과 무관하게 100 %, 락은 0 %다', () => {
    expect(debugThemePercent(1, 'full')).toBe(100);
    expect(debugThemePercent(3, 'locked')).toBe(0);
  });

  it('10회차 기준 20 % · 60 %는 2회 · 6회로 환산된다', () => {
    expect(debugClearedCount(10, 0)).toBe(0);
    expect(debugClearedCount(10, 20)).toBe(2);
    expect(debugClearedCount(10, 60)).toBe(6);
    expect(debugClearedCount(10, 100)).toBe(10);
  });

  it('에피소드가 없으면 0이고, 반올림 결과가 총 개수를 넘지 않는다', () => {
    expect(debugClearedCount(0, 100)).toBe(0);
    expect(debugClearedCount(3, 100)).toBe(3);
  });
});

describe('buildDebugProgress — 락 모드', () => {
  it('빈 맵을 돌려준다 (실데이터를 가리지 않는다)', () => {
    expect(buildDebugProgress(THEMES, 'locked')).toEqual({});
  });
});

describe('buildDebugProgress — 부분 해제', () => {
  const progress = buildDebugProgress(THEMES, 'partial');

  it('영역별 완주 수가 0 / 2 / 6 / 10이다', () => {
    const cleared = THEMES.map((t) => summarizeThemeProgress(t, progress).cleared);
    expect(cleared).toEqual([0, 2, 6, 10]);
  });

  it('카드가 미시작 · 진행 중 · 완료를 한 화면에 모두 보여준다', () => {
    const summaries = THEMES.map((t) => summarizeThemeProgress(t, progress));
    expect(summaries.map((s) => s.percent)).toEqual([0, 20, 60, 100]);
    expect(summaries.map((s) => s.isStarted)).toEqual([false, true, true, true]);
    expect(summaries.map((s) => s.isComplete)).toEqual([false, false, false, true]);
  });

  it('회복 앨범은 4영역 중 1영역 완료로 잡히고 종합 인사이트는 잠긴 채다', () => {
    const album = computeAlbumProgress(THEMES, progress);
    expect(album.completedThemes).toBe(1);
    expect(album.totalThemes).toBe(4);
    expect(album.clearedEpisodes).toBe(18);
    expect(album.isAllComplete).toBe(false);
  });

  it('에피소드 id는 `{themeId}-ep{n}` 형식이고 앞 회차부터 채운다', () => {
    expect(progress['job-prep-ep1']).toBeDefined();
    expect(progress['job-prep-ep2']).toBeDefined();
    expect(progress['job-prep-ep3']).toBeUndefined();
    expect(progress['workplace-ep1']).toBeUndefined();
  });
});

describe('buildDebugProgress — 전체 해제', () => {
  const progress = buildDebugProgress(THEMES, 'full');

  it('4영역 모두 100 %이고 종합 인사이트가 해금된다', () => {
    const album = computeAlbumProgress(THEMES, progress);
    expect(album.completedThemes).toBe(4);
    expect(album.percent).toBe(100);
    expect(album.isAllComplete).toBe(true);
    expect(album.clearedEpisodes).toBe(40);
  });
});

describe('buildDebugProgress — 합성 규칙', () => {
  const progress = buildDebugProgress(THEMES, 'full');
  const entries = Object.values(progress);

  it('모든 기록이 cleared이고 스키마 필드를 전부 채운다', () => {
    entries.forEach((entry) => {
      expect(entry.cleared).toBe(true);
      expect(['accept', 'reappraisal', 'refocus']).toContain(entry.selectedAngel);
      expect(typeof entry.wasHelpful).toBe('boolean');
      expect(entry.selectedReason.trim().length).toBeGreaterThan(0);
      expect(Number.isNaN(Date.parse(entry.updatedAt))).toBe(false);
    });
  });

  it('updatedAt이 전부 서로 다르다 (최근 기록 판별이 결정론적이다)', () => {
    const stamps = entries.map((e) => e.updatedAt);
    expect(new Set(stamps).size).toBe(stamps.length);
  });

  it('전략 3종과 도움 여부가 모두 통계에 잡혀 카드가 비지 않는다', () => {
    const stats = computeOverallStats(THEMES, progress);
    expect(stats.totalCleared).toBe(40);
    expect(stats.byStrategy.accept.count).toBeGreaterThan(0);
    expect(stats.byStrategy.reappraisal.count).toBeGreaterThan(0);
    expect(stats.byStrategy.refocus.count).toBeGreaterThan(0);
    expect(stats.helpfulReasonsTop3.length).toBeGreaterThan(0);
    expect(stats.unhelpfulReasonsTop3.length).toBeGreaterThan(0);
    expect(stats.helpfulRate).not.toBeNull();
  });

  it('같은 입력이면 같은 결과다 (실행 시각에 의존하지 않는다)', () => {
    expect(buildDebugProgress(THEMES, 'full')).toEqual(progress);
  });
});

describe('resolveDisplayProgress — 디버그 경계', () => {
  const real = {
    'workplace-ep1': {
      cleared: true,
      selectedAngel: 'accept' as const,
      wasHelpful: true,
      selectedReason: '실제 기록',
      updatedAt: '2026-08-01T00:00:00.000Z',
    },
  };

  it('락 모드는 실데이터를 그대로(같은 참조로) 돌려준다', () => {
    expect(resolveDisplayProgress(THEMES, real, 'locked')).toBe(real);
  });

  it('해제 모드는 실데이터를 합성 데이터로 대체하고 원본을 건드리지 않는다', () => {
    const displayed = resolveDisplayProgress(THEMES, real, 'partial');
    expect(displayed).not.toBe(real);
    expect(displayed['workplace-ep1']).toBeUndefined();
    expect(real['workplace-ep1'].selectedReason).toBe('실제 기록');
  });
});
