// src/components/home/ScenarioTab.test.tsx
// @vitest-environment jsdom
//
// 시나리오 탭의 두 계약: **딥링크**(R2-06)와 **영역 완주 흐름**(R2-25·R2-28).
//
// ── 딥링크 (2026-08-27 UAT R2-06 1단계) ──
//
// App은 `#scenario` 뒤의 문자열을 넘겨줄 뿐이고, 그 경로가 **실제로 열리는지**
// 판정하는 것은 진행도를 아는 이 탭이다. 여기서 고정하는 계약은 셋이다:
//
//   1) 주소 → 화면 : 하위 경로로 들어오면 그 화면이 곧바로 뜬다.
//   2) 화면 → 주소 : 앱 안에서 옮기면 주소가 따라온다(플레이어를 닫으면
//                    영역 목록 주소로 돌아온다).
//   3) 잠금       : 잠긴 회차·해금 전 에필로그·없는 영역은 조용히 그 영역의
//                    목록(없으면 영역 목록)으로 떨어지고, **주소도 함께**
//                    정정된다. 화면만 고치면 주소가 거짓말을 한다.
//
// 플레이어 두 종류는 스텁이다. 여기서 볼 것은 "무엇이 열렸나"이지 플레이어의
// 내용이 아니고, 실물은 에셋·타이머를 끌고 와 라우팅과 무관한 이유로 깨진다.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { useState } from 'react';

vi.hoisted(() => {
  const map = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    clear: () => map.clear(),
  });
});

vi.mock('../../api/env', () => ({ IS_MOCK_MODE: true }));
vi.mock('../../api/firebase', () => ({
  db: {},
  auth: { currentUser: null },
  signInWithGoogle: vi.fn(),
  signOutUser: vi.fn(),
  syncUserToFirestore: vi.fn(),
  deleteUserDoc: vi.fn(),
}));

vi.mock('../scenario/VisualNovelPlayer', () => ({
  default: ({ episode, onExit, onNext }: any) => (
    <div data-testid="player">
      <span data-testid="player-episode">{episode.id}</span>
      <button onClick={() => onExit(false)}>플레이어 닫기</button>
      {/* 완주 흐름을 몰기 위한 두 출구. 실물에서는 완료 시트의 '마지막
          에피소드 마치기'(onNext)와 완료 후 ✕(onExit didComplete)다. */}
      <button onClick={() => onNext(true)}>에피소드 마치기</button>
      <button onClick={() => onExit(true)}>마치고 나가기</button>
    </div>
  ),
}));
vi.mock('../scenario/EpiloguePlayer', () => ({
  default: ({ themeId, onExit, onComplete }: any) => (
    <div data-testid="epilogue-player">
      <span data-testid="epilogue-theme">{themeId}</span>
      <button onClick={onExit}>에필로그 닫기</button>
      <button onClick={onComplete}>에필로그 끝까지 읽기</button>
    </div>
  ),
}));
// 보고서도 스텁이다 — 여기서 볼 것은 "열렸나"이지 보고서의 내용이 아니고,
// 실물은 검사 결과·집계를 끌고 와 라우팅과 무관한 이유로 깨진다.
vi.mock('../scenario/TypeReportView', () => ({
  default: ({ themeId, onClose }: any) => (
    <div data-testid="type-report">
      <span data-testid="report-theme">{themeId}</span>
      <button onClick={onClose}>보고서 닫기</button>
    </div>
  ),
}));

import ScenarioTab from './ScenarioTab';
import { COPY } from '../../constants/copy';
import { useAuthStore } from '../../store/useAuthStore';
import { useCharacterStore } from '../../store/useCharacterStore';
import { useScenarioStore } from '../../store/useScenarioStore';
import { useTestStore } from '../../store/useTestStore';
import type { EpisodeData, ThemeCategory } from '../../api/scenarioMockData';
import type { ScenarioProgressMap } from '../../store/useScenarioStore';
import type { DebugUnlockMode } from '../../utils/debugProgress';

// ── 픽스처 ──

const angel = (name: string) => ({
  name,
  strategy: `${name} 전략`,
  detail: `${name} 상세`,
  feedback: `${name} 피드백`,
});

