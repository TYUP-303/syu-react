// src/App.routing.test.tsx
// @vitest-environment jsdom
//
// 해시 라우팅 계약 (2026-08-18 — "모든 페이지에 주소를 달아 줘").
//
// 고정하는 것은 세 가지다:
//   1) **복원** — 주소로 직접 들어오면(새로고침·링크 공유) 그 화면이 뜬다.
//      홈 셸 안의 탭·오버레이(#scenario·#diary·#mypage·#ending)도 포함이다.
//   2) **갱신** — 화면을 옮기면 주소가 따라 바뀌고, 뒤로가기로 되돌아온다.
//   3) **가드** — 들어갈 수 없는 주소는 깨진 화면 대신 가장 가까운 안전한
//      페이지로 되돌리며, 그 되돌림은 히스토리에 쌓이지 않는다(replaceState).
//      쌓이면 뒤로가기 → 가드 → 뒤로가기의 왕복에 갇힌다.
//
// 페이지 컴포넌트는 전부 스텁이다. 여기서 검증할 것은 각 페이지의 내용이
// 아니라 App이 주소와 상태를 잇는 방식이고, 실물을 끌고 오면 CSV 파싱과
// 스토어 타이머까지 딸려 와 라우팅과 무관한 이유로 깨진다.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';

// localStorage 스텁은 import보다 먼저 꽂혀야 한다 — useAuthStore의 persist
// 미들웨어가 모듈 초기화 시점에 붙잡기 때문이다.
vi.hoisted(() => {
  const map = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    clear: () => map.clear(),
  });
});

vi.mock('./api/env', () => ({ IS_MOCK_MODE: true }));
vi.mock('./api/firebase', () => ({
  db: {},
  auth: { currentUser: null },
  signInWithGoogle: vi.fn(),
  signOutUser: vi.fn(),
  syncUserToFirestore: vi.fn(),
  deleteUserDoc: vi.fn(),
}));

// ── 페이지 스텁 ──
// 받은 props를 화면에 그대로 드러내고(무엇이 열렸는지), 버튼으로 콜백을
// 되쏜다(어디로 가는지). App의 배선만 남는다.
vi.mock('./pages/LandingPage', () => ({
  default: ({ onStart, onProfileClick }: any) => (
    <div data-testid="page-landing">
      <button onClick={onStart}>랜딩 시작</button>
      <button onClick={onProfileClick}>랜딩 프로필</button>
    </div>
  ),
}));
vi.mock('./pages/LoginPage', () => ({
  default: () => <div data-testid="page-login" />,
}));
vi.mock('./pages/SignupPage', () => ({
  default: () => <div data-testid="page-signup" />,
}));
vi.mock('./pages/CharacterCreationPage', () => ({
  default: () => <div data-testid="page-character-creation" />,
}));
vi.mock('./pages/TestUnifiedPage', () => ({
  default: ({ testType }: any) => <div data-testid={`page-test-${testType}`} />,
}));
vi.mock('./pages/HomePage', () => ({
  default: ({
    activeTab,
    onChangeTab,
    isMyPageOpen,
    onOpenMyPage,
    onCloseMyPage,
    isEndingOpen,
    onOpenEnding,
    onCloseEnding,
    onStartCreation,
    onStartTest,
    onGoLanding,
    scenarioPath,
    onScenarioPathChange,
  }: any) => (
    <div data-testid="page-home">
      <span data-testid="home-tab">{activeTab}</span>
      <span data-testid="home-mypage">{String(isMyPageOpen)}</span>
      <span data-testid="home-ending">{String(isEndingOpen)}</span>
      {/* 시나리오 탭이 받는 하위 경로와, 그 탭이 화면을 옮길 때 쏘는 콜백.
          실물 ScenarioTab의 잠금 판정은 여기서 검증할 것이 아니라
          (ScenarioTab.test.tsx의 몫) 주소가 오가는 배선만 남긴다. */}
      <span data-testid="home-scenario-path">{scenarioPath}</span>
      <button onClick={() => onScenarioPathChange('/workplace')}>영역 열기</button>
      <button onClick={() => onScenarioPathChange('/workplace/2')}>회차 열기</button>
      <button onClick={() => onScenarioPathChange('/workplace', { replace: true })}>
        회차 닫기
      </button>
      <button onClick={() => onChangeTab('scenario')}>탭 시나리오</button>
      <button onClick={() => onChangeTab('analysis')}>탭 회복일기</button>
      <button onClick={onOpenMyPage}>마이페이지 열기</button>
      <button onClick={onCloseMyPage}>마이페이지 닫기</button>
      <button onClick={onOpenEnding}>엔딩 열기</button>
      <button onClick={onCloseEnding}>엔딩 닫기</button>
      <button onClick={onStartCreation}>캐릭터 만들기</button>
      <button onClick={() => onStartTest('adhd')}>ADHD 검사 시작</button>
      <button onClick={onGoLanding}>서비스 소개</button>
    </div>
  ),
}));

import App, { RESYNC_THROTTLE_MS } from './App';
import { useAuthStore } from './store/useAuthStore';
import { useCharacterStore } from './store/useCharacterStore';
import { useConsentStore } from './store/useConsentStore';
import { useScenarioStore } from './store/useScenarioStore';
import { useSettingsStore } from './store/useSettingsStore';
import { useTestStore } from './store/useTestStore';
import type { EpisodeData, ThemeCategory } from './api/scenarioMockData';
import type { ScenarioProgressMap } from './store/useScenarioStore';

