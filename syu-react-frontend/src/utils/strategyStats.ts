// src/utils/strategyStats.ts
// 축 B(대처 전략) 진행도 집계의 단일 출처.
//
// `useScenarioStore.progress[episodeId]`에 쌓인 EpisodeProgress를 읽어
// 전략 카운트 · 도움 체감률 · 요인 빈도로 환산한다. 스토어를 import하지
// 않고 순수 함수로만 두어(읽기 전용 계약) 테스트와 재사용이 쉽다.
//
// 이전에는 같은 집계가 두 곳에 복붙돼 있었다:
//   TypeReportView.tsx:35-41  — 테마별 전략 카운트
//   DiaryDetailView.tsx:131-139 — 같은 카운트를 if/else로 다시 구현
// 두 곳 모두 `wasHelpful`·`selectedReason`은 쳐다보지 않아, 플레이어가
// 매 에피소드 저장하던 두 필드가 어디서도 소비되지 않고 있었다.
// R2가 그 첫 소비자다.
//
// ⚠️ EpisodeProgress 스키마는 불변이다(2축 개편 공유 계약). 여기서
// 필요한 값이 없다면 스토어를 고치는 게 아니라 집계로 유도해야 한다.

import type { EpisodeData, ThemeCategory } from '../api/scenarioMockData';
import type { EpisodeProgress, ScenarioProgressMap } from '../store/useScenarioStore';
import { STRATEGY_KEYS, type StrategyKey } from '../constants/strategy';

/**
 * 비율(%)을 표시해도 되는 최소 표본 수 (2026-08-08 확정).
 *
 * 1~2회 기록에서 나오는 "50 %"·"100 %"는 정밀해 보이지만 실제로는
 * "2회 중 1회"·"1회 중 1회"의 다른 표기일 뿐이다. 훈련을 한 번 더 하면
 * 100 %가 50 %로 반토막 나는데, 그 흔들림이 사용자에게는 "내가 나빠졌다"로
 * 읽힌다. 표본이 이보다 작으면 %를 접고 원래의 횟수를 그대로 보여준다.
 *
 * ⚠️ 이 상수는 보고서의 **표시 규칙**이다. 집계값(ratio·helpfulRate) 자체는
 * 그대로 계산해 둔다 — 게이지 길이처럼 수치가 필요한 곳이 있고, 규칙이
 * 바뀔 때 집계를 다시 만들지 않아도 되게 하기 위해서다.
 */
export const MIN_SAMPLE_FOR_PERCENT = 3;

/** 이 표본 수에서 %를 써도 되는가. 규칙의 단일 출처다. */
export function canShowPercent(sampleCount: number): boolean {
  return sampleCount >= MIN_SAMPLE_FOR_PERCENT;
}

/** 전략 1종의 집계 결과. */
export interface StrategyStat {
  key: StrategyKey;
  /** 이 전략을 선택해 완주한 에피소드 수 */
  count: number;
  /** 전체 완주 수 대비 선택 비중 (%) — 완주 0회면 0 */
  ratio: number;
  /** 그중 "도움이 됐다"고 답한 수 */
  helpfulCount: number;
  /**
   * 도움 체감률 (%). **선택 기록이 없으면 null** — 0%와 구분해야 한다.
   * "1회 중 0회 도움됨(0%)"과 "쓴 적 없음"은 화면에서 다르게 읽혀야 한다.
   */
  helpfulRate: number | null;
}

/** 요인(selectedReason) 빈도 한 줄. */
export interface ReasonStat {
  reason: string;
  count: number;
}