function makeEpisode(themeId: string, index: number): EpisodeData {
  const number = index + 1;
  return {
    id: `${themeId}-ep${number}`,
    episodeNumber: number,
    title: `${themeId} ${number}화`,
    summary: '백설은 회의실에 앉아 있다. 마음이 무겁다.',
    scenario: {
      no: String(number),
      domain: `${themeId}${number}`,
      reactionType: '인지',
      title: `${themeId} ${number}화`,
      scenes: [{ type: '', text: '본문', bg: 'office.png', chars: [] }],
    },
    angels: { accept: angel('아코'), reappraisal: angel('포코'), refocus: angel('리프') },
    reasons: { helpful: ['도움'], unhelpful: ['모름'] },
  };
}

function makeTheme(id: string, title: string, withEpilogue = false): ThemeCategory {
  return {
    id,
    title,
    description: `${title} 설명`,
    icon: 'work',
    episodes: Array.from({ length: 10 }, (_, i) => makeEpisode(id, i)),
    epilogue: withEpilogue
      ? ({
          themeTitle: title,
          title: `${title} 에필로그`,
          scenes: [{ type: '', text: '마무리', bg: 'office.png', chars: [] }],
        } as never)
      : undefined,
  };
}

const THEMES = [
  makeTheme('workplace', '직장'),
  makeTheme('job-prep', '취업준비'),
  makeTheme('relationship', '연인'),
  makeTheme('daily', '일상', true),
];