// ── 픽스처 ──

const USER = { uid: 'uid-1', email: 'tester@react.test' } as never;
const CHARACTER = { nickname: '테스트', gender: 'female', createdAt: '2026-08-01' } as never;

function makeTheme(id: string, episodeCount: number): ThemeCategory {
  const episodes = Array.from({ length: episodeCount }, (_, i) => ({
    id: `${id}-ep${i + 1}`,
    episodeNumber: i + 1,
  })) as EpisodeData[];
  return { id, title: id, description: `${id} 설명`, icon: 'work', episodes };
}

/** 두 영역 × 2편. 완주 여부만 다루므로 최소 필드로 만든다. */
const THEMES: ThemeCategory[] = [makeTheme('workplace', 2), makeTheme('daily', 2)];

function clearedProgress(episodeIds: string[]): ScenarioProgressMap {
  return Object.fromEntries(
    episodeIds.map((id) => [
      id,
      {
        cleared: true,
        selectedAngel: 'accept' as const,
        wasHelpful: true,
        selectedReason: '이유',
        updatedAt: '2026-08-01T00:00:00.000Z',
      },
    ]),
  );
}

const ALL_CLEARED = clearedProgress(THEMES.flatMap((t) => t.episodes.map((e) => e.id)));

// ── 주소 헬퍼 ──

const currentHash = () => window.location.hash;

function setHash(hash: string) {
  window.history.replaceState(null, '', hash);
}

/**
 * 뒤로가기·앞으로가기 시뮬레이션.
 *
 * 브라우저는 해시 이동에서 popstate가 아니라 **hashchange**를 쏜다. 주소를
 * 먼저 바꾸고 이벤트를 쏘는 순서까지 그대로 재현한다.
 */
async function navigateBrowser(hash: string) {
  await act(async () => {
    window.history.replaceState(null, '', hash);
    window.dispatchEvent(new Event('hashchange'));
  });
}

// ── 스토어 준비 ──
//
// App은 마운트하자마자 세션 복원·설정 조회·동의 조회를 부른다. 전부 무력화해
// 라우팅만 남긴다 (Mock 모드 fetch의 setTimeout이 다음 테스트로 새는 것도 막는다).
const pristine = {
  auth: useAuthStore.getState(),
  character: useCharacterStore.getState(),
  consent: useConsentStore.getState(),
  scenario: useScenarioStore.getState(),
  settings: useSettingsStore.getState(),
  test: useTestStore.getState(),
};

function prepareStores({
  user = USER as never,
  isLoading = false,
  character = CHARACTER as never,
  themes = THEMES,
  progress = {} as ScenarioProgressMap,
}: {
  user?: never;
  isLoading?: boolean;
  character?: never;
  themes?: ThemeCategory[];
  progress?: ScenarioProgressMap;
} = {}) {
  useAuthStore.setState({
    user,
    isLoading,
    initAuthListener: () => () => {},
  });
  useCharacterStore.setState({ character, fetchCharacter: async () => {} });
  useConsentStore.setState({
    status: 'granted',
    fetchConsent: async () => {},
    resetConsent: () => {},
  });
  useScenarioStore.setState({
    themes,
    progress,
    fetchThemes: async () => {},
    fetchProgress: async () => {},
  });
  // 복귀 재조회(N-5)가 부르는 액션이라 여기서도 무력화한다 — 실물은 Mock
  // 모드에서 300ms 타이머를 걸어 다음 테스트로 샌다.
  useTestStore.setState({ fetchTestResults: async () => {} });
  useSettingsStore.setState({ fetchSettings: async () => {} });
}

beforeEach(() => {
  setHash('');
  prepareStores();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useAuthStore.setState(pristine.auth);
  useCharacterStore.setState(pristine.character);
  useConsentStore.setState(pristine.consent);
  useScenarioStore.setState(pristine.scenario);
  useSettingsStore.setState(pristine.settings);
  useTestStore.setState(pristine.test);
  setHash('');
});

