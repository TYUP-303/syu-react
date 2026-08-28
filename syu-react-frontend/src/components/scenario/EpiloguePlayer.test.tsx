// src/components/scenario/EpiloguePlayer.test.tsx
// @vitest-environment jsdom
//
// 에필로그 플레이어의 계약: **읽고, 한 번 저장하고, 끝났다고 알린다.**
//
// 지키려는 것이 셋이다.
//   ① 4씬을 다 읽어야 끝난다 (중간에 끝나지 않는다).
//   ② 저장은 딱 한 번 — 다시 탭해도 더 나가지 않는다.
//   ③ 진행 기록(scenarios)은 건드리지 않는다. 그 경계는 store/epilogues.test.ts가
//      값으로 고정하고, 여기서는 플레이어가 그쪽 액션만 부르는지를 본다.
//
// ⚠️ 2026-08-27 UAT R2-28로 **완료의 신호가 바뀌었다.** 예전에는 "에필로그를
// 봤어요 … 목록으로 돌아가기" 시트가 떴고 그 제목이 곧 완료 판정이었는데, 이제
// 화면은 마지막 장면 그대로 남고 onComplete만 올라간다(다음에 무엇이 열렸는지는
// 진행도를 아는 ScenarioTab이 모달로 얹는다). 그래서 아래 단언은 전부
// "시트가 떴나"에서 "콜백이 나갔나"로 옮겨졌다 — 의도된 변경이다.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';

vi.mock('../../api/env', () => ({ IS_MOCK_MODE: true }));
vi.mock('../../api/firebase', () => ({ db: {}, auth: {} }));

// 에셋 프리로드는 jsdom에서 영원히 완결되지 않는다(load 이벤트가 없다).
// 게이트 자체는 대부분의 테스트에서 관심사가 아니므로 즉시 통과시킨다.
const mocks = vi.hoisted(() => ({
  preloadImages: vi.fn<
    (
      urls: string[],
      options?: { onProgress?: (settled: number, total: number) => void }
    ) => Promise<{ failed: string[] }>
  >(),
  markEpilogueSeen: vi.fn<() => Promise<boolean>>(),
}));

vi.mock('./player/assetUrls', () => ({
  // 경로 해석 규칙 자체는 player/assetUrls.test.ts가 고정한다. 여기서는
  // 무대가 <img>를 그릴 수만 있으면 된다.
  collectEpilogueImageUrls: () => [],
  preloadImages: mocks.preloadImages,
  resolveSprite: (charName: string) => ({
    src: `/scenario/characters/${charName}`,
    facing: 'front',
  }),
  resolveSceneCast: (chars: (string | undefined)[]) =>
    chars
      .map((charName, slot) => ({ charName: (charName ?? '').trim(), slot }))
      .filter((entry) => entry.charName !== '')
      .map((entry) => ({
        ...entry,
        src: `/scenario/characters/${entry.charName}`,
        facing: 'front' as const,
        mirrored: false,
      })),
  fairyUrl: (image: string) => image,
  backgroundUrl: (bg: string) => `/scenario/backgrounds/${bg}`,
}));

// 저장은 스토어의 계약이고 store/epilogues.test.ts가 따로 고정한다.
// 여기서 보는 것은 "언제 몇 번 부르는가"다.
vi.mock('../../store/useScenarioStore', () => ({
  useScenarioStore: Object.assign(() => mocks.markEpilogueSeen, {
    getState: () => ({ markEpilogueSeen: mocks.markEpilogueSeen }),
  }),
}));

import EpiloguePlayer from './EpiloguePlayer';
import { COPY } from '../../constants/copy';
import type { EpilogueEpisode } from '../../utils/scenarioEpilogueCsvParser';

const epilogue: EpilogueEpisode = {
  domain: '직장',
  title: '회의실이 조금 편해졌어요',
  scenes: [1, 2, 3, 4].map((n) => ({
    sceneNumber: n,
    bg: `bg${n}.png`,
    chars: ['baeksul_f_default.png'],
    text: `${n}번째 서술`,
    kind: 'scene' as const,
  })),
};

