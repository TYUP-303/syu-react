// src/utils/episodeUnlock.ts
// 에피소드 한 편이 열려 있는지 판정하는 **단일 식**.
//
// 규칙 자체는 오래된 것이다 — 1번은 항상 열려 있고, N번은 N-1번을 클리어해야
// 열린다. 목록 화면(EpisodeListView)이 자기 안에 들고 있던 것을 2026-08-27에
// 여기로 꺼냈다: 딥링크(#scenario/<themeId>/<n>)가 목록을 거치지 않고 플레이어를
// 열 수 있게 되면서, 같은 잠금을 **두 곳**에서 판정하게 됐기 때문이다. 식이
// 두 벌이면 "목록에서는 잠겨 있는데 주소로는 열리는" 어긋남이 생긴다.
//
// 진행도는 호출부가 고른 한 벌을 그대로 받는다. 시나리오 탭은 디버그 해금
// 모드에서 합성 진행도(resolveDisplayProgress)를 흘려보내므로, 이 함수가
// 모드를 따로 알 필요가 없다.

import type { ThemeCategory } from '../api/scenarioMockData';
import type { ScenarioProgressMap } from '../store/useScenarioStore';

/**
 * 이 영역의 index번째(0부터) 에피소드가 열려 있는가.
 *
 * 범위를 벗어난 index는 false다 — 없는 회차를 "열려 있다"고 답하면 딥링크가
 * 빈 플레이어를 띄운다.
 */
export function isEpisodeUnlockedAt(
  theme: Pick<ThemeCategory, 'episodes'>,
  index: number,
  progress: ScenarioProgressMap
): boolean {
  if (index < 0 || index >= theme.episodes.length) return false;
  if (index === 0) return true;
  const previous = theme.episodes[index - 1];
  return !!previous && !!progress[previous.id]?.cleared;
}