// ─────────────────────────────────────────────────────────
describe('해시 복원 — 주소로 직접 들어온다', () => {
  it('#scenario는 시나리오 탭이 열린 홈 셸을 띄운다', async () => {
    setHash('#scenario');
    render(<App />);

    expect(await screen.findByTestId('page-home')).toBeInTheDocument();
    expect(screen.getByTestId('home-tab')).toHaveTextContent('scenario');
    expect(currentHash()).toBe('#scenario');
  });

  it('#diary는 회복일기 탭으로 들어간다', async () => {
    setHash('#diary');
    render(<App />);

    expect(await screen.findByTestId('page-home')).toBeInTheDocument();
    expect(screen.getByTestId('home-tab')).toHaveTextContent('analysis');
  });

  it('#mypage는 마이페이지 오버레이를 연 채 뜬다 (바닥은 홈 탭)', async () => {
    setHash('#mypage');
    render(<App />);

    expect(await screen.findByTestId('page-home')).toBeInTheDocument();
    expect(screen.getByTestId('home-mypage')).toHaveTextContent('true');
    expect(screen.getByTestId('home-tab')).toHaveTextContent('home');
  });

  it('#test-adhd로 새로고침해도 검사 페이지가 그대로 뜬다', async () => {
    // 예전에는 마운트 시점의 user=null만 보고 무조건 랜딩으로 보냈던 탓에
    // 홈을 뺀 모든 주소가 새로고침에서 살아남지 못했다.
    setHash('#test-adhd');
    render(<App />);

    expect(await screen.findByTestId('page-test-adhd')).toBeInTheDocument();
    expect(currentHash()).toBe('#test-adhd');
  });

  it('모르는 해시는 랜딩으로 떨어지고 주소도 #landing으로 정리된다', async () => {
    // 로그인 상태면 랜딩→홈 자동 이동이 겹치므로 비로그인으로 본다
    prepareStores({ user: null as never, isLoading: false });
    setHash('#nope');
    render(<App />);

    expect(await screen.findByTestId('page-landing')).toBeInTheDocument();
    await waitFor(() => expect(currentHash()).toBe('#landing'));
  });

  it('앱을 쓰는 도중 모르는 해시가 들어오면 화면을 흔들지 않고 주소만 되돌린다', async () => {
    setHash('#scenario');
    render(<App />);
    await screen.findByTestId('page-home');

    await navigateBrowser('#nope');

    expect(screen.getByTestId('home-tab')).toHaveTextContent('scenario');
    await waitFor(() => expect(currentHash()).toBe('#scenario'));
  });

  it('세션 복원 중(isLoading)에는 보호 페이지를 튕기지 않고 기다린다', async () => {
    // 아직 user가 없지만 판정을 미룬다 — 여기서 랜딩으로 보내면 새로고침
    // 복원이 매번 실패한다.
    prepareStores({ user: null as never, isLoading: true });
    setHash('#diary');
    render(<App />);

    expect(screen.queryByTestId('page-landing')).not.toBeInTheDocument();
    expect(currentHash()).toBe('#diary');

    // 복원이 끝나 세션이 확정되면 그 주소 그대로 들어간다
    await act(async () => {
      useAuthStore.setState({ user: USER, isLoading: false });
    });
    expect(await screen.findByTestId('page-home')).toBeInTheDocument();
    expect(screen.getByTestId('home-tab')).toHaveTextContent('analysis');
  });
});