/** 씬 수가 다른 에필로그. 영역마다 매듭 장면의 길이가 달라 4~8씬이 온다. */
function makeEpilogue(sceneCount: number): EpilogueEpisode {
  return {
    ...epilogue,
    scenes: Array.from({ length: sceneCount }, (_, i) => i + 1).map((n) => ({
      sceneNumber: n,
      bg: `bg${n}.png`,
      chars: ['baeksul_f_default.png'],
      text: `${n}번째 서술`,
      kind: 'scene' as const,
    })),
  };
}

/** 마지막 씬이 극 밖 해설인 에필로그 — 배포되는 원고의 모양이다. */
function makeEpilogueWithNarration(sceneCount: number): EpilogueEpisode {
  const base = makeEpilogue(sceneCount);
  const last = base.scenes[sceneCount - 1];
  return {
    ...base,
    scenes: [
      ...base.scenes.slice(0, sceneCount - 1),
      // 해설 씬은 인물 없이 배경만 선다(CSV 계약).
      { ...last, chars: [], kind: 'narration' as const },
    ],
  };
}

const onExit = vi.fn();
const onComplete = vi.fn();

const renderPlayer = (episode: EpilogueEpisode = epilogue) =>
  render(
    <EpiloguePlayer
      uid="uid-1"
      themeId="workplace"
      epilogue={episode}
      characterGender="female"
      onExit={onExit}
      onComplete={onComplete}
    />
  );

// TypingText는 글자를 한 자씩 찍으므로, 스킵하기 전에는 전문이 DOM에 없다.
// 그래서 서술을 확인하는 모든 단계는 skipTyping을 먼저 거친다 — 이 두 걸음이
// 곧 이 화면의 진행 문법("읽는 중 한 번, 넘길 때 한 번")이기도 하다.
const skipTyping = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByText(COPY.player.tapSkip));
const goNext = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByText(COPY.player.tapNext));

/** 한 씬 넘기기 — 스킵 후 다음. */
const advanceScene = async (user: ReturnType<typeof userEvent.setup>) => {
  await skipTyping(user);
  await goNext(user);
};

beforeEach(() => {
  onExit.mockClear();
  onComplete.mockClear();
  mocks.preloadImages.mockReset();
  mocks.preloadImages.mockResolvedValue({ failed: [] });
  mocks.markEpilogueSeen.mockReset();
  mocks.markEpilogueSeen.mockResolvedValue(true);
  const root = document.createElement('div');
  root.id = 'app-modal-root';
  document.body.appendChild(root);
});

afterEach(() => {
  cleanup();
  document.getElementById('app-modal-root')?.remove();
});