function clearedProgress(ids: string[]): ScenarioProgressMap {
  return Object.fromEntries(
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
}

// ── 하네스 ──
//
// App이 하는 일(하위 경로를 상태로 들고 있다가 되돌려 주기)만 흉내 낸다.
// 진짜 window.location은 건드리지 않는다 — 이 파일이 검증할 것은 주소
// 문자열의 왕복이지 브라우저 히스토리가 아니다(그쪽은 App.routing.test).
function Harness({
  initialPath = '',
  onGoTab,
  onReportOpenChange,
  debugMode,
}: {
  initialPath?: string;
  onGoTab?: (tab: 'home' | 'scenario' | 'analysis' | 'mypage') => void;
  onReportOpenChange?: (open: boolean) => void;
  debugMode?: DebugUnlockMode;
}) {
  const [path, setPath] = useState(initialPath);
  return (
    <>
      <span data-testid="path">{path}</span>
      {/* 하단 '시나리오' 탭 재탭이 App에서 하는 일 — 하위 경로를 비운다
          (R3-06). 탭바 자체는 이 컴포넌트 밖에 있으므로 결과만 흉내 낸다. */}
      <button onClick={() => setPath('')}>시나리오 탭 다시 누르기</button>
      <ScenarioTab
        onGoHome={() => {}}
        onGoTab={onGoTab}
        scenarioPath={path}
        onScenarioPathChange={(next) => setPath(next)}
        onReportOpenChange={onReportOpenChange}
        debugMode={debugMode}
      />
      <div id="app-modal-root" />
    </>
  );
}

const pristine = {
  auth: useAuthStore.getState(),
  character: useCharacterStore.getState(),
  scenario: useScenarioStore.getState(),
  test: useTestStore.getState(),
};

function prepare(
  progress: ScenarioProgressMap = {},
  // 완주 마무리 분기가 1순위로 보는 영속 기록. null이면 런타임 판정으로 떨어진다.
  seenReports: string[] | null = null
) {
  useAuthStore.setState({ user: { uid: 'uid-1', email: 't@t.test' } as never });
  useCharacterStore.setState({
    character: { nickname: '테스터', gender: 'female' } as never,
  });
  useScenarioStore.setState({
    themes: THEMES,
    progress,
    seenReports,
    themesCycleKey: 'cognitive',
    isLoading: false,
    isThemesLoading: false,
    fetchThemes: async () => {},
    fetchProgress: async () => {},
    markReportSeen: async () => true,
  });
  // 검사 게이트 통과 (둘 다 있어야 시나리오가 열린다)
  useTestStore.setState({
    adhdResult: { score: 10 } as never,
    stressResult: { resultType: 'cognitive' } as never,
  });
}

beforeEach(() => prepare());
afterEach(() => {
  cleanup();
  useAuthStore.setState(pristine.auth);
  useCharacterStore.setState(pristine.character);
  useScenarioStore.setState(pristine.scenario);
  useTestStore.setState(pristine.test);
});

const path = () => screen.getByTestId('path').textContent;

// ─────────────────────────────────────────────────────────
describe('주소 → 화면', () => {
  it('빈 경로는 영역 목록이다', async () => {
    render(<Harness />);
    expect(await screen.findByRole('heading', { name: '직장' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '일상' })).toBeInTheDocument();
  });

  it('/workplace는 그 영역의 에피소드 목록을 연다', async () => {
    render(<Harness initialPath="/workplace" />);

    // 2뎁스 헤더에는 영역 제목과 뒤로가기가 함께 선다
    expect(await screen.findByRole('button', { name: '뒤로가기' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '직장' })).toBeInTheDocument();
    expect(path()).toBe('/workplace');
  });

  it('/workplace/1은 1화 플레이어를 처음부터 연다', async () => {
    render(<Harness initialPath="/workplace/1" />);

    expect(await screen.findByTestId('player')).toBeInTheDocument();
    expect(screen.getByTestId('player-episode')).toHaveTextContent('workplace-ep1');
    expect(path()).toBe('/workplace/1');
  });

  it('앞 회차를 마쳤으면 그 다음 회차 주소도 열린다', async () => {
    prepare(clearedProgress(['workplace-ep1', 'workplace-ep2']));
    render(<Harness initialPath="/workplace/3" />);

    expect(await screen.findByTestId('player')).toBeInTheDocument();
    expect(screen.getByTestId('player-episode')).toHaveTextContent('workplace-ep3');
  });

  it('영역을 완주했으면 /daily/epilogue가 열린다', async () => {
    prepare(clearedProgress(THEMES[3].episodes.map((e) => e.id)));
    render(<Harness initialPath="/daily/epilogue" />);

    expect(await screen.findByTestId('epilogue-player')).toBeInTheDocument();
    expect(screen.getByTestId('epilogue-theme')).toHaveTextContent('daily');
  });
});

// ─────────────────────────────────────────────────────────
describe('잠금 — 주소로도 건너뛸 수 없다', () => {
  it('잠긴 회차(/daily/9)는 그 영역의 목록으로 떨어지고 주소도 정정된다', async () => {
    render(<Harness initialPath="/daily/9" />);

    expect(await screen.findByRole('button', { name: '뒤로가기' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '일상' })).toBeInTheDocument();
    expect(screen.queryByTestId('player')).not.toBeInTheDocument();
    await waitFor(() => expect(path()).toBe('/daily'));
  });

  it('없는 회차(/workplace/99)도 목록으로 떨어진다', async () => {
    render(<Harness initialPath="/workplace/99" />);

    expect(await screen.findByRole('button', { name: '뒤로가기' })).toBeInTheDocument();
    await waitFor(() => expect(path()).toBe('/workplace'));
  });

  it('해금 전 에필로그는 목록으로 떨어진다', async () => {
    render(<Harness initialPath="/daily/epilogue" />);

    expect(await screen.findByRole('button', { name: '뒤로가기' })).toBeInTheDocument();
    expect(screen.queryByTestId('epilogue-player')).not.toBeInTheDocument();
    await waitFor(() => expect(path()).toBe('/daily'));
  });

  it('원고가 없는 영역의 에필로그 주소도 목록으로 떨어진다', async () => {
    // workplace에는 epilogue가 없다 — 완주해도 열 것이 없다.
    prepare(clearedProgress(THEMES[0].episodes.map((e) => e.id)));
    render(<Harness initialPath="/workplace/epilogue" />);

    expect(await screen.findByRole('button', { name: '뒤로가기' })).toBeInTheDocument();
    await waitFor(() => expect(path()).toBe('/workplace'));
  });

  it('모르는 영역 id는 영역 목록으로 떨어진다', async () => {
    render(<Harness initialPath="/nope" />);

    expect(await screen.findByRole('heading', { name: '직장' })).toBeInTheDocument();
    await waitFor(() => expect(path()).toBe(''));
  });
});

// ─────────────────────────────────────────────────────────
describe('화면 → 주소', () => {
  it('영역을 고르면 주소가 그 영역으로 깊어진다', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await screen.findByRole('heading', { name: '직장' });

    await user.click(screen.getByRole('heading', { name: '직장' }));
    await waitFor(() => expect(path()).toBe('/workplace'));
  });

  it('목록에서 뒤로가면 주소가 다시 얕아진다', async () => {
    const user = userEvent.setup();
    render(<Harness initialPath="/workplace" />);
    await screen.findByRole('button', { name: '뒤로가기' });

    await user.click(screen.getByRole('button', { name: '뒤로가기' }));
    await waitFor(() => expect(path()).toBe(''));
  });

  it('플레이어를 닫으면 그 영역의 목록 주소로 돌아온다', async () => {
    const user = userEvent.setup();
    render(<Harness initialPath="/workplace/1" />);
    await screen.findByTestId('player');

    await user.click(screen.getByRole('button', { name: '플레이어 닫기' }));

    await waitFor(() => expect(path()).toBe('/workplace'));
    expect(screen.queryByTestId('player')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '뒤로가기' })).toBeInTheDocument();
  });

  it('에필로그를 닫아도 그 영역의 목록 주소로 돌아온다', async () => {
    const user = userEvent.setup();
    prepare(clearedProgress(THEMES[3].episodes.map((e) => e.id)));
    render(<Harness initialPath="/daily/epilogue" />);
    await screen.findByTestId('epilogue-player');

    await user.click(screen.getByRole('button', { name: '에필로그 닫기' }));
    await waitFor(() => expect(path()).toBe('/daily'));
  });
});