export interface StrategyStats {
  /** 집계에 들어간 완주 에피소드 수 */
  totalCleared: number;
  byStrategy: Record<StrategyKey, StrategyStat>;
  /**
   * 최다 선택 전략. **완주 0회면 null** — getDominantStrategy는 전부 0일 때도
   * 'accept'를 돌려주므로(호출부가 판단하라는 계약) 여기서 명시적으로 막는다.
   * 동점이면 STRATEGY_KEYS 순서상 앞선 키가 이긴다(결정론적).
   */
  dominant: StrategyKey | null;
  /** 전체 도움 체감 수 */
  helpfulCount: number;
  /** 전체 도움 체감률 (%) — 완주 0회면 null */
  helpfulRate: number | null;
  /** "도움이 되었던 이유" 상위 3개 (데이터 없으면 빈 배열) */
  helpfulReasonsTop3: ReasonStat[];
  /** "잘 모르겠던 이유" 상위 3개 (데이터 없으면 빈 배열) */
  unhelpfulReasonsTop3: ReasonStat[];
}

const EMPTY_STAT = (key: StrategyKey): StrategyStat => ({
  key,
  count: 0,
  ratio: 0,
  helpfulCount: 0,
  helpfulRate: null,
});

/** 완주한 에피소드의 진행 기록만 순서대로 뽑는다. */
export function collectClearedProgress(
  episodes: readonly EpisodeData[],
  progress: ScenarioProgressMap,
): EpisodeProgress[] {
  return episodes
    .map((ep) => progress[ep.id])
    .filter((p): p is EpisodeProgress => !!p?.cleared);
}

/**
 * 요인 빈도 Top N.
 *
 * 정렬은 빈도 내림차순이고, **동점이면 먼저 등장한 요인이 앞선다**
 * (에피소드 순서가 결정론적이므로 결과도 결정론적이다). 빈 문자열과
 * 공백만 있는 값은 집계에서 제외한다 — 레거시 기록에 빈 selectedReason이
 * 섞여 있어 그대로 세면 "" 항목이 1위로 올라온다.
 */