// ─────────────────────────────────────────────────────────
describe('주소 갱신 — 화면을 옮기면 해시가 따라온다', () => {
  it('탭을 바꾸면 #scenario·#diary로 바뀐다', async () => {
    const user = userEvent.setup();
    setHash('#home');
    render(<App />);
    await screen.findByTestId('page-home');

    await user.click(screen.getByRole('button', { name: '탭 시나리오' }));
    await waitFor(() => expect(currentHash()).toBe('#scenario'));

    await user.click(screen.getByRole('button', { name: '탭 회복일기' }));
    await waitFor(() => expect(currentHash()).toBe('#diary'));
  });

  it('마이페이지를 열면 #mypage, 닫으면 열기 직전 탭으로 돌아온다', async () => {
    const user = userEvent.setup();
    setHash('#scenario');
    render(<App />);
    await screen.findByTestId('page-home');

    await user.click(screen.getByRole('button', { name: '마이페이지 열기' }));
    await waitFor(() => expect(currentHash()).toBe('#mypage'));
    expect(screen.getByTestId('home-mypage')).toHaveTextContent('true');
    // 오버레이 아래에는 열기 직전의 탭이 그대로 깔려 있다
    expect(screen.getByTestId('home-tab')).toHaveTextContent('scenario');

    await user.click(screen.getByRole('button', { name: '마이페이지 닫기' }));
    await waitFor(() => expect(currentHash()).toBe('#scenario'));
  });

  it('엔딩을 열면 #ending, 닫으면 홈으로 나온다', async () => {
    const user = userEvent.setup();
    useScenarioStore.setState({ progress: ALL_CLEARED }); // 해금 상태
    setHash('#diary');
    render(<App />);
    await screen.findByTestId('page-home');

    await user.click(screen.getByRole('button', { name: '엔딩 열기' }));
    await waitFor(() => expect(currentHash()).toBe('#ending'));
    expect(screen.getByTestId('home-ending')).toHaveTextContent('true');

    await user.click(screen.getByRole('button', { name: '엔딩 닫기' }));
    await waitFor(() => expect(currentHash()).toBe('#home'));
  });

  it('홈 로고 → 랜딩 체류가 유지되고, 랜딩 프로필은 #mypage로 직행한다', async () => {
    const user = userEvent.setup();
    setHash('#home');
    render(<App />);
    await screen.findByTestId('page-home');

    // 로그인 상태에서도 랜딩(서비스 소개)에 머무를 수 있어야 한다 —
    // Auth 이펙트가 [user]에만 걸려 있어야 지켜지는 동작이다.
    await user.click(screen.getByRole('button', { name: '서비스 소개' }));
    expect(await screen.findByTestId('page-landing')).toBeInTheDocument();
    await waitFor(() => expect(currentHash()).toBe('#landing'));

    await user.click(screen.getByRole('button', { name: '랜딩 프로필' }));
    await waitFor(() => expect(currentHash()).toBe('#mypage'));
    expect(await screen.findByTestId('page-home')).toBeInTheDocument();
    expect(screen.getByTestId('home-mypage')).toHaveTextContent('true');
  });

  it('검사·캐릭터 생성도 각자 주소를 갖는다', async () => {
    const user = userEvent.setup();
    setHash('#home');
    render(<App />);
    await screen.findByTestId('page-home');

    await user.click(screen.getByRole('button', { name: 'ADHD 검사 시작' }));
    await waitFor(() => expect(currentHash()).toBe('#test-adhd'));
    expect(screen.getByTestId('page-test-adhd')).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────
// 시나리오 딥링크 (2026-08-27 UAT R2-06 1단계)
//
// #scenario 뒤에 영역·회차가 한 겹 더 붙는다. 여기서 고정하는 것은 App이
// 그 문자열을 **페이지 판정과 분리해** 다루는지다 — 첫 조각만 페이지로 읽고
// 나머지는 시나리오 탭에 넘긴다. 그 경로가 실제로 열리는지(해금 판정)는
// 진행도를 아는 ScenarioTab의 몫이라 여기서 보지 않는다.
describe('시나리오 딥링크 — #scenario 아래 한 겹', () => {
  it('#scenario/workplace는 튕기지 않고 하위 경로를 그대로 내려준다', async () => {
    // 예전에는 해시 전체를 페이지 이름과 대조해서 '모르는 주소'로 잡혔다.
    setHash('#scenario/workplace');
    render(<App />);

    expect(await screen.findByTestId('page-home')).toBeInTheDocument();
    expect(screen.getByTestId('home-tab')).toHaveTextContent('scenario');
    expect(screen.getByTestId('home-scenario-path')).toHaveTextContent('/workplace');
    expect(currentHash()).toBe('#scenario/workplace');
  });

  it('#scenario/workplace/3은 회차까지 살아남는다 (새로고침 복원)', async () => {
    setHash('#scenario/workplace/3');
    render(<App />);

    await screen.findByTestId('page-home');
    expect(screen.getByTestId('home-scenario-path')).toHaveTextContent('/workplace/3');
    expect(currentHash()).toBe('#scenario/workplace/3');
  });

  it('#scenario/daily/epilogue도 그대로 내려간다', async () => {
    setHash('#scenario/daily/epilogue');
    render(<App />);

    await screen.findByTestId('page-home');
    expect(screen.getByTestId('home-scenario-path')).toHaveTextContent('/daily/epilogue');
  });

  it('모양이 어긋난 하위 경로는 #scenario로 정리되고 히스토리에 쌓이지 않는다', async () => {
    const replaceSpy = vi.spyOn(window.history, 'replaceState');
    setHash('#scenario/workplace/1/2/3');
    render(<App />);

    await screen.findByTestId('page-home');
    await waitFor(() => expect(currentHash()).toBe('#scenario'));
    expect(screen.getByTestId('home-scenario-path')).toHaveTextContent('');
    expect(replaceSpy).toHaveBeenCalledWith(null, '', '#scenario');
  });

  it('앱을 쓰는 도중 들어온 어긋난 하위 경로도 그 자리에서 정리된다', async () => {
    setHash('#scenario');
    render(<App />);
    await screen.findByTestId('page-home');

    // setState만으로는 값이 그대로라 이펙트가 돌지 않는다 — 주소만 남는 자리다.
    await navigateBrowser('#scenario/workplace/nope');

    expect(screen.getByTestId('home-tab')).toHaveTextContent('scenario');
    await waitFor(() => expect(currentHash()).toBe('#scenario'));
  });

  it('시나리오 탭이 화면을 옮기면 해시가 따라 깊어진다', async () => {
    const user = userEvent.setup();
    setHash('#scenario');
    render(<App />);
    await screen.findByTestId('page-home');

    await user.click(screen.getByRole('button', { name: '영역 열기' }));
    await waitFor(() => expect(currentHash()).toBe('#scenario/workplace'));

    await user.click(screen.getByRole('button', { name: '회차 열기' }));
    await waitFor(() => expect(currentHash()).toBe('#scenario/workplace/2'));
  });

  it('플레이어를 닫으면 영역 목록 주소로 돌아오고 히스토리에 쌓이지 않는다', async () => {
    const user = userEvent.setup();
    setHash('#scenario/workplace/2');
    render(<App />);
    await screen.findByTestId('page-home');

    const replaceSpy = vi.spyOn(window.history, 'replaceState');
    await user.click(screen.getByRole('button', { name: '회차 닫기' }));

    await waitFor(() => expect(currentHash()).toBe('#scenario/workplace'));
    // push였다면 뒤로가기가 방금 닫은 플레이어를 처음부터 다시 연다.
    expect(replaceSpy).toHaveBeenCalledWith(null, '', '#scenario/workplace');
  });

  it('뒤로가기로 회차 주소를 빠져나오면 하위 경로도 함께 얕아진다', async () => {
    setHash('#scenario/workplace/2');
    render(<App />);
    await screen.findByTestId('page-home');

    await navigateBrowser('#scenario/workplace');
    expect(screen.getByTestId('home-scenario-path')).toHaveTextContent('/workplace');

    await navigateBrowser('#scenario');
    expect(screen.getByTestId('home-scenario-path')).toHaveTextContent('');
  });

  it('마이페이지를 열었다 닫으면 보고 있던 하위 경로로 돌아온다', async () => {
    // 오버레이는 시나리오 탭을 덮을 뿐 언마운트하지 않는다 — 돌아왔을 때
    // 영역 목록으로 튕기면 오버레이 한 번에 자리를 잃는다.
    const user = userEvent.setup();
    setHash('#scenario/workplace');
    render(<App />);
    await screen.findByTestId('page-home');

    await user.click(screen.getByRole('button', { name: '마이페이지 열기' }));
    await waitFor(() => expect(currentHash()).toBe('#mypage'));

    await user.click(screen.getByRole('button', { name: '마이페이지 닫기' }));
    await waitFor(() => expect(currentHash()).toBe('#scenario/workplace'));
  });

  it('다른 탭으로 옮기면 하위 경로를 버린다', async () => {
    // 탭을 옮기면 ScenarioTab이 언마운트되어 뷰가 초기화된다. 주소만 남으면
    // 돌아왔을 때 주소와 화면이 갈라진다.
    const user = userEvent.setup();
    setHash('#scenario/workplace/2');
    render(<App />);
    await screen.findByTestId('page-home');

    await user.click(screen.getByRole('button', { name: '탭 회복일기' }));
    await waitFor(() => expect(currentHash()).toBe('#diary'));

    await user.click(screen.getByRole('button', { name: '탭 시나리오' }));
    await waitFor(() => expect(currentHash()).toBe('#scenario'));
    expect(screen.getByTestId('home-scenario-path')).toHaveTextContent('');
  });

  // ── 같은 탭 다시 누르기 = 그 탭의 1뎁스로 (2026-08-27 3차 UAT R3-06) ──
  //
  // 2뎁스(에피소드 목록·유형 보고서)에서 '시나리오' 탭을 다시 눌러도 아무 일이
  // 일어나지 않았다 — 페이지가 이미 'scenario'라 setCurrentPage가 바뀌는 것이
  // 없기 때문이다. 하위 경로를 비우면 ScenarioTab의 주소→화면 동기화가 영역
  // 목록을 띄운다. 되돌림이 아니라 **빠져나오는 이동**이라 히스토리에 쌓지
  // 않는다(플레이어 닫기와 같은 규칙).
  it('시나리오 탭에서 그 탭을 다시 누르면 영역 목록으로 빠져나온다', async () => {
    const user = userEvent.setup();
    setHash('#scenario/workplace/2');
    render(<App />);
    await screen.findByTestId('page-home');

    const replaceSpy = vi.spyOn(window.history, 'replaceState');
    await user.click(screen.getByRole('button', { name: '탭 시나리오' }));

    await waitFor(() => expect(currentHash()).toBe('#scenario'));
    expect(screen.getByTestId('home-scenario-path')).toHaveTextContent('');
    expect(replaceSpy).toHaveBeenCalledWith(null, '', '#scenario');
  });

  it('이미 1뎁스면 다시 눌러도 아무 일도 없다', async () => {
    const user = userEvent.setup();
    setHash('#scenario');
    render(<App />);
    await screen.findByTestId('page-home');

    await user.click(screen.getByRole('button', { name: '탭 시나리오' }));

    await waitFor(() => expect(currentHash()).toBe('#scenario'));
    expect(screen.getByTestId('home-scenario-path')).toHaveTextContent('');
  });

  it('오버레이가 덮고 있을 때는 하위 경로를 지키며 오버레이만 닫는다', async () => {
    // 탭바가 이때는 아무 탭도 활성으로 칠하지 않는다 — 누르는 뜻이 "1뎁스로"가
    // 아니라 "그 탭으로 돌아가기"다. 보고 있던 자리를 뺏으면 안 된다.
    const user = userEvent.setup();
    setHash('#scenario/workplace');
    render(<App />);
    await screen.findByTestId('page-home');
    await user.click(screen.getByRole('button', { name: '마이페이지 열기' }));
    await waitFor(() => expect(currentHash()).toBe('#mypage'));

    await user.click(screen.getByRole('button', { name: '탭 시나리오' }));

    await waitFor(() => expect(currentHash()).toBe('#scenario/workplace'));
    expect(screen.getByTestId('home-scenario-path')).toHaveTextContent('/workplace');
  });
});

// ─────────────────────────────────────────────────────────
describe('로그인 뒤 돌아갈 자리 (딥링크 보존)', () => {
  it('로그아웃 상태로 연 #scenario/workplace/3은 로그인하면 그 주소로 이어진다', async () => {
    prepareStores({ user: null as never, isLoading: false });
    setHash('#scenario/workplace/3');
    render(<App />);

    // 세션이 없으니 일단 랜딩으로 되돌린다 (기존 가드 그대로)
    expect(await screen.findByTestId('page-landing')).toBeInTheDocument();
    await waitFor(() => expect(currentHash()).toBe('#landing'));

    await act(async () => {
      useAuthStore.setState({ user: USER, isLoading: false });
    });

    expect(await screen.findByTestId('page-home')).toBeInTheDocument();
    await waitFor(() => expect(currentHash()).toBe('#scenario/workplace/3'));
    expect(screen.getByTestId('home-scenario-path')).toHaveTextContent('/workplace/3');
  });

  it('되돌려 보낸 주소가 없으면 예전처럼 홈으로 간다', async () => {
    prepareStores({ user: null as never, isLoading: false });
    setHash('#landing');
    render(<App />);
    await screen.findByTestId('page-landing');

    await act(async () => {
      useAuthStore.setState({ user: USER, isLoading: false });
    });

    await waitFor(() => expect(currentHash()).toBe('#home'));
  });
});

// ─────────────────────────────────────────────────────────
describe('뒤로가기 — hashchange로 되돌아온다', () => {
  it('탭 이동 후 뒤로가기가 이전 탭으로 되돌린다', async () => {
    const user = userEvent.setup();
    setHash('#home');
    render(<App />);
    await screen.findByTestId('page-home');

    await user.click(screen.getByRole('button', { name: '탭 시나리오' }));
    await waitFor(() => expect(screen.getByTestId('home-tab')).toHaveTextContent('scenario'));

    await navigateBrowser('#home');
    expect(screen.getByTestId('home-tab')).toHaveTextContent('home');
  });

  it('오버레이도 뒤로가기로 닫힌다', async () => {
    const user = userEvent.setup();
    setHash('#home');
    render(<App />);
    await screen.findByTestId('page-home');

    await user.click(screen.getByRole('button', { name: '마이페이지 열기' }));
    await waitFor(() => expect(screen.getByTestId('home-mypage')).toHaveTextContent('true'));

    await navigateBrowser('#home');
    expect(screen.getByTestId('home-mypage')).toHaveTextContent('false');
  });

  it('페이지 밖(검사)에서 뒤로가기하면 홈 셸로 돌아온다', async () => {
    setHash('#test-adhd');
    render(<App />);
    await screen.findByTestId('page-test-adhd');

    await navigateBrowser('#scenario');
    expect(await screen.findByTestId('page-home')).toBeInTheDocument();
    expect(screen.getByTestId('home-tab')).toHaveTextContent('scenario');
  });
});

// ─────────────────────────────────────────────────────────
describe('가드 — 못 들어가는 주소는 가장 가까운 안전한 페이지로', () => {
  it('로그인 없이 #diary로 들어오면 랜딩으로 되돌린다', async () => {
    prepareStores({ user: null as never, isLoading: false });
    setHash('#diary');
    render(<App />);

    expect(await screen.findByTestId('page-landing')).toBeInTheDocument();
    await waitFor(() => expect(currentHash()).toBe('#landing'));
  });

  it('로그인 없이 #signup은 막지 않는다 (미인증 계정은 user가 비어 있다)', async () => {
    prepareStores({ user: null as never, isLoading: false });
    setHash('#signup');
    render(<App />);

    expect(await screen.findByTestId('page-signup')).toBeInTheDocument();
    expect(currentHash()).toBe('#signup');
  });

  it('해금 전 #ending은 홈으로 되돌린다 (결말 미리보기 차단)', async () => {
    // 4영역 완주가 해금 조건 — 진행도가 비어 있으므로 잠김이다.
    setHash('#ending');
    render(<App />);

    await waitFor(() => expect(currentHash()).toBe('#home'));
    expect(screen.getByTestId('home-ending')).toHaveTextContent('false');
  });

  it('완주한 계정의 #ending은 그대로 열린다', async () => {
    useScenarioStore.setState({ progress: ALL_CLEARED });
    setHash('#ending');
    render(<App />);

    expect(await screen.findByTestId('page-home')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('home-ending')).toHaveTextContent('true'));
    expect(currentHash()).toBe('#ending');
  });

  it('캐릭터가 있으면 #character-creation은 홈으로 되돌린다 (덮어쓰기 방지)', async () => {
    setHash('#character-creation');
    render(<App />);

    await waitFor(() => expect(currentHash()).toBe('#home'));
    expect(screen.queryByTestId('page-character-creation')).not.toBeInTheDocument();
  });

  it('캐릭터가 없으면 #test-adhd는 홈으로 되돌린다', async () => {
    prepareStores({ character: null as never });
    setHash('#test-adhd');
    render(<App />);

    await waitFor(() => expect(currentHash()).toBe('#home'));
    expect(screen.queryByTestId('page-test-adhd')).not.toBeInTheDocument();
  });

  it('로그아웃하면 보호 페이지에서 랜딩으로 나온다', async () => {
    setHash('#mypage');
    render(<App />);
    await screen.findByTestId('page-home');

    await act(async () => {
      useAuthStore.setState({ user: null as never, isLoading: false });
    });

    expect(await screen.findByTestId('page-landing')).toBeInTheDocument();
    await waitFor(() => expect(currentHash()).toBe('#landing'));
  });

  it('가드의 되돌림은 히스토리에 쌓이지 않는다 (뒤로가기 왕복 방지)', async () => {
    const replaceSpy = vi.spyOn(window.history, 'replaceState');
    setHash('#ending');
    render(<App />);

    await waitFor(() => expect(currentHash()).toBe('#home'));
    // push였다면 뒤로가기가 #ending으로 돌아가고 가드가 다시 밀어내 갇힌다
    expect(replaceSpy).toHaveBeenCalledWith(null, '', '#home');
  });

  it('해시 없이 들어온 첫 진입도 히스토리를 늘리지 않고 #landing으로 정규화한다', async () => {
    prepareStores({ user: null as never, isLoading: false });
    const replaceSpy = vi.spyOn(window.history, 'replaceState');
    render(<App />);

    expect(await screen.findByTestId('page-landing')).toBeInTheDocument();
    await waitFor(() => expect(currentHash()).toBe('#landing'));
    // push였다면 뒤로가기 한 번이 같은 화면에 낭비돼 앱을 빠져나가지 못한다
    expect(replaceSpy).toHaveBeenCalledWith(null, '', '#landing');
  });
});

// ─────────────────────────────────────────────────────────
// 복귀 재조회 (다중 기기 동기화 완화, N-5)
//
// 저장소에 onSnapshot이 없어 기기 간 전파가 없다. 기기 B에서 초기화한 계정을
// 기기 A가 옛 진행도로 덮어써 되살린 실측 사고가 있었다
// (docs/qa/2026-08-12-uat-remaining-issues.md §2 N-5). 실시간 구독 대신 합의된
// 저비용 처방이 "창으로 돌아왔을 때 다시 읽기"이며, 여기서 고정하는 계약은 넷이다:
//
//   1) **복귀 시 호출** — visibilitychange(보이는 쪽)·focus에서 기존 fetch 셋
//   2) **스로틀** — 30초 안의 재복귀는 읽지 않는다 (읽기 폭탄 방지)
//   3) **진행 중 스킵** — 플레이어·모달이 떠 있거나 검사 화면이면 건드리지 않는다
//   4) **무음** — 재조회가 로딩 스피너를 켜지 않는다 (화면 깜빡임 방지)
describe('복귀 재조회 — 다중 기기 동기화 완화 (N-5)', () => {
  // Date.now를 손으로 돌린다. 스로틀이 시계 기반이라 타이머를 가짜로 바꾸는
  // 것보다 이쪽이 RTL(waitFor의 실제 타이머)과 덜 부딪힌다.
  let clock = 0;
  const advance = (ms: number) => {
    clock += ms;
  };

  beforeEach(() => {
    clock = Date.now();
    vi.spyOn(Date, 'now').mockImplementation(() => clock);
  });

  /** 세 fetch 액션(+테마)을 스파이로 바꾼다. 반드시 render 전에 부를 것. */
  function spyFetches() {
    const fetchCharacter = vi.fn(async () => {});
    const fetchTestResults = vi.fn(async () => {});
    const fetchProgress = vi.fn(async () => {});
    const fetchThemes = vi.fn(async () => {});
    useCharacterStore.setState({ fetchCharacter });
    useTestStore.setState({ fetchTestResults });
    useScenarioStore.setState({ fetchProgress, fetchThemes });
    return { fetchCharacter, fetchTestResults, fetchProgress, fetchThemes };
  }

  const fireFocus = () => act(() => void window.dispatchEvent(new Event('focus')));
  const fireVisibility = () =>
    act(() => void document.dispatchEvent(new Event('visibilitychange')));

  /** jsdom의 visibilityState는 읽기 전용이라 own 프로퍼티로 잠깐 가린다. */
  function setVisibility(state: 'visible' | 'hidden') {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => state,
    });
  }
  function restoreVisibility() {
    delete (document as unknown as Record<string, unknown>).visibilityState;
  }

  async function mountHome() {
    setHash('#home');
    render(<App />);
    await screen.findByTestId('page-home');
  }

  afterEach(() => {
    restoreVisibility();
    document.getElementById('app-modal-root')?.replaceChildren();
  });

  it('창으로 돌아오면 캐릭터·검사 결과·진행도를 기존 fetch 액션으로 다시 읽는다', async () => {
    const spies = spyFetches();
    await mountHome();

    advance(RESYNC_THROTTLE_MS + 1);
    await fireFocus();

    expect(spies.fetchCharacter).toHaveBeenCalledWith('uid-1');
    expect(spies.fetchTestResults).toHaveBeenCalledWith('uid-1');
    expect(spies.fetchProgress).toHaveBeenCalledWith('uid-1');

    // fetchThemes는 **일부러 부르지 않는다.** 테마 재배치는 EpisodeData 객체를
    // 갈아 치우고, useEpisodePlayer가 그것을 "다른 에피소드"로 읽어 플레이
    // 중인 진행을 처음으로 되감는다. 배치 갱신이 필요한 화면은 이미
    // stressResult.resultType을 구독하고 있어 스스로 부른다.
    expect(spies.fetchThemes).not.toHaveBeenCalled();
  });

  it('탭이 다시 보이는 순간(visibilitychange)도 같은 재조회를 건다', async () => {
    const spies = spyFetches();
    await mountHome();

    advance(RESYNC_THROTTLE_MS + 1);
    setVisibility('visible');
    await fireVisibility();

    expect(spies.fetchProgress).toHaveBeenCalledTimes(1);
  });

  it('탭이 숨겨질 때 오는 visibilitychange는 무시한다', async () => {
    const spies = spyFetches();
    await mountHome();

    advance(RESYNC_THROTTLE_MS + 1);
    setVisibility('hidden');
    await fireVisibility();
    expect(spies.fetchProgress).not.toHaveBeenCalled();

    // 같은 리스너가 살아 있다는 확인 — 다시 보이면 그때 읽는다
    setVisibility('visible');
    await fireVisibility();
    expect(spies.fetchProgress).toHaveBeenCalledTimes(1);
  });

  it('로그인 직후의 첫 복귀는 읽지 않는다 (마운트 이펙트가 이미 읽었다)', async () => {
    const spies = spyFetches();
    await mountHome();

    await fireFocus();

    expect(spies.fetchCharacter).not.toHaveBeenCalled();
  });

  it('스로틀 — 30초 안에 다시 돌아오면 읽지 않고, 넘기면 다시 읽는다', async () => {
    const spies = spyFetches();
    await mountHome();

    advance(RESYNC_THROTTLE_MS + 1);
    await fireFocus();
    expect(spies.fetchProgress).toHaveBeenCalledTimes(1);

    // 탭을 반사적으로 오가는 구간 — 같은 문서를 다시 읽을 이유가 없다
    advance(10_000);
    await fireFocus();
    expect(spies.fetchProgress).toHaveBeenCalledTimes(1);

    advance(RESYNC_THROTTLE_MS);
    await fireFocus();
    expect(spies.fetchProgress).toHaveBeenCalledTimes(2);
  });

  it('복귀 한 번에 함께 오는 visibilitychange + focus는 한 번으로 접힌다', async () => {
    // 브라우저는 탭 복귀에 두 이벤트를 **모두** 쏜다. 스로틀이 없으면 복귀
    // 한 번이 users/{uid} 읽기 6회가 된다.
    const spies = spyFetches();
    await mountHome();

    advance(RESYNC_THROTTLE_MS + 1);
    setVisibility('visible');
    await fireVisibility();
    await fireFocus();

    expect(spies.fetchCharacter).toHaveBeenCalledTimes(1);
    expect(spies.fetchTestResults).toHaveBeenCalledTimes(1);
    expect(spies.fetchProgress).toHaveBeenCalledTimes(1);
  });

  it('플레이어·모달이 떠 있으면 건너뛰고, 스로틀도 소모하지 않는다', async () => {
    // 에피소드 플레이어는 #app-modal-root로 포털 렌더링되는 풀스크린
    // 레이어다. 플레이 중 재조회가 들어가면 진행 상태를 밟을 위험이 있다.
    const spies = spyFetches();
    await mountHome();

    const modalRoot = document.getElementById('app-modal-root');
    expect(modalRoot).not.toBeNull();
    modalRoot!.appendChild(document.createElement('div'));

    advance(RESYNC_THROTTLE_MS + 1);
    await fireFocus();
    expect(spies.fetchProgress).not.toHaveBeenCalled();

    // 레이어를 닫고 다시 돌아오면 — 건너뛴 회차가 스로틀을 먹지 않았으므로
    // 곧바로 읽는다 (플레이를 마치고 나온 직후가 가장 최신값이 필요한 때다).
    modalRoot!.replaceChildren();
    await fireFocus();
    expect(spies.fetchProgress).toHaveBeenCalledTimes(1);
  });

  it('검사 진행 중(#test-adhd)에는 건너뛴다', async () => {
    const spies = spyFetches();
    setHash('#test-adhd');
    render(<App />);
    await screen.findByTestId('page-test-adhd');

    advance(RESYNC_THROTTLE_MS + 1);
    await fireFocus();
    expect(spies.fetchTestResults).not.toHaveBeenCalled();

    // 검사를 마치고 홈으로 나오면 그때 읽는다 (리스너가 죽은 게 아니다)
    await navigateBrowser('#home');
    await fireFocus();
    expect(spies.fetchTestResults).toHaveBeenCalledTimes(1);
  });

  it('재조회는 로딩 스피너를 켜지 않는다 (화면 깜빡임 방지)', async () => {
    // 세 액션 모두 첫 줄에서 isLoading=true를 세운다. 그대로 두면 복귀할
    // 때마다 홈 여정 카드와 시나리오·회복일기 목록이 스피너로 덮인다.
    let releaseCharacter = () => {};
    const gate = new Promise<void>((resolve) => {
      releaseCharacter = resolve;
    });
    const fetchCharacter = vi.fn(() => {
      useCharacterStore.setState({ isLoading: true }); // 실제 액션과 같은 동기 시작
      return gate;
    });
    useCharacterStore.setState({ fetchCharacter, isLoading: false });
    useTestStore.setState({ fetchTestResults: async () => {} });
    useScenarioStore.setState({ fetchProgress: async () => {}, fetchThemes: async () => {} });

    await mountHome();
    advance(RESYNC_THROTTLE_MS + 1);
    await fireFocus();

    expect(fetchCharacter).toHaveBeenCalledTimes(1);
    expect(useCharacterStore.getState().isLoading).toBe(false);

    await act(async () => {
      releaseCharacter();
      await gate;
    });
  });

  it('이미 로딩 중이던 조회의 스피너까지 꺼 버리지는 않는다', async () => {
    const spies = spyFetches();
    await mountHome();

    // 다른 화면이 진짜 로딩을 걸어 둔 상태
    act(() => useScenarioStore.setState({ isLoading: true }));

    advance(RESYNC_THROTTLE_MS + 1);
    await fireFocus();

    expect(spies.fetchProgress).toHaveBeenCalledTimes(1);
    expect(useScenarioStore.getState().isLoading).toBe(true);
  });

  it('로그아웃하면 복귀해도 읽지 않는다', async () => {
    const spies = spyFetches();
    await mountHome();

    await act(async () => {
      useAuthStore.setState({ user: null as never, isLoading: false });
    });

    advance(RESYNC_THROTTLE_MS + 1);
    await fireFocus();

    expect(spies.fetchCharacter).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────
describe('비로그인으로 보호 주소를 열면 — 튕긴 이유를 한 줄 알린다', () => {
  it('#mypage로 직접 들어오면 랜딩 위에 로그인 안내 토스트가 뜬다', async () => {
    prepareStores({ user: null as never, isLoading: false });
    setHash('#mypage');
    render(<App />);

    expect(await screen.findByTestId('page-landing')).toBeInTheDocument();
    expect(await screen.findByRole('status', { name: '로그인 안내' })).toHaveTextContent(
      '로그인이 필요한 화면이에요',
    );
  });

  it('쓰던 중 로그아웃해서 랜딩으로 온 것은 알리지 않는다', async () => {
    setHash('#mypage');
    render(<App />);
    await screen.findByTestId('page-home');

    await act(async () => {
      useAuthStore.setState({ user: null, isLoading: false });
    });

    expect(await screen.findByTestId('page-landing')).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: '로그인 안내' })).not.toBeInTheDocument();
  });

  it('랜딩·로그인처럼 공개 주소로 들어오면 토스트가 없다', async () => {
    prepareStores({ user: null as never, isLoading: false });
    setHash('#landing');
    render(<App />);
    await screen.findByTestId('page-landing');
    expect(screen.queryByRole('status', { name: '로그인 안내' })).not.toBeInTheDocument();
  });
});