// ─────────────────────────────────────────────────────────
// 영역 완주 흐름 (2026-08-27 UAT R2-25 · R2-28 · R3-08)
//
//   10편 완료 → 목록 + [에필로그가 열렸어요] → (보러가기: 에필로그 · 나중에: 곧바로)
//             → [회복일기 기록 완성] → 유형 보고서(최초 1회) → 회복일기 탭
//
// ⚠️ **기존 완료 분기 테스트를 갈아 끼운 자리다.** 예전 계약은 "10편째를
// 마치면 곧바로 보고서(최초 1회) 또는 회복일기 모달"이었다. 그 흐름이
// 에필로그를 건너뛰게 만들어서(UAT 지적) 안내를 한 칸씩 뒤로 밀었다 —
// 깨지는 것이 목적인 의도된 변경이며, 회귀가 아니다.
describe('영역 완주 — 10편 뒤에는 에필로그가 먼저다 (R2-25)', () => {
  /** 마지막 회차 직전까지 진행된 상태. 10편째만 남는다. */
  const nineCleared = (themeIndex: number) =>
    clearedProgress(THEMES[themeIndex].episodes.slice(0, 9).map((e) => e.id));

  it('10편째를 마치면 목록으로 돌아가며 에필로그 안내가 뜬다', async () => {
    const user = userEvent.setup();
    prepare(nineCleared(3));
    render(<Harness initialPath="/daily/10" />);
    await screen.findByTestId('player');

    await user.click(screen.getByRole('button', { name: '에피소드 마치기' }));

    // 안내는 목록 위에 뜬다 — 보고서도 회복일기도 아직이다.
    expect(
      screen.getByText(COPY.scenario.epilogueUnlockTitle('일상'))
    ).toBeInTheDocument();
    expect(screen.queryByTestId('type-report')).not.toBeInTheDocument();
    expect(screen.queryByTestId('player')).not.toBeInTheDocument();
    await waitFor(() => expect(path()).toBe('/daily'));
  });

  it('완료 뒤 ✕로 나가도 같은 안내로 합류한다', async () => {
    const user = userEvent.setup();
    prepare(nineCleared(3));
    render(<Harness initialPath="/daily/10" />);
    await screen.findByTestId('player');

    await user.click(screen.getByRole('button', { name: '마치고 나가기' }));

    expect(
      screen.getByText(COPY.scenario.epilogueUnlockTitle('일상'))
    ).toBeInTheDocument();
  });

  it("'에필로그 보러가기'가 에필로그를 연다 — 주소도 따라온다", async () => {
    const user = userEvent.setup();
    prepare(nineCleared(3));
    render(<Harness initialPath="/daily/10" />);
    await screen.findByTestId('player');
    await user.click(screen.getByRole('button', { name: '에피소드 마치기' }));

    await user.click(
      screen.getByRole('button', { name: COPY.scenario.epilogueUnlockCta })
    );

    // ⚠️ 10편째의 저장은 플레이어(스텁)가 하지 않으므로 진행도는 9/10에 머문다.
    // 그래도 열려야 한다 — 이 CTA는 완주를 다시 검사하지 않기 때문이다.
    // 재검사하면 실제 앱에서도 저장이 스토어에 닿기 전 한 순간에 걸려 아무
    // 일도 일어나지 않는다.
    expect(screen.getByTestId('epilogue-player')).toBeInTheDocument();
    expect(screen.getByTestId('epilogue-theme')).toHaveTextContent('daily');
    await waitFor(() => expect(path()).toBe('/daily/epilogue'));
  });

  // ⚠️ 2026-08-27 3차 UAT(R3-08)로 계약이 바뀐 자리다. 예전에는 '나중에
  // 볼게요'가 정말 아무것도 하지 않아서, 그 길로 나간 사용자는 회복일기가
  // 열렸다는 안내를 **영영** 못 봤고 첫 영역이면 유형 보고서 입구까지 잃었다.
  // 미루는 것은 에필로그이지 영역을 마쳤다는 사실이 아니다.
  it("'나중에 볼게요'는 에필로그만 미루고 회복일기 안내로 간다", async () => {
    const user = userEvent.setup();
    prepare(nineCleared(3));
    render(<Harness initialPath="/daily/10" />);
    await screen.findByTestId('player');
    await user.click(screen.getByRole('button', { name: '에피소드 마치기' }));

    await user.click(
      screen.getByRole('button', { name: COPY.scenario.epilogueUnlockLater })
    );

    expect(
      screen.queryByText(COPY.scenario.epilogueUnlockTitle('일상'))
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('epilogue-player')).not.toBeInTheDocument();
    // 에필로그는 열지 않은 채 마무리 안내만 뜬다 — 뒤는 목록 그대로다.
    expect(screen.getByText(COPY.scenario.diaryUnlockTitle('일상'))).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '일상' })).toBeInTheDocument();
    expect(path()).toBe('/daily');
  });

  it('원고가 없는 영역은 중간 매듭을 건너뛰고 회복일기 안내로 간다', async () => {
    // workplace에는 에필로그가 없다 — 열어 줄 것이 없으므로 예전 흐름 그대로다.
    const user = userEvent.setup();
    prepare(nineCleared(0));
    render(<Harness initialPath="/workplace/10" />);
    await screen.findByTestId('player');

    await user.click(screen.getByRole('button', { name: '에피소드 마치기' }));

    expect(screen.getByText(COPY.scenario.diaryUnlockTitle('직장'))).toBeInTheDocument();
    expect(
      screen.queryByText(COPY.scenario.epilogueUnlockTitle('직장'))
    ).not.toBeInTheDocument();
  });
});

