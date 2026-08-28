// src/store/epilogues.test.ts
//
// 에필로그가 **기존 통계에 섞이지 않는다**는 계약을 고정한다 (2026-08-26).
//
// 이 파일이 지키는 것은 화면이 아니라 경계다. 에필로그를 `scenarios` 맵에
// 넣으면 영역 완주 판정의 분모가 10에서 11로 늘어 엔딩 해금·회복 앨범 완주·
// 핵심 요인 Top3가 한꺼번에 어긋난다. 그래서 저장은 별도 필드
// `users/{uid}.epilogues`로만 나가고, 집계 함수는 에필로그를 본 뒤에도
// 같은 값을 내야 한다.
//
// seenReports.test.ts와 같은 방식으로 Mock 모드(localStorage)에서 검증한다.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../api/env', () => ({ IS_MOCK_MODE: true }));
vi.mock('../api/firebase', () => ({ db: {}, auth: {} }));

// vitest 기본 환경(node)에는 localStorage가 없다 — Mock 모드 경로가 쓴다.
// seenReports.test.ts와 같은 스텁이다.
const storage = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => void storage.set(key, value),
  removeItem: (key: string) => void storage.delete(key),
  clear: () => storage.clear(),
});

import { useScenarioStore } from './useScenarioStore';
import { computeAlbumProgress, summarizeThemeProgress } from '../utils/strategyStats';
import {
  EPILOGUE_SCENE_MIN,
  EPILOGUE_SCENE_MAX,
} from '../utils/scenarioEpilogueCsvParser';

const UID = 'uid-epilogue';

function resetStore() {
  localStorage.clear();
  useScenarioStore.setState({
    progress: {},
    seenReports: null,
    epiloguesSeen: {},
    themes: [],
    themesCycleKey: null,
  });
}

beforeEach(resetStore);

describe('fetchThemes — 에필로그 배치', () => {
  it('4영역 모두에 에필로그 원고가 붙는다', async () => {
    await useScenarioStore.getState().fetchThemes();
    const themes = useScenarioStore.getState().themes;

    expect(themes).toHaveLength(4);
    themes.forEach((theme) => {
      expect(theme.epilogue, `${theme.id}에 에필로그가 없다`).toBeDefined();
      // 씬 수는 영역마다 다르다(4~6) — 매듭 장면의 길이가 영역마다 달라서다.
      // 여기서 고정 숫자를 박으면 원고가 한 씬 늘 때마다 무관한 테스트가 깨진다.
      expect(theme.epilogue!.scenes.length).toBeGreaterThanOrEqual(EPILOGUE_SCENE_MIN);
      expect(theme.epilogue!.scenes.length).toBeLessThanOrEqual(EPILOGUE_SCENE_MAX);
      expect(theme.epilogue!.title.length).toBeGreaterThan(0);
    });
  });

  it('에필로그는 episodes에 섞이지 않는다 — 영역은 여전히 10편이다', async () => {
    await useScenarioStore.getState().fetchThemes();
    const themes = useScenarioStore.getState().themes;

    themes.forEach((theme) => {
      expect(theme.episodes).toHaveLength(10);
      expect(theme.episodes.some((ep) => ep.id.includes('epilogue'))).toBe(false);
    });
  });

  it('에필로그의 DOMAIN은 영역 이름이라 의상 해석에 그대로 넘길 수 있다', async () => {
    await useScenarioStore.getState().fetchThemes();
    const byId = Object.fromEntries(
      useScenarioStore.getState().themes.map((t) => [t.id, t.epilogue?.domain])
    );

    expect(byId).toEqual({
      workplace: '직장',
      'job-prep': '취업준비',
      relationship: '연인',
      daily: '일상',
    });
  });
});

describe('markEpilogueSeen', () => {
  it('themeId를 키로 열람 시각을 남긴다', async () => {
    const ok = await useScenarioStore.getState().markEpilogueSeen(UID, 'workplace');

    expect(ok).toBe(true);
    const seen = useScenarioStore.getState().epiloguesSeen;
    expect(Object.keys(seen)).toEqual(['workplace']);
    expect(typeof seen.workplace.seenAt).toBe('string');
    expect(Number.isNaN(Date.parse(seen.workplace.seenAt))).toBe(false);
  });

  it('여러 영역의 기록이 서로를 덮지 않는다', async () => {
    await useScenarioStore.getState().markEpilogueSeen(UID, 'workplace');
    await useScenarioStore.getState().markEpilogueSeen(UID, 'daily');

    expect(Object.keys(useScenarioStore.getState().epiloguesSeen).sort()).toEqual([
      'daily',
      'workplace',
    ]);
  });

  it('다시 봐도 시각만 갱신되고 기록은 하나로 남는다', async () => {
    await useScenarioStore.getState().markEpilogueSeen(UID, 'workplace');
    const first = useScenarioStore.getState().epiloguesSeen.workplace.seenAt;

    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.parse(first) + 60_000));
    await useScenarioStore.getState().markEpilogueSeen(UID, 'workplace');
    vi.useRealTimers();

    const seen = useScenarioStore.getState().epiloguesSeen;
    expect(Object.keys(seen)).toEqual(['workplace']);
    expect(seen.workplace.seenAt).not.toBe(first);
  });

  it('진행도(scenarios)에는 한 글자도 쓰지 않는다', async () => {
    await useScenarioStore.getState().markEpilogueSeen(UID, 'workplace');

    expect(useScenarioStore.getState().progress).toEqual({});
    expect(localStorage.getItem(`react_scenario_${UID}`)).toBeNull();
  });

  it('fetchProgress가 같은 기록을 다시 읽어 온다', async () => {
    await useScenarioStore.getState().markEpilogueSeen(UID, 'relationship');
    useScenarioStore.setState({ epiloguesSeen: {} });

    await useScenarioStore.getState().fetchProgress(UID);
    expect(Object.keys(useScenarioStore.getState().epiloguesSeen)).toEqual(['relationship']);
  });

  it('resetProgress는 에필로그 기록도 함께 비운다', async () => {
    await useScenarioStore.getState().markEpilogueSeen(UID, 'daily');
    await useScenarioStore.getState().resetProgress(UID);

    expect(useScenarioStore.getState().epiloguesSeen).toEqual({});
  });
});

describe('기존 집계는 에필로그를 세지 않는다', () => {
  it('에필로그를 본 뒤에도 영역 완주율과 앨범 진행도가 그대로다', async () => {
    await useScenarioStore.getState().fetchThemes();
    const themes = useScenarioStore.getState().themes;
    const progress = useScenarioStore.getState().progress;

    const before = {
      theme: summarizeThemeProgress(themes[0], progress),
      album: computeAlbumProgress(themes, progress),
    };

    await useScenarioStore.getState().markEpilogueSeen(UID, themes[0].id);

    const after = {
      theme: summarizeThemeProgress(themes[0], useScenarioStore.getState().progress),
      album: computeAlbumProgress(themes, useScenarioStore.getState().progress),
    };

    expect(after).toEqual(before);
    // 분모가 영역당 10편으로 고정돼 있어야 엔딩 해금·앨범 완주가 흔들리지 않는다.
    expect(after.theme.total).toBe(10);
    expect(after.album.totalEpisodes).toBe(40);
  });
});
