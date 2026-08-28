// src/utils/debugProgress.ts
// 개발자 디버그 해금 — **표시 전용** 진행도 합성기.
//
// 검수 문제: 개발자 계정이 시나리오·회복일기를 열어도 실데이터가 0%라
// "미시작/진행 중/완료" 카드 상태를 한 화면에서 볼 수 없었다. 그렇다고
// 화면마다 표시값을 손으로 바꾸면(예전 DiaryListView의 summaries/album
// 강제 변환) 카드 %는 100인데 상세 통계는 0건인 어긋난 화면이 나온다.
//
// 그래서 **경계에서 가짜 ScenarioProgressMap을 합성**해 실데이터 대신
// 하류로 흘려보낸다. 시나리오 탭 카드 %, 회복 앨범 게이지, 영역 카드,
// 종합 인사이트, 상세 통계가 모두 같은 한 벌의 데이터를 집계하므로
// 자동으로 앞뒤가 맞는다.
//
// ⚠️ 여기서 만든 값은 **절대 저장되지 않는다**. Firestore·localStorage
// 쓰기는 useScenarioStore.clearEpisode만 하고, 이 함수의 결과는 스토어에
// 들어가지 않은 채 렌더 트리로만 내려간다. 스토어에 set 하지 말 것.

import type { ThemeCategory } from '../api/scenarioMockData';
import type { ScenarioProgressMap } from '../store/useScenarioStore';
import { STRATEGY_KEYS } from '../constants/strategy';

/** 디버그 해금 3단 모드. 개발자 계정이라도 기본값은 'locked'다. */
export type DebugUnlockMode = 'locked' | 'partial' | 'full';

/** 토글 순환 순서. */
export const DEBUG_UNLOCK_MODES = ['locked', 'partial', 'full'] as const;

export const DEBUG_UNLOCK_MODE_LABEL: Record<DebugUnlockMode, string> = {
  locked: '락',
  partial: '부분',
  full: '전체',
};

/** 락 → 부분 → 전체 → 락 순환. */
export function nextDebugUnlockMode(mode: DebugUnlockMode): DebugUnlockMode {
  const idx = DEBUG_UNLOCK_MODES.indexOf(mode);
  // 알 수 없는 값이 들어오면 순환의 처음('partial')으로 보낸다.
  return DEBUG_UNLOCK_MODES[(idx + 1) % DEBUG_UNLOCK_MODES.length];
}

/**
 * 부분 해제에서 영역 순서대로 적용할 완주 비율(%).
 *
 * 미시작(0) · 진행 중 초반(20) · 진행 중 후반(60) · 완료(100)를 한 화면에
 * 늘어놓아 카드의 모든 상태를 동시에 검수할 수 있게 한 배치다. 영역이 4개보다
 * 많으면 이 목록을 순환한다.
 */
export const PARTIAL_UNLOCK_PERCENTS = [0, 20, 60, 100] as const;

/** 합성 기록의 updatedAt 기준 시각. 실행 시각과 무관하게 결정론적이어야 한다. */
const DEBUG_BASE_TIME = Date.parse('2026-01-01T00:00:00.000Z');
const HOUR_MS = 60 * 60 * 1000;

/**
 * 에피소드에 요인 목록이 비어 있을 때 쓰는 대체 문구.
 * (useScenarioStore가 채워 주는 기본 요인과 같은 결의 실제 문자열)
 */
const FALLBACK_REASONS = {
  helpful: ['감정을 편안하게 해줌', '새로운 관점을 제시함', '실질적인 도움이 됨'],
  unhelpful: ['상황에 맞지 않음', '공감되지 않음', '너무 이상적임'],
} as const;

/** 비율(%)을 완주 개수로 환산한다. 총 개수를 넘지 않는다. */
export function debugClearedCount(total: number, percent: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(total, Math.round((total * percent) / 100)));
}

/** 모드별로 영역 i번째에 적용할 완주 비율(%). */
export function debugThemePercent(themeIndex: number, mode: DebugUnlockMode): number {
  if (mode === 'locked') return 0;
  if (mode === 'full') return 100;
  return PARTIAL_UNLOCK_PERCENTS[themeIndex % PARTIAL_UNLOCK_PERCENTS.length];
}

function pickReason(pool: readonly string[] | undefined, seq: number, wasHelpful: boolean): string {
  const fallback = wasHelpful ? FALLBACK_REASONS.helpful : FALLBACK_REASONS.unhelpful;
  const list = pool && pool.length > 0 ? pool : fallback;
  return list[seq % list.length];
}

/**
 * 디버그 모드에 맞는 가짜 진행도 맵을 만든다.
 *
 * - `locked`  → 빈 맵 (실데이터를 그대로 쓰라는 신호)
 * - `partial` → 영역 순서대로 0 / 20 / 60 / 100 %
 * - `full`    → 전 영역 100 %
 *
 * 합성 규칙(전 영역 통틀어 증가하는 seq 기준):
 * - selectedAngel은 3전략 순환, wasHelpful은 교차, selectedReason은 그
 *   에피소드의 실제 요인 목록에서 고른다 → 통계 카드가 한쪽으로 쏠리지 않는다.
 * - updatedAt은 seq마다 1시간씩 벌려 서로 다른 ISO 문자열이 된다
 *   (findLatestPlayedThemeId가 결정론적으로 마지막 기록을 고른다).
 */
export function buildDebugProgress(
  themes: readonly ThemeCategory[],
  mode: DebugUnlockMode,
): ScenarioProgressMap {
  if (mode === 'locked') return {};

  const map: ScenarioProgressMap = {};
  let seq = 0;

  themes.forEach((theme, themeIndex) => {
    const percent = debugThemePercent(themeIndex, mode);
    const count = debugClearedCount(theme.episodes.length, percent);

    theme.episodes.slice(0, count).forEach((episode) => {
      const wasHelpful = seq % 2 === 0;
      map[episode.id] = {
        cleared: true,
        selectedAngel: STRATEGY_KEYS[seq % STRATEGY_KEYS.length],
        wasHelpful,
        selectedReason: pickReason(
          wasHelpful ? episode.reasons?.helpful : episode.reasons?.unhelpful,
          seq,
          wasHelpful,
        ),
        updatedAt: new Date(DEBUG_BASE_TIME + seq * HOUR_MS).toISOString(),
      };
      seq += 1;
    });
  });

  return map;
}

/**
 * 화면에 실제로 흘려보낼 진행도를 고른다 — 디버그 경계는 여기 한 곳뿐이다.
 * 락 모드에서는 실데이터를 **그대로** 돌려주므로 참조가 바뀌지 않는다.
 */
export function resolveDisplayProgress(
  themes: readonly ThemeCategory[],
  progress: ScenarioProgressMap,
  mode: DebugUnlockMode,
): ScenarioProgressMap {
  return mode === 'locked' ? progress : buildDebugProgress(themes, mode);
}