describe('영역 완주 — 에필로그 뒤에 회복일기 안내 (R2-28 · R3-08)', () => {
  const nineCleared = () =>
    clearedProgress(THEMES[3].episodes.slice(0, 9).map((e) => e.id));
  const dailyCleared = () => clearedProgress(THEMES[3].episodes.map((e) => e.id));

  /**
   * 10편째를 마치고 **에필로그까지 연** 상태로 몰고 간다.
   *
   * 딥링크(/daily/epilogue)로 바로 들어가지 않는 것이 R3-08의 핵심이다 —
   * 마무리 안내는 "이 영역을 방금 끝냈다"는 사실에 붙는 것이지 에필로그를
   * 읽었다는 사실에 붙는 것이 아니다. 목록 카드로 다시 읽는 경우와 구분되어야
   * 하므로, 이 흐름을 실제로 밟아 온 테스트만 안내를 기대할 수 있다.
   */
  const finishAndOpenEpilogue = async (user: ReturnType<typeof userEvent.setup>) => {
    await screen.findByTestId('player');
    await user.click(screen.getByRole('button', { name: '에피소드 마치기' }));
    await user.click(screen.getByRole('button', { name: COPY.scenario.epilogueUnlockCta }));
    await screen.findByTestId('epilogue-player');
  };

  it('에필로그를 끝까지 읽으면 회복일기 안내가 뜬다', async () => {
    const user = userEvent.setup();
    prepare(nineCleared());
    render(<Harness initialPath="/daily/10" />);
    await finishAndOpenEpilogue(user);

    await user.click(screen.getByRole('button', { name: '에필로그 끝까지 읽기' }));

    expect(screen.getByText(COPY.scenario.diaryUnlockTitle('일상'))).toBeInTheDocument();
    // 마지막 장면은 모달 뒤에 그대로 남는다.
    expect(screen.getByTestId('epilogue-player')).toBeInTheDocument();
  });

  it('최초 완주 영역이면 안내의 CTA가 유형 보고서를 연다', async () => {
    const user = userEvent.setup();
    prepare(nineCleared(), []); // 아직 어떤 보고서도 본 적이 없다
    render(<Harness initialPath="/daily/10" />);
    await finishAndOpenEpilogue(user);
    await user.click(screen.getByRole('button', { name: '에필로그 끝까지 읽기' }));

    await user.click(
      screen.getByRole('button', { name: COPY.scenario.diaryUnlockCta })
    );

    expect(screen.getByTestId('type-report')).toBeInTheDocument();
    expect(screen.getByTestId('report-theme')).toHaveTextContent('daily');
  });

  it('보고서를 닫으면 회복일기 탭으로 넘어간다 — 안내가 두 번 뜨지 않는다', async () => {
    const goTab = vi.fn();
    const user = userEvent.setup();
    prepare(nineCleared(), []);
    render(<Harness initialPath="/daily/10" onGoTab={goTab} />);
    await finishAndOpenEpilogue(user);
    await user.click(screen.getByRole('button', { name: '에필로그 끝까지 읽기' }));
    await user.click(screen.getByRole('button', { name: COPY.scenario.diaryUnlockCta }));

    await user.click(screen.getByRole('button', { name: '보고서 닫기' }));

    expect(goTab).toHaveBeenCalledWith('analysis');
    expect(
      screen.queryByText(COPY.scenario.diaryUnlockTitle('일상'))
    ).not.toBeInTheDocument();
  });

  it('이미 보고서를 본 사용자는 곧바로 회복일기 탭으로 간다', async () => {
    const goTab = vi.fn();
    const user = userEvent.setup();
    prepare(nineCleared(), ['workplace']);
    render(<Harness initialPath="/daily/10" onGoTab={goTab} />);
    await finishAndOpenEpilogue(user);
    await user.click(screen.getByRole('button', { name: '에필로그 끝까지 읽기' }));

    await user.click(screen.getByRole('button', { name: COPY.scenario.diaryUnlockCta }));

    expect(goTab).toHaveBeenCalledWith('analysis');
    expect(screen.queryByTestId('type-report')).not.toBeInTheDocument();
    await waitFor(() => expect(path()).toBe(''));
  });

  it('다 읽기 전에 ✕로 닫으면 안내 없이 목록으로 돌아간다', async () => {
    const user = userEvent.setup();
    prepare(dailyCleared(), []);
    render(<Harness initialPath="/daily/epilogue" />);
    await screen.findByTestId('epilogue-player');

    await user.click(screen.getByRole('button', { name: '에필로그 닫기' }));

    expect(
      screen.queryByText(COPY.scenario.diaryUnlockTitle('일상'))
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('type-report')).not.toBeInTheDocument();
    await waitFor(() => expect(path()).toBe('/daily'));
  });

  // ── 마무리 안내는 **한 번뿐이다** (R3-08) ──
  //
  // 안내를 띄울 빚(pending)은 10편째를 마칠 때 생기고, 어느 길로 갚든 그 자리에서
  // 사라진다. 저장하지 않는 세션 상태라 새로고침하면 없어지는데, 그래도 되는
  // 것은 이 안내가 "지금 막 끝냈다"는 순간의 축하이기 때문이다.
  it('목록 카드로 다시 본 에필로그는 안내 없이 목록으로 돌아간다', async () => {
    const user = userEvent.setup();
    prepare(dailyCleared(), []); // 이미 완주해 둔 영역 — 방금 마친 것이 아니다
    render(<Harness initialPath="/daily/epilogue" />);
    await screen.findByTestId('epilogue-player');

    await user.click(screen.getByRole('button', { name: '에필로그 끝까지 읽기' }));

    expect(
      screen.queryByText(COPY.scenario.diaryUnlockTitle('일상'))
    ).not.toBeInTheDocument();
    // 플레이어가 다 읽은 채로 남으면 나갈 길이 ✕뿐이다 — 목록으로 되돌린다.
    expect(screen.queryByTestId('epilogue-player')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '일상' })).toBeInTheDocument();
    await waitFor(() => expect(path()).toBe('/daily'));
  });

  it("'나중에 볼게요'로 안내를 받았으면 나중에 읽어도 다시 뜨지 않는다", async () => {
    const user = userEvent.setup();
    // 10편이 이미 다 기록돼 있어야 목록의 에필로그 카드가 해금된 채 선다
    // (플레이어 스텁은 저장하지 않으므로 진행도를 미리 채워 둔다).
    prepare(dailyCleared(), ['workplace']);
    render(<Harness initialPath="/daily/10" />);
    await screen.findByTestId('player');
    await user.click(screen.getByRole('button', { name: '에피소드 마치기' }));
    await user.click(
      screen.getByRole('button', { name: COPY.scenario.epilogueUnlockLater })
    );
    // 여기서 이미 안내를 받았다 — 빚은 갚혔다.
    expect(screen.getByText(COPY.scenario.diaryUnlockTitle('일상'))).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: COPY.scenario.diaryUnlockCta }));

    // 목록의 에필로그 카드로 다시 들어가 끝까지 읽는다.
    await user.click(await screen.findByRole('heading', { name: '일상' }));
    await user.click(await screen.findByRole('button', { name: COPY.epilogue.cardOpenLabel }));
    await user.click(screen.getByRole('button', { name: COPY.epilogue.listCta }));
    await user.click(await screen.findByRole('button', { name: '에필로그 끝까지 읽기' }));

    expect(
      screen.queryByText(COPY.scenario.diaryUnlockTitle('일상'))
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('epilogue-player')).not.toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────
// 보고서 열림을 위로 알린다 (2026-08-27 3차 UAT R3-05)
//
// 유형 보고서만 자기 주소가 없어(영역 목록 주소에 얹혀 산다) 주소를 쥔 쪽에서
// 열림 여부를 알 수 없다. 그 결과 하단 탭바가 '시나리오'를 활성으로 칠한 채
// 남았다. 탭바가 실제로 어떻게 그리는지는 HomePage.test의 몫이고, 여기서는
// **신호가 나가는가**만 고정한다.
describe('보고서 열림 신호 (R3-05)', () => {
  /** 10편째만 남은 상태에서 완주 → 에필로그 → 회복일기 안내까지 몰고 간다. */
  const runToDiaryNotice = async (user: ReturnType<typeof userEvent.setup>) => {
    await screen.findByTestId('player');
    await user.click(screen.getByRole('button', { name: '에피소드 마치기' }));
    await user.click(screen.getByRole('button', { name: COPY.scenario.epilogueUnlockCta }));
    await user.click(screen.getByRole('button', { name: '에필로그 끝까지 읽기' }));
  };

  it('보고서가 열리고 닫히는 것을 그대로 되쏜다', async () => {
    const onReportOpenChange = vi.fn();
    const user = userEvent.setup();
    prepare(clearedProgress(THEMES[3].episodes.slice(0, 9).map((e) => e.id)), []);
    render(<Harness initialPath="/daily/10" onReportOpenChange={onReportOpenChange} />);
    await runToDiaryNotice(user);

    expect(onReportOpenChange).not.toHaveBeenCalledWith(true);

    await user.click(screen.getByRole('button', { name: COPY.scenario.diaryUnlockCta }));
    expect(screen.getByTestId('type-report')).toBeInTheDocument();
    expect(onReportOpenChange).toHaveBeenCalledWith(true);

    await user.click(screen.getByRole('button', { name: '보고서 닫기' }));
    expect(onReportOpenChange).toHaveBeenLastCalledWith(false);
  });
});

