// src/utils/episodeUnlock.test.ts
// 회차 해금 판정의 단일 식 (목록 카드와 딥링크 가드가 함께 쓴다).

import { describe, it, expect } from 'vitest';
import { isEpisodeUnlockedAt } from './episodeUnlock';
import type { EpisodeData, ThemeCategory } from '../api/scenarioMockData';
import type { ScenarioProgressMap } from '../store/useScenarioStore';

const theme = {
  episodes: Array.from({ length: 3 }, (_, i) => ({
    id: `workplace-ep${i + 1}`,
    episodeNumber: i + 1,
  })) as EpisodeData[],
} as ThemeCategory;

const cleared = (...ids: string[]): ScenarioProgressMap =>
  Object.fromEntries(
    ids.map((id) => [
      id,
      {
        cleared: true,
        selectedAngel: 'accept' as const,
        wasHelpful: true,
        selectedReason: '이유',
        updatedAt: '2026-08-01T00:00:00.000Z',
      },
    ])
  );

describe('isEpisodeUnlockedAt', () => {
  it('1편(index 0)은 진행도가 비어 있어도 열려 있다', () => {
    expect(isEpisodeUnlockedAt(theme, 0, {})).toBe(true);
  });

  it('N편은 N-1편을 클리어해야 열린다', () => {
    expect(isEpisodeUnlockedAt(theme, 1, {})).toBe(false);
    expect(isEpisodeUnlockedAt(theme, 1, cleared('workplace-ep1'))).toBe(true);
    // 건너뛰기는 없다 — 2편을 마쳐야 3편이 열린다.
    expect(isEpisodeUnlockedAt(theme, 2, cleared('workplace-ep1'))).toBe(false);
    expect(isEpisodeUnlockedAt(theme, 2, cleared('workplace-ep1', 'workplace-ep2'))).toBe(true);
  });

  it('범위를 벗어난 회차는 잠긴 것으로 본다', () => {
    // 딥링크(#scenario/workplace/99)가 빈 플레이어를 여는 것을 막는다.
    expect(isEpisodeUnlockedAt(theme, 3, cleared('workplace-ep1', 'workplace-ep2'))).toBe(false);
    expect(isEpisodeUnlockedAt(theme, -1, {})).toBe(false);
  });
});
