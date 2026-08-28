// src/store/scenarioSaveTimeout.test.ts
// 시나리오 진행 저장의 오프라인 계약 (2026-08-12 UAT 버그 5).
//
// Firestore 웹 SDK는 오프라인 쓰기를 **에러로 끝내지 않고 로컬에 큐잉한 뒤
// 연결이 돌아올 때까지 promise를 붙잡고 있는다**. 그래서 오프라인으로 전략을
// 제출하면 화면에는 아무 안내 없이 스피너만 계속 돌았다. clearEpisode에 상한
// 시간을 걸어 대기를 끊고 실패로 처리하는 것이 이 파일의 계약이다.
//
// 파일을 나눈 이유는 seenReports.test.ts와 같다 — useScenarioStore.test.ts는
// env를 모킹하지 않아 CSV 출처가 달라지므로, 실 모드(IS_MOCK_MODE=false)를
// 강제해야 하는 테스트는 같은 파일에 얹을 수 없다. 여기서는 firebase/firestore
// 자체를 모킹하므로 네트워크로 나가지 않는다.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../api/env', () => ({ IS_MOCK_MODE: false }));
vi.mock('../api/firebase', () => ({ db: {} }));

const mocks = vi.hoisted(() => ({
  setDoc: vi.fn(),
  getDoc: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...path: string[]) => ({ path: path.join('/') }),
  getDoc: mocks.getDoc,
  setDoc: mocks.setDoc,
}));

import { useScenarioStore, SCENARIO_SAVE_TIMEOUT_MS } from './useScenarioStore';
import { COPY } from '../constants/copy';

const UID = 'uid-offline';
const EPISODE_ID = 'relationship-ep1';
const CHOICE = {
  selectedAngel: 'accept' as const,
  wasHelpful: true,
  selectedReason: '감정을 편안하게 해줌',
};

beforeEach(() => {
  vi.useFakeTimers();
  mocks.setDoc.mockReset();
  useScenarioStore.setState({ progress: {}, error: null, isLoading: false });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('clearEpisode — 오프라인 저장 상한', () => {
  it('상한을 넘기면 대기를 끊고 실패로 끝낸다 (스피너가 풀린다)', async () => {
    // 오프라인 Firestore 쓰기 재현 — resolve도 reject도 하지 않는다.
    mocks.setDoc.mockReturnValue(new Promise(() => {}));

    const saving = useScenarioStore.getState().clearEpisode(UID, EPISODE_ID, CHOICE);

    // 상한 직전까지는 아직 대기 중이어야 한다.
    await vi.advanceTimersByTimeAsync(SCENARIO_SAVE_TIMEOUT_MS - 1);
    expect(useScenarioStore.getState().isLoading).toBe(true);

    await vi.advanceTimersByTimeAsync(1);

    expect(await saving).toBe(false);
    // isLoading을 내려놓지 않으면 화면의 스피너가 영원히 돈다 — 이 버그의 핵심.
    expect(useScenarioStore.getState().isLoading).toBe(false);
    expect(useScenarioStore.getState().error).toBe(COPY.errors.scenarioSaveTimeout);
  });

  it('실패한 저장은 진행도에 반영하지 않는다', async () => {
    mocks.setDoc.mockReturnValue(new Promise(() => {}));

    const saving = useScenarioStore.getState().clearEpisode(UID, EPISODE_ID, CHOICE);
    await vi.advanceTimersByTimeAsync(SCENARIO_SAVE_TIMEOUT_MS);
    await saving;

    expect(useScenarioStore.getState().progress[EPISODE_ID]).toBeUndefined();
  });

  it('상한 안에 끝나면 정상 저장이다 (상한이 성공 경로를 건드리지 않는다)', async () => {
    mocks.setDoc.mockResolvedValue(undefined);

    const saving = useScenarioStore.getState().clearEpisode(UID, EPISODE_ID, CHOICE);
    await vi.advanceTimersByTimeAsync(0);

    expect(await saving).toBe(true);
    expect(useScenarioStore.getState().isLoading).toBe(false);
    expect(useScenarioStore.getState().error).toBeNull();
    expect(useScenarioStore.getState().progress[EPISODE_ID]?.cleared).toBe(true);

    // 저장이 끝난 뒤 상한 타이머가 뒤늦게 터져 상태를 되돌리면 안 된다.
    await vi.advanceTimersByTimeAsync(SCENARIO_SAVE_TIMEOUT_MS * 2);
    expect(useScenarioStore.getState().error).toBeNull();
    expect(useScenarioStore.getState().progress[EPISODE_ID]?.cleared).toBe(true);
  });

  // 화면에 그대로 노출되는 값이라 SDK 원문(영문)이 새어 나가면 안 된다.
  it('상한 초과가 아닌 실패는 일반 저장 실패 문구를 쓴다', async () => {
    mocks.setDoc.mockRejectedValue(new Error('PERMISSION_DENIED: Missing or insufficient permissions.'));

    const saving = useScenarioStore.getState().clearEpisode(UID, EPISODE_ID, CHOICE);
    await vi.advanceTimersByTimeAsync(0);

    expect(await saving).toBe(false);
    expect(useScenarioStore.getState().isLoading).toBe(false);
    expect(useScenarioStore.getState().error).toBe(COPY.errors.scenarioSaveFailed);
  });
});
