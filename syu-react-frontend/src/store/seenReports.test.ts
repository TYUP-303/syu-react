// src/store/seenReports.test.ts
// 완주 보고서 열람 기록(users/{uid}.seenReports)의 저장·복원 계약.
//
// 별도 파일인 이유: useScenarioStore.test.ts는 env를 모킹하지 않아 실제
// Firestore로 나간다(로컬 .env.local의 키를 Vite가 테스트에도 주입한다).
// 여기서는 Mock 모드(localStorage 경로)를 강제해야 하므로 파일을 나눈다 —
// 같은 파일에 vi.mock('../api/env')을 얹으면 그 파일의 기존 배치 테스트가
// 보는 CSV 출처(Firestore → 로컬)까지 함께 바뀐다.
//
// 계약의 핵심은 null과 []의 구분이다: null은 "아직 모른다"(로드 전·구버전
// 데이터)라서 소비처가 런타임 판정으로 폴백해야 하고, []는 "확실히 하나도
// 안 봤다"라서 최초 보고서를 띄워야 한다.

import { describe, expect, it, beforeEach, vi } from 'vitest';

vi.mock('../api/env', () => ({ IS_MOCK_MODE: true }));
vi.mock('../api/firebase', () => ({ db: {} }));

// vitest 기본 환경(node)에는 localStorage가 없다 — Mock 모드 경로가 쓴다.
const storage = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => void storage.set(key, value),
  removeItem: (key: string) => void storage.delete(key),
  clear: () => storage.clear(),
});

import { useScenarioStore } from './useScenarioStore';

const UID = 'uid-seen';

beforeEach(() => {
  storage.clear();
  useScenarioStore.setState({ seenReports: null, progress: {} });
});

describe('seenReports — 보고서 열람 기록', () => {
  it('기록이 없으면 null이다 (빈 배열과 구분 — 구버전 데이터 폴백용)', async () => {
    await useScenarioStore.getState().fetchProgress(UID);
    expect(useScenarioStore.getState().seenReports).toBeNull();
  });

  it('markReportSeen이 themeId를 담고, 같은 키에서 다시 읽힌다', async () => {
    expect(await useScenarioStore.getState().markReportSeen(UID, 'workplace')).toBe(true);
    expect(useScenarioStore.getState().seenReports).toEqual(['workplace']);

    // 새로고침 상황 — 스토어를 비우고 다시 읽어도 남아 있어야 한다
    useScenarioStore.setState({ seenReports: null });
    await useScenarioStore.getState().fetchProgress(UID);
    expect(useScenarioStore.getState().seenReports).toEqual(['workplace']);
  });

  it('같은 themeId를 두 번 기록해도 중복되지 않는다', async () => {
    await useScenarioStore.getState().markReportSeen(UID, 'workplace');
    await useScenarioStore.getState().markReportSeen(UID, 'workplace');
    expect(useScenarioStore.getState().seenReports).toEqual(['workplace']);
  });

  it('여러 영역을 순서대로 누적한다', async () => {
    await useScenarioStore.getState().markReportSeen(UID, 'workplace');
    await useScenarioStore.getState().markReportSeen(UID, 'daily');
    expect(useScenarioStore.getState().seenReports).toEqual(['workplace', 'daily']);
  });

  it('진행도와 열람 기록을 한 번의 읽기로 함께 복원한다', async () => {
    await useScenarioStore.getState().markReportSeen(UID, 'workplace');
    localStorage.setItem(
      `react_scenario_${UID}`,
      JSON.stringify({
        'workplace-ep1': {
          cleared: true,
          selectedAngel: 'accept',
          wasHelpful: true,
          selectedReason: '이유',
          updatedAt: '2026-08-01T00:00:00.000Z',
        },
      }),
    );
    useScenarioStore.setState({ seenReports: null, progress: {} });

    await useScenarioStore.getState().fetchProgress(UID);

    expect(useScenarioStore.getState().seenReports).toEqual(['workplace']);
    expect(useScenarioStore.getState().progress['workplace-ep1']?.cleared).toBe(true);
  });

  // 진행도를 지웠는데 "이미 봤다"는 기록만 남으면, 처음부터 다시 하는
  // 사용자가 최초 보고서를 영원히 못 본다.
  it('진행도 초기화는 열람 기록도 함께 비운다', async () => {
    await useScenarioStore.getState().markReportSeen(UID, 'workplace');
    await useScenarioStore.getState().resetProgress(UID);
    expect(useScenarioStore.getState().seenReports).toEqual([]);
  });
});