export function topReasons(reasons: readonly string[], limit = 3): ReasonStat[] {
  const counts = new Map<string, number>();
  reasons.forEach((raw) => {
    const reason = raw?.trim();
    if (!reason) return;
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  });
  // Map은 삽입 순서를 보존하므로 안정 정렬만으로 "먼저 등장한 것이 앞"이 된다.
  return [...counts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/** 완주 기록 목록을 집계한다. 화면은 대개 아래 두 래퍼를 쓴다. */
export function computeStrategyStats(entries: readonly EpisodeProgress[]): StrategyStats {
  const byStrategy = {
    accept: EMPTY_STAT('accept'),
    reappraisal: EMPTY_STAT('reappraisal'),
    refocus: EMPTY_STAT('refocus'),
  } satisfies Record<StrategyKey, StrategyStat>;

  const helpfulReasons: string[] = [];
  const unhelpfulReasons: string[] = [];

  entries.forEach((entry) => {
    const stat = byStrategy[entry.selectedAngel];
    // 알 수 없는 전략 키(스키마 밖 값)는 조용히 건너뛴다 — 레거시 방어.
    if (!stat) return;
    stat.count += 1;
    if (entry.wasHelpful) {
      stat.helpfulCount += 1;
      helpfulReasons.push(entry.selectedReason);
    } else {
      unhelpfulReasons.push(entry.selectedReason);
    }
  });

  const totalCleared = STRATEGY_KEYS.reduce((sum, key) => sum + byStrategy[key].count, 0);
  const helpfulCount = STRATEGY_KEYS.reduce((sum, key) => sum + byStrategy[key].helpfulCount, 0);

  STRATEGY_KEYS.forEach((key) => {
    const stat = byStrategy[key];
    stat.ratio = totalCleared === 0 ? 0 : Math.round((stat.count / totalCleared) * 100);
    stat.helpfulRate = stat.count === 0 ? null : Math.round((stat.helpfulCount / stat.count) * 100);
  });

  const dominant =
    totalCleared === 0
      ? null
      : STRATEGY_KEYS.reduce((best, key) =>
          byStrategy[key].count > byStrategy[best].count ? key : best,
        STRATEGY_KEYS[0]);

  return {
    totalCleared,
    byStrategy,
    dominant,
    helpfulCount,
    helpfulRate: totalCleared === 0 ? null : Math.round((helpfulCount / totalCleared) * 100),
    helpfulReasonsTop3: topReasons(helpfulReasons),
    unhelpfulReasonsTop3: topReasons(unhelpfulReasons),
  };
}

/** 한 영역(테마)의 집계. 테마를 못 찾으면 빈 집계를 돌려준다. */
export function computeThemeStats(
  themes: readonly ThemeCategory[],
  themeId: string,
  progress: ScenarioProgressMap,
): StrategyStats {
  const theme = themes.find((t) => t.id === themeId);
  return computeStrategyStats(theme ? collectClearedProgress(theme.episodes, progress) : []);
}

/** 전 영역 합산 집계 (종합 인사이트용). */
export function computeOverallStats(
  themes: readonly ThemeCategory[],
  progress: ScenarioProgressMap,
): StrategyStats {
  const entries = themes.flatMap((theme) => collectClearedProgress(theme.episodes, progress));
  return computeStrategyStats(entries);
}

/** 영역별 완주 진행도 — 게이지·카드가 공통으로 쓴다. */
export interface ThemeProgressSummary {
  themeId: string;
  title: string;
  icon: string;
  description: string;
  cleared: number;
  total: number;
  /** 완주 비율 (%) — 에피소드가 0개면 0 */
  percent: number;
  isComplete: boolean;
  isStarted: boolean;
}

export function summarizeThemeProgress(
  theme: ThemeCategory,
  progress: ScenarioProgressMap,
): ThemeProgressSummary {
  const total = theme.episodes.length;
  const cleared = theme.episodes.filter((ep) => progress[ep.id]?.cleared).length;
  return {
    themeId: theme.id,
    title: theme.title,
    icon: theme.icon,
    description: theme.description,
    cleared,
    total,
    percent: total === 0 ? 0 : Math.round((cleared / total) * 100),
    isComplete: total > 0 && cleared >= total,
    isStarted: cleared > 0,
  };
}

/** 회복 앨범 진행 — 분모는 **영역 수**다 (시안의 1/5 표기는 오기, 교정 3번). */
export interface AlbumProgress {
  completedThemes: number;
  totalThemes: number;
  percent: number;
  isAllComplete: boolean;
  /** 전 영역 합산 완주 에피소드 수 */
  clearedEpisodes: number;
  totalEpisodes: number;
}

export function computeAlbumProgress(
  themes: readonly ThemeCategory[],
  progress: ScenarioProgressMap,
): AlbumProgress {
  const summaries = themes.map((theme) => summarizeThemeProgress(theme, progress));
  const completedThemes = summaries.filter((s) => s.isComplete).length;
  const totalThemes = summaries.length;
  return {
    completedThemes,
    totalThemes,
    percent: totalThemes === 0 ? 0 : Math.round((completedThemes / totalThemes) * 100),
    isAllComplete: totalThemes > 0 && completedThemes === totalThemes,
    clearedEpisodes: summaries.reduce((sum, s) => sum + s.cleared, 0),
    totalEpisodes: summaries.reduce((sum, s) => sum + s.total, 0),
  };
}

/**
 * 가장 최근에 훈련한 영역 — "이번 훈련 기록"(시안 05)과 잠금 화면(07·10)의
 * "가장 많이 진행한 영역"이 가리킬 대상이다.
 *
 * `updatedAt`은 ISO 문자열이라 사전순 비교가 곧 시간순 비교다. 기록이
 * 하나도 없으면 null.
 */
export function findLatestPlayedThemeId(
  themes: readonly ThemeCategory[],
  progress: ScenarioProgressMap,
): string | null {
  let latestThemeId: string | null = null;
  let latestAt = '';
  themes.forEach((theme) => {
    theme.episodes.forEach((ep) => {
      const entry = progress[ep.id];
      if (!entry?.cleared) return;
      if (entry.updatedAt > latestAt) {
        latestAt = entry.updatedAt;
        latestThemeId = theme.id;
      }
    });
  });
  return latestThemeId;
}