// ─────────────────────────────────────────────────────────
// 2뎁스에서 탭 재탭 → 1뎁스 (2026-08-27 3차 UAT R3-06)
//
// 하위 경로를 비우는 것은 App이 하고(App.routing.test), 그 빈 경로를 받아
// 영역 목록을 띄우는 것은 이 탭의 기존 동기화가 한다. 여기서 새로 고정하는
// 것은 **보고서를 그 경로로 떠날 때도 열람 기록이 남는가**다 — 남지 않으면
// 다음에 진짜로 완주했을 때 최초 보고서가 한 번 더 뜬다.
describe('탭 재탭으로 1뎁스 (R3-06)', () => {
  const runToReport = async (user: ReturnType<typeof userEvent.setup>) => {
    await screen.findByTestId('player');
    await user.click(screen.getByRole('button', { name: '에피소드 마치기' }));
    await user.click(screen.getByRole('button', { name: COPY.scenario.epilogueUnlockCta }));
    await user.click(screen.getByRole('button', { name: '에필로그 끝까지 읽기' }));
    await user.click(screen.getByRole('button', { name: COPY.scenario.diaryUnlockCta }));
    expect(screen.getByTestId('type-report')).toBeInTheDocument();
  };

  const nineCleared = clearedProgress(THEMES[3].episodes.slice(0, 9).map((e) => e.id));

  it('에피소드 목록에서 누르면 영역 목록으로 나온다', async () => {
    const user = userEvent.setup();
    render(<Harness initialPath="/workplace" />);
    await screen.findByRole('button', { name: '뒤로가기' });

    await user.click(screen.getByRole('button', { name: '시나리오 탭 다시 누르기' }));

    expect(await screen.findByRole('heading', { name: '직장' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '뒤로가기' })).not.toBeInTheDocument();
    await waitFor(() => expect(path()).toBe(''));
  });

  it('보고서에서 누르면 나오면서 열람 기록이 남는다', async () => {
    const markReportSeen = vi.fn(async () => true);
    const user = userEvent.setup();
    prepare(nineCleared, []);
    useScenarioStore.setState({ markReportSeen });
    render(<Harness initialPath="/daily/10" />);
    await runToReport(user);

    await user.click(screen.getByRole('button', { name: '시나리오 탭 다시 누르기' }));

    expect(screen.queryByTestId('type-report')).not.toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: '직장' })).toBeInTheDocument();
    expect(markReportSeen).toHaveBeenCalledWith('uid-1', 'daily');
  });

  it('디버그 해금 모드에서는 기록을 남기지 않는다 (기존 경계)', async () => {
    // 합성 진행도로 띄운 보고서를 본 것으로 처리하면, 나중에 진짜로 완주할 때
    // 최초 보고서가 뜨지 않는다. 저장 경로는 실데이터만 탄다.
    const markReportSeen = vi.fn(async () => true);
    const user = userEvent.setup();
    prepare(nineCleared, []);
    useScenarioStore.setState({ markReportSeen });
    render(<Harness initialPath="/daily/10" debugMode="full" />);
    await runToReport(user);

    await user.click(screen.getByRole('button', { name: '시나리오 탭 다시 누르기' }));

    expect(screen.queryByTestId('type-report')).not.toBeInTheDocument();
    expect(markReportSeen).not.toHaveBeenCalled();
  });
});