describe('EpiloguePlayer — 4씬 진행', () => {
  it('첫 씬의 서술과 제목이 보인다', async () => {
    const user = userEvent.setup();
    renderPlayer();

    expect(await screen.findByText(COPY.epilogue.topBarLabel)).toBeInTheDocument();
    expect(screen.getByText(epilogue.title)).toBeInTheDocument();

    await skipTyping(user);
    expect(screen.getByText('1번째 서술')).toBeInTheDocument();
  });

  it('탭 한 번은 타이핑 스킵이고 두 번째 탭이 다음 씬이다', async () => {
    const user = userEvent.setup();
    renderPlayer();

    await skipTyping(user);
    // 아직 첫 씬이다 — 스킵은 진행이 아니다.
    expect(screen.getByText('1번째 서술')).toBeInTheDocument();

    await goNext(user);
    await skipTyping(user);
    expect(screen.getByText('2번째 서술')).toBeInTheDocument();
  });

  it('4씬을 다 읽어야 완료가 나간다 — 3씬까지는 나가지 않는다', async () => {
    const user = userEvent.setup();
    renderPlayer();

    await advanceScene(user);
    await advanceScene(user);
    await advanceScene(user);
    await skipTyping(user);
    expect(screen.getByText('4번째 서술')).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();
    expect(mocks.markEpilogueSeen).not.toHaveBeenCalled();

    await goNext(user);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});

describe('EpiloguePlayer — 가변 씬 수', () => {
  // 플레이어는 씬 수를 어디에도 박아 두지 않고 epilogue.scenes.length를 따른다.
  // 4씬 고정을 풀면서(2026-08-26) 실제로 그런지 값으로 고정해 둔다 — 완료
  // 판정이 4에 묶여 있으면 6씬 영역이 다섯 번째에서 끝나 버린다.
  it('6씬 에필로그는 여섯 씬을 다 읽어야 완료된다', async () => {
    const user = userEvent.setup();
    renderPlayer(makeEpilogue(6));

    for (let i = 0; i < 5; i++) await advanceScene(user);
    await skipTyping(user);
    expect(screen.getByText('6번째 서술')).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();

    await goNext(user);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(mocks.markEpilogueSeen).toHaveBeenCalledTimes(1);
  });

  it('5씬 에필로그는 다섯 씬에서 완료된다', async () => {
    const user = userEvent.setup();
    renderPlayer(makeEpilogue(5));

    for (let i = 0; i < 4; i++) await advanceScene(user);
    await skipTyping(user);
    expect(screen.getByText('5번째 서술')).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();

    await goNext(user);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});

// ── 극 밖 화자의 마무리 씬 ────────────────────────────────────────
//
// 마지막 씬만 화자가 바뀐다. 같은 서식으로 이어 붙이면 사용자가 그것도 장면의
// 일부로 읽어서 문장이 튀므로, 시트가 서식을 가른다. 여기서 지키려는 것은
// **갈랐다는 사실**이지 특정 클래스 이름이 아니지만, 서식이 통째로 사라지는
// 회귀(값을 안 넘기거나 prop 이름이 바뀌는)를 잡으려면 값이 있어야 한다.
//
// ⚠️ 2026-08-27 UAT R2-26으로 '— 맺음말 —' 라벨은 사라졌다(의도된 변경).
// 남은 표시는 가운데·이탤릭 서식뿐이므로, 아래 두 테스트가 라벨의 부재와
// 서식의 존재를 함께 고정한다 — 라벨이 되살아나도 잡힌다.
describe('EpiloguePlayer — 내레이션 마무리 씬', () => {
  it('극 안 장면은 가운데·이탤릭으로 갈리지 않는다', async () => {
    const user = userEvent.setup();
    renderPlayer(makeEpilogueWithNarration(5));

    await skipTyping(user);
    const body = screen.getByText('1번째 서술');
    expect(body.closest('.italic')).toBeNull();
    expect(screen.queryByText(/맺음말/)).not.toBeInTheDocument();
  });

  it('마지막 씬은 가운데·이탤릭으로 갈리되 맺음말 표는 붙지 않는다', async () => {
    const user = userEvent.setup();
    renderPlayer(makeEpilogueWithNarration(5));

    for (let i = 0; i < 4; i++) await advanceScene(user);
    await skipTyping(user);

    const body = screen.getByText('5번째 서술');
    expect(body.closest('.italic')).not.toBeNull();
    expect(body.closest('.text-center')).not.toBeNull();

    // R2-26 — 서식 위에 얹혀 있던 설명 한 줄은 걷어냈다.
    expect(screen.queryByText(/맺음말/)).not.toBeInTheDocument();
  });

  it('해설 씬도 한 씬이다 — 넘기면 그때 완료가 나간다', async () => {
    const user = userEvent.setup();
    renderPlayer(makeEpilogueWithNarration(5));

    for (let i = 0; i < 4; i++) await advanceScene(user);
    await skipTyping(user);
    expect(onComplete).not.toHaveBeenCalled();

    await goNext(user);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(mocks.markEpilogueSeen).toHaveBeenCalledTimes(1);
  });
});

describe('EpiloguePlayer — 완료와 저장', () => {
  const playToEnd = async (user: ReturnType<typeof userEvent.setup>) => {
    for (let i = 0; i < epilogue.scenes.length; i++) await advanceScene(user);
  };

  it('마지막 씬을 넘기면 themeId로 열람을 저장한다', async () => {
    const user = userEvent.setup();
    renderPlayer();
    await playToEnd(user);

    expect(mocks.markEpilogueSeen).toHaveBeenCalledTimes(1);
    expect(mocks.markEpilogueSeen).toHaveBeenCalledWith('uid-1', 'workplace');
  });

  it('완료 뒤 화면을 더 눌러도 저장과 완료 통지가 다시 나가지 않는다', async () => {
    const user = userEvent.setup();
    renderPlayer();
    await playToEnd(user);

    // 완료 시트가 없어졌으므로 누를 자리는 **마지막 장면 본문**이다.
    await user.click(screen.getByText('4번째 서술'));
    expect(mocks.markEpilogueSeen).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  // R2-28 — 완료 시트를 걷어낸 자리를 값으로 못 박는다. 이 화면은 다 읽어도
  // 스스로 닫지 않고, 다음 안내는 호출부(ScenarioTab)가 위에 얹는다.
  it('다 읽어도 완료 시트를 띄우지 않고 스스로 닫지도 않는다', async () => {
    const user = userEvent.setup();
    renderPlayer();
    await playToEnd(user);

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onExit).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: '목록으로 돌아가기' })).not.toBeInTheDocument();
  });

  it('마지막 장면은 다 읽은 뒤에도 화면에 남는다', async () => {
    const user = userEvent.setup();
    renderPlayer();
    await playToEnd(user);

    // 위에 뜰 모달의 배경이 되는 자리다 — 여기서 사라지면 이야기가 끝나는
    // 순간 화면이 텅 빈다.
    expect(screen.getByText('4번째 서술')).toBeInTheDocument();
  });

  it('완료 뒤에는 진행 힌트를 감춘다 — 더 넘길 것이 없다', async () => {
    const user = userEvent.setup();
    renderPlayer();
    await playToEnd(user);

    expect(screen.queryByText(COPY.player.tapNext)).not.toBeInTheDocument();
    expect(screen.queryByText(COPY.player.tapSkip)).not.toBeInTheDocument();
  });
});

describe('EpiloguePlayer — 이탈', () => {
  it('✕는 되묻지 않고 곧바로 닫는다 — 잃을 진행이 없다', async () => {
    const user = userEvent.setup();
    renderPlayer();
    await advanceScene(user);

    await user.click(screen.getByRole('button', { name: COPY.player.exitCloseLabel }));

    expect(onExit).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(COPY.player.exitConfirmTitle)).not.toBeInTheDocument();
    // 다 읽지 않고 나갔으므로 열람 기록도, 완료 통지도 남지 않는다.
    expect(mocks.markEpilogueSeen).not.toHaveBeenCalled();
  });
});

describe('EpiloguePlayer — 에셋 게이트', () => {
  it('프리로드가 끝나기 전에는 시트를 감춰 둔다', async () => {
    let release: (result: { failed: string[] }) => void = () => {};
    mocks.preloadImages.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      })
    );
    renderPlayer();

    expect(screen.getByText(COPY.player.preparing)).toBeInTheDocument();
    // 시트는 **DOM에 남되 감춰진다** — 언마운트하면 타이핑이 처음부터 다시
    // 시작되고 이미 읽던 문장이 되감긴다(VisualNovelPlayer의 같은 자리 주석).
    // jsdom에는 Tailwind가 적용되지 않으므로 클래스로 확인한다.
    const sheetWrapper = screen.getByText(COPY.player.tapSkip).closest('.hidden');
    expect(sheetWrapper).not.toBeNull();

    release({ failed: [] });
    await waitFor(() =>
      expect(screen.queryByText(COPY.player.preparing)).not.toBeInTheDocument()
    );
    expect(screen.getByText(COPY.player.tapSkip).closest('.hidden')).toBeNull();
  });

  it('받지 못한 그림이 있으면 안내를 띄우되 진행을 막지는 않는다', async () => {
    mocks.preloadImages.mockResolvedValue({ failed: ['/scenario/backgrounds/bg1.png'] });
    const user = userEvent.setup();
    renderPlayer();

    expect(await screen.findByText(COPY.errors.scenarioAssetLoadTitle)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: COPY.errors.scenarioAssetContinue }));
    expect(screen.queryByText(COPY.errors.scenarioAssetLoadTitle)).not.toBeInTheDocument();

    await skipTyping(user);
    expect(screen.getByText('1번째 서술')).toBeInTheDocument();
  });
});
