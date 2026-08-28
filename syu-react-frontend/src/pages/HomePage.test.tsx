// src/pages/HomePage.test.tsx
// @vitest-environment jsdom
//
// 하단 탭바의 **활성 표시**가 지금 보이는 화면과 어긋나지 않는다.
//
// 탭바는 주소(activeTab)만 보고 활성 탭을 칠했는데, 탭 위에 덮이는 화면들은
// 주소를 갖지 않거나(유형 보고서) 다른 주소를 갖는다(마이페이지·엔딩). 그래서
// 보고서를 보고 있는데 '시나리오'가 활성으로 남는 어긋남이 생겼다
// (2026-08-27 3차 UAT R3-05). 덮는 화면이 하나라도 떠 있으면 **아무 탭도**
// 활성이 아니다 — 지금 보는 것이 세 탭 중 하나가 아니기 때문이다.
//
// 활성 여부의 판정 근거는 색 클래스가 아니라 aria-current다. 시각 표시와 같은
// 조건에서 붙으므로 낭독기에도 같은 뜻이 전해지고, 테스트도 유틸리티 클래스가
// 아니라 의미를 본다.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';

vi.hoisted(() => {
  const map = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    clear: () => map.clear(),
  });
});

vi.mock('../api/env', () => ({ IS_MOCK_MODE: true }));
vi.mock('../api/firebase', () => ({
  db: {},
  auth: { currentUser: null },
  signInWithGoogle: vi.fn(),
  signOutUser: vi.fn(),
  syncUserToFirestore: vi.fn(),
  deleteUserDoc: vi.fn(),
}));

// ── 탭 스텁 ──
// 여기서 볼 것은 탭바의 활성 표시뿐이라, 탭 내용은 전부 껍데기로 둔다.
// 시나리오 탭만 보고서 열림 신호를 되쏘는 버튼을 갖는다.
vi.mock('../components/home/HomeTab', () => ({
  default: () => <div data-testid="tab-home" />,
}));
vi.mock('../components/home/ScenarioTab', () => ({
  default: ({ onReportOpenChange }: any) => (
    <div data-testid="tab-scenario">
      <button onClick={() => onReportOpenChange?.(true)}>보고서 열림</button>
      <button onClick={() => onReportOpenChange?.(false)}>보고서 닫힘</button>
    </div>
  ),
}));
vi.mock('../components/home/AnalysisTab', () => ({
  default: () => <div data-testid="tab-analysis" />,
}));
vi.mock('../components/home/MyPageView', () => ({
  default: () => <div data-testid="overlay-mypage" />,
}));
vi.mock('./EndingPage', () => ({
  default: () => <div data-testid="overlay-ending" />,
}));

import HomePage from './HomePage';
import { useAuthStore } from '../store/useAuthStore';
import { useCharacterStore } from '../store/useCharacterStore';
import { useTestStore } from '../store/useTestStore';

const pristine = {
  auth: useAuthStore.getState(),
  character: useCharacterStore.getState(),
  test: useTestStore.getState(),
};

beforeEach(() => {
  useAuthStore.setState({ user: { uid: 'uid-1', email: 't@t.test' } as never });
  useCharacterStore.setState({
    character: { nickname: '테스터', gender: 'female' } as never,
    isLoading: false,
    fetchCharacter: async () => {},
  } as never);
  useTestStore.setState({ fetchTestResults: async () => {} } as never);
});

afterEach(() => {
  cleanup();
  useAuthStore.setState(pristine.auth);
  useCharacterStore.setState(pristine.character);
  useTestStore.setState(pristine.test);
});

const noop = () => {};

function renderHome(overrides: Partial<Parameters<typeof HomePage>[0]> = {}) {
  return render(
    <HomePage
      onStartCreation={noop}
      onStartTest={noop}
      onGoLanding={noop}
      activeTab="scenario"
      onChangeTab={noop}
      scenarioPath=""
      onScenarioPathChange={noop}
      isMyPageOpen={false}
      onOpenMyPage={noop}
      onCloseMyPage={noop}
      isEndingOpen={false}
      onOpenEnding={noop}
      onCloseEnding={noop}
      {...overrides}
    />,
  );
}

/**
 * 지금 활성으로 칠해진 탭의 라벨들. 없으면 빈 배열이다.
 *
 * 라벨은 버튼의 마지막 자식(글자 span)에서 읽는다 — textContent를 통째로
 * 쓰면 아이콘 글리프 이름('explore')이 앞에 붙는다.
 */
const activeTabLabels = () =>
  screen
    .getAllByRole('button')
    .filter((button) => button.getAttribute('aria-current') === 'page')
    .map((button) => button.lastElementChild?.textContent?.trim() ?? '');

describe('HomePage 탭바 — 덮는 화면이 뜨면 활성 탭이 없다 (R3-05)', () => {
  it('평소에는 지금 주소의 탭이 활성이다', () => {
    renderHome();
    expect(activeTabLabels()).toEqual(['시나리오']);
  });

  it('유형 보고서가 열리면 아무 탭도 활성이 아니다', async () => {
    const user = userEvent.setup();
    renderHome();

    await user.click(screen.getByRole('button', { name: '보고서 열림' }));

    expect(activeTabLabels()).toEqual([]);
  });

  it('보고서를 닫으면 다시 시나리오 탭이 활성이 된다', async () => {
    const user = userEvent.setup();
    renderHome();
    await user.click(screen.getByRole('button', { name: '보고서 열림' }));

    await user.click(screen.getByRole('button', { name: '보고서 닫힘' }));

    expect(activeTabLabels()).toEqual(['시나리오']);
  });

  it('마이페이지·엔딩 오버레이도 같은 규칙이다 (기존 계약)', () => {
    const { rerender } = renderHome({ isMyPageOpen: true });
    expect(activeTabLabels()).toEqual([]);

    rerender(
      <HomePage
        onStartCreation={noop}
        onStartTest={noop}
        onGoLanding={noop}
        activeTab="scenario"
        onChangeTab={noop}
        scenarioPath=""
        onScenarioPathChange={noop}
        isMyPageOpen={false}
        onOpenMyPage={noop}
        onCloseMyPage={noop}
        isEndingOpen
        onOpenEnding={noop}
        onCloseEnding={noop}
      />,
    );
    expect(activeTabLabels()).toEqual([]);
  });
});
