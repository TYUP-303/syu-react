// src/components/scenario/VisualNovelPlayer.test.tsx
// @vitest-environment jsdom
//
// 플레이 중 이탈 게이트 계약 (2026-08-08).
//
// 에피소드 결과는 마지막 평가에서 한 번에 저장된다. 그래서 저장 전에 상단 ✕로
// 나가면 그때까지의 진행이 통째로 사라지는데, 예전에는 경고 없이 곧바로 닫혔다.
// 반대로 **막 열어 첫 대사에 머무는 상태**에는 잃을 것이 없으므로 되묻지 않는다
// — 확인 모달이 습관적으로 무시되지 않으려면 실제로 잃을 게 있을 때만 떠야 한다.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';

vi.mock('../../api/env', () => ({ IS_MOCK_MODE: true }));
vi.mock('../../api/firebase', () => ({ db: {} }));
// 에셋 프리로드는 jsdom에서 영원히 완결되지 않는다(load 이벤트가 없다).
// 게이트 자체는 대부분의 테스트에서 관심사가 아니므로 즉시 통과시킨다.
// `failed`는 프리로드가 돌려주는 실패 URL 목록이며, 오프라인 안내 테스트만
// 이 값을 바꿔 실패를 재현한다 (기본값은 beforeEach가 되돌린다).
const mocks = vi.hoisted(() => ({
  preloadImages: vi.fn<
    (
      urls: string[],
      options?: { onProgress?: (settled: number, total: number) => void }
    ) => Promise<{ failed: string[] }>
  >(),
  clearEpisode: vi.fn<() => Promise<boolean>>(),
}));
vi.mock('./player/assetUrls', () => ({
  collectEpisodeImageUrls: () => [],
  preloadImages: mocks.preloadImages,
  // 경로 해석 규칙 자체는 player/assetUrls.test.ts가 고정한다. 여기서는
  // SceneStage가 <img>를 그릴 수만 있으면 된다.
  resolveCharacterFile: (charName: string) => `/scenario/characters/${charName}`,
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
// 결과 저장(clearEpisode)은 스토어의 계약이고 그쪽 테스트가 따로 고정한다.
// 여기서 관심 있는 것은 **저장이 성공한 뒤의 화면**이므로 성공만 돌려준다.
vi.mock('../../store/useScenarioStore', () => ({
  useScenarioStore: Object.assign(() => ({ clearEpisode: mocks.clearEpisode }), {
    getState: () => ({ error: null }),
  }),
}));

import VisualNovelPlayer from './VisualNovelPlayer';
import { COPY } from '../../constants/copy';
import { STRATEGY_META } from '../../constants/strategy';
import { useCharacterStore } from '../../store/useCharacterStore';
import type { EpisodeData } from '../../api/scenarioMockData';

const angel = (name: string) => ({
  name,
  // ⚠️ "${name} 전략"이 아니다 (2026-08-27 R2-03). 제목이 요정 이름에서 전략
  // 분류명으로 바뀌면서("수용 전략") 한 줄 요약의 기본 픽스처와 글자가 겹쳐,
  // getByText가 같은 문자열 둘을 집어 들었다. 픽스처끼리의 충돌일 뿐이지만
  // 두 자리를 구분해서 봐야 하는 계약이 여럿이라 요약 쪽을 갈라 둔다.
  strategy: `${name} 한 줄 요약`,
  detail: `${name} 상세`,
  feedback: `${name} 피드백`,
});

const episode: EpisodeData = {
  id: 'workplace-ep1',
  episodeNumber: 1,
  title: '첫 출근',
  summary: '요약',
  scenario: {
    no: '1',
    domain: 'workplace',
    reactionType: 'cognitive',
    title: '첫 출근',
    scenes: [
      { type: '상황', text: '첫 번째 대사', bg: 'bg1.png', chars: [] },
      { type: '상황', text: '두 번째 대사', bg: 'bg1.png', chars: [] },
    ],
  },
  angels: {
    accept: angel('수용'),
    reappraisal: angel('재평가'),
    refocus: angel('재초점'),
  },
  reasons: { helpful: ['도움1'], unhelpful: ['비도움1'] },
};

/** 캐릭터 스프라이트가 실제로 그려지는 에피소드 (onError 경로 확인용). */
const episodeWithChars: EpisodeData = {
  ...episode,
  scenario: {
    ...episode.scenario,
    scenes: [
      { type: '상황', text: '첫 번째 대사', bg: 'bg1.png', chars: ['baeksul_f_default.png'] },
      { type: '상황', text: '두 번째 대사', bg: 'bg1.png', chars: ['baeksul_f_default.png'] },
    ],
  },
};

const onExit = vi.fn();
const onNext = vi.fn();

const renderPlayer = () =>
  render(
    <VisualNovelPlayer
      uid="uid-1"
      episode={episode}
      characterGender="male"
      isLastEpisode={false}
      onExit={onExit}
      onNext={onNext}
    />,
  );

/** 시트 탭 — 1회차는 타이핑 스킵, 2회차는 다음 장면으로 진행 */
const advanceDialogue = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByText(COPY.player.tapSkip));
  await user.click(screen.getByText(COPY.player.tapNext));
};

// ANGELS 단계에는 같은 요정으로 들어가는 입구가 **둘** 있다 — 무대의 그림과
// 시트의 요정 칩. 이름이 겹치므로 getByRole은 "여러 개를 찾았다"로 실패한다.
// 어느 입구를 눌렀는지가 테스트마다 다르니 둘을 갈라 준다 (DOM 순서: 무대 → 시트).
/**
 * 무대에 서 있는 요정 그림 버튼. 이름이 아니라 **그림에서 거슬러 올라가**
 * 찾는다 — 이름으로 찾으면 그림이 다시 <img>로 되돌아가도 시트 칩이 대신
 * 잡혀 테스트가 조용히 통과한다.
 */
const angelGraphicButton = (name: string) => {
  const graphic = screen.getByAltText(`${name} 요정`);
  const button = graphic.closest('button');
  if (!button) throw new Error(`요정 그림(${name})이 버튼 안에 있지 않다 — 눌리지 않는 그림`);
  return button;
};
/** 시트 상단의 요정 칩 (2026-08-14 재설계로 하단 이름 버튼을 대체). */
const angelChipButton = (name: string) =>
  screen.getAllByRole('button', { name: new RegExp(name) }).slice(-1)[0];

beforeEach(() => {
  onExit.mockClear();
  onNext.mockClear();
  mocks.preloadImages.mockReset();
  mocks.preloadImages.mockResolvedValue({ failed: [] });
  mocks.clearEpisode.mockReset();
  mocks.clearEpisode.mockResolvedValue(true);
  // ConfirmDialog는 #app-modal-root로 포털 렌더링된다 (MobileWrapper가 소유).
  const root = document.createElement('div');
  root.id = 'app-modal-root';
  document.body.appendChild(root);
});

afterEach(() => {
  cleanup();
  document.getElementById('app-modal-root')?.remove();
  useCharacterStore.setState({ character: null });
});

describe('VisualNovelPlayer — 이탈 확인 게이트', () => {
  it('진행이 없는 첫 장면에서는 되묻지 않고 곧바로 닫는다', async () => {
    const user = userEvent.setup();
    renderPlayer();

    await user.click(screen.getByRole('button', { name: COPY.player.exitCloseLabel }));

    expect(onExit).toHaveBeenCalledWith(false);
    expect(screen.queryByText(COPY.player.exitConfirmTitle)).not.toBeInTheDocument();
  });

  it('대사를 진행한 뒤에는 ✕가 확인 모달을 띄우고 곧바로 나가지 않는다', async () => {
    const user = userEvent.setup();
    renderPlayer();
    await advanceDialogue(user);

    await user.click(screen.getByRole('button', { name: COPY.player.exitCloseLabel }));

    expect(screen.getByText(COPY.player.exitConfirmTitle)).toBeInTheDocument();
    expect(onExit).not.toHaveBeenCalled();
  });

  it('확인 모달에서 나가기를 누르면 이탈 경로를 탄다', async () => {
    const user = userEvent.setup();
    renderPlayer();
    await advanceDialogue(user);

    await user.click(screen.getByRole('button', { name: COPY.player.exitCloseLabel }));
    await user.click(screen.getByRole('button', { name: COPY.player.exitConfirmExit }));

    // didComplete=false — 저장되지 않은 이탈이라 마무리 분기로 합류시키면 안 된다
    expect(onExit).toHaveBeenCalledWith(false);
  });

  it('확인 모달을 취소하면 보던 장면에 그대로 머문다', async () => {
    const user = userEvent.setup();
    renderPlayer();
    await advanceDialogue(user);

    await user.click(screen.getByRole('button', { name: COPY.player.exitCloseLabel }));
    await user.click(screen.getByRole('button', { name: COPY.player.exitConfirmCancel }));

    expect(onExit).not.toHaveBeenCalled();
    expect(screen.queryByText(COPY.player.exitConfirmTitle)).not.toBeInTheDocument();
    // 플레이어는 그대로 살아 있고 진행 상태도 유지된다 — 다시 ✕를 누르면 또 되묻는다
    expect(screen.getByText(episode.title)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: COPY.player.exitCloseLabel }));
    expect(screen.getByText(COPY.player.exitConfirmTitle)).toBeInTheDocument();
  });
});

// ── 프리로드 게이트 (2026-08-18 실플레이 지적) ─────────────────────────
//
// "옛날엔 미리 다운받아 로딩 지연이 없었는데, 지금은 인터넷이 느리면 대사만
// 먼저 나오고 그림이 늦게 뜬다."
//
// 게이트 자체는 있었지만 옆에 **3초 폴백**이 있었다. 프리로드 성공 여부와
// 무관하게 3초 뒤 열어 버려서, 한 회차 3.9MB(최대 7.1MB) 실측 용량을 3초에
// 받을 수 없는 회선에서는 사실상 늘 헛돌았다. 폴백을 걷어냈고, 아래 세 가지가
// 그 결정을 고정한다.
//
//   ① 프리로드가 끝나기 전에는 진행이 잠긴다 (준비 안내가 대신 뜬다)
//   ② 시간이 흐른다고 열리지 않는다 — 폴백이 되살아나면 여기서 깨진다
//   ③ 기다리는 동안 얼마나 남았는지 보인다 (스피너만으로는 멈춘 것과 같다)
//
// jsdom에는 CSS가 없어 `hidden` 클래스로 감춘 시트도 DOM에는 남는다. 그래서
// "보이는가"가 아니라 **"눌러도 넘어가지 않는가"**로 판정한다 — 어차피 게이트의
// 목적이 그것이고, 클래스만 보면 진짜 잠겼는지는 알 수 없다.
describe('VisualNovelPlayer — 에셋 프리로드 게이트', () => {
  /** 아직 끝나지 않은 프리로드. 테스트가 원하는 시점에 손으로 끝낸다. */
  const pendingPreload = () => {
    let finish: (result: { failed: string[] }) => void = () => {};
    mocks.preloadImages.mockReturnValue(
      new Promise<{ failed: string[] }>((resolve) => {
        finish = resolve;
      })
    );
    return (result: { failed: string[] } = { failed: [] }) => act(async () => finish(result));
  };

  it('프리로드가 끝나기 전에는 준비 안내를 띄우고 대사 진행을 잠근다', async () => {
    const finish = pendingPreload();
    renderPlayer();

    expect(screen.getByText(COPY.player.preparing)).toBeInTheDocument();

    // 첫 대사에 머무는 상태의 힌트는 '건너뛰기'다. 게이트가 열려 있었다면
    // 이 탭이 타이핑을 건너뛰어 힌트가 '다음으로'로 바뀐다.
    fireEvent.click(screen.getByText(COPY.player.tapSkip));
    expect(screen.getByText(COPY.player.tapSkip)).toBeInTheDocument();
    expect(screen.queryByText(COPY.player.tapNext)).not.toBeInTheDocument();

    await finish();

    expect(screen.queryByText(COPY.player.preparing)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText(COPY.player.tapSkip));
    expect(await screen.findByText(COPY.player.tapNext)).toBeInTheDocument();
  });

  it('시간이 지난다고 열리지 않는다 — 3초 폴백은 돌아오지 않는다', async () => {
    vi.useFakeTimers();
    try {
      const finish = pendingPreload();
      renderPlayer();

      // 옛 폴백은 3초였다. 그 열 배를 흘려도 게이트는 프리로드만 기다린다.
      // (이 사이에 타이핑 연출은 끝난다 — 그래서 진행 힌트가 아니라 **장면이
      //  넘어갔는가**로 판정한다. 시트는 감춰져 있을 뿐 살아 있기 때문이다.)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30_000);
      });

      const [first, second] = episode.scenario.scenes;
      expect(screen.getByText(COPY.player.preparing)).toBeInTheDocument();
      fireEvent.click(screen.getByText(first.text));
      expect(screen.queryByText(second.text)).not.toBeInTheDocument();

      await finish();
      expect(screen.queryByText(COPY.player.preparing)).not.toBeInTheDocument();

      // 게이트가 열린 뒤에는 같은 탭이 실제로 장면을 넘긴다.
      fireEvent.click(screen.getByText(first.text));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30_000);
      });
      expect(screen.getByText(second.text)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('기다리는 동안 받은 장수를 보여 준다', async () => {
    let report: ((settled: number, total: number) => void) | undefined;
    let finish: (result: { failed: string[] }) => void = () => {};
    mocks.preloadImages.mockImplementation((_urls, options) => {
      report = options?.onProgress;
      return new Promise((resolve) => {
        finish = resolve;
      });
    });
    renderPlayer();

    // 총량을 모르는 동안에는 숫자를 띄우지 않는다 — "0/0"이 멈춘 것처럼 보인다.
    expect(screen.queryByText(/\d+\/\d+/)).not.toBeInTheDocument();

    await act(async () => report?.(0, 7));
    expect(screen.getByText(COPY.player.preparingProgress(0, 7))).toBeInTheDocument();

    await act(async () => report?.(3, 7));
    expect(screen.getByText(COPY.player.preparingProgress(3, 7))).toBeInTheDocument();

    await act(async () => finish({ failed: [] }));
    expect(screen.queryByText(COPY.player.preparingProgress(3, 7))).not.toBeInTheDocument();
  });

  // 예전에는 카드 **전체**가 aria-live였다. 그래서 한 장 받을 때마다 안내문과
  // 진행 막대까지 통째로 다시 읽혔고(장수만큼 반복), 그 안에 role="progressbar"가
  // 중첩되면서 같은 정보가 이름·값·문구 세 번으로 나왔다. 읽어야 할 것은 바뀌는
  // 한 줄뿐이다 — 진행 막대는 그 줄을 그림으로 되풀이할 뿐이라 낭독에서 뺀다.
  it('낭독은 진행 문구 한 줄만 맡는다', async () => {
    let report: ((settled: number, total: number) => void) | undefined;
    mocks.preloadImages.mockImplementation((_urls, options) => {
      report = options?.onProgress;
      return new Promise(() => {});
    });
    renderPlayer();

    await act(async () => report?.(0, 7));

    const live = screen.getByRole('status');
    // 이 안에 다른 것이 함께 들어 있으면 그만큼 되풀이해 읽힌다
    expect(live.textContent).toBe(COPY.player.preparingProgress(0, 7));
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();

    // 자리를 지킨 채 내용만 바뀌어야 낭독기가 변화를 알린다 — 이 시점에
    // 처음 생기는 영역이면 그 회차는 읽히지 않는다.
    await act(async () => report?.(3, 7));
    expect(screen.getByRole('status')).toBe(live);
    expect(live.textContent).toBe(COPY.player.preparingProgress(3, 7));
  });
});

// 오프라인이면 이미지가 전부 깨진 채 alt 텍스트("배경", "등장 캐릭터")만
// 남는데, 예전에는 아무 안내 없이 그대로 끝까지 진행됐다 (2026-08-12 UAT).
// 안내는 띄우되 **진행은 막지 않는다** — 대사는 이미 받아 둔 CSV라 그림 없이도
// 읽히고, 여기서 막으면 저장 전 진행이 통째로 날아간다.
describe('VisualNovelPlayer — 에셋 로드 실패 안내', () => {
  it('모든 이미지가 정상이면 안내를 띄우지 않는다', async () => {
    renderPlayer();

    // 프리로드 완료 후의 화면 — 첫 대사가 그려진다
    expect(await screen.findByText(COPY.player.tapSkip)).toBeInTheDocument();
    expect(screen.queryByText(COPY.errors.scenarioAssetLoadTitle)).not.toBeInTheDocument();
  });

  it('실패한 이미지가 있으면 네트워크 안내를 띄운다', async () => {
    mocks.preloadImages.mockResolvedValue({ failed: ['/scenario/backgrounds/bg1.png'] });
    renderPlayer();

    expect(await screen.findByText(COPY.errors.scenarioAssetLoadTitle)).toBeInTheDocument();
  });

  it('그대로 진행하기를 누르면 안내만 닫히고 플레이는 이어진다', async () => {
    mocks.preloadImages.mockResolvedValue({ failed: ['/scenario/backgrounds/bg1.png'] });
    const user = userEvent.setup();
    renderPlayer();
    await screen.findByText(COPY.errors.scenarioAssetLoadTitle);

    await user.click(screen.getByRole('button', { name: COPY.errors.scenarioAssetContinue }));

    expect(screen.queryByText(COPY.errors.scenarioAssetLoadTitle)).not.toBeInTheDocument();
    expect(screen.getByText(episode.title)).toBeInTheDocument();
    expect(onExit).not.toHaveBeenCalled();
  });

  // 프리로드를 통과한 뒤(캐시가 있었다) 오프라인으로 바뀐 경우 — 씬의
  // <img>가 깨지면서 onError로 합류한다.
  it('진행 중 이미지가 깨져도 안내를 띄우고, 한 번 닫으면 다시 묻지 않는다', async () => {
    const user = userEvent.setup();
    render(
      <VisualNovelPlayer
        uid="uid-1"
        episode={episodeWithChars}
        characterGender="male"
        isLastEpisode={false}
        onExit={onExit}
        onNext={onNext}
      />,
    );
    const sprite = await screen.findByAltText('등장 캐릭터');

    fireEvent.error(sprite);
    expect(await screen.findByText(COPY.errors.scenarioAssetLoadTitle)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: COPY.errors.scenarioAssetContinue }));
    expect(screen.queryByText(COPY.errors.scenarioAssetLoadTitle)).not.toBeInTheDocument();

    // 장면마다 같은 안내가 다시 튀어나오면 그 자체가 진행 방해가 된다
    fireEvent.error(sprite);
    expect(screen.queryByText(COPY.errors.scenarioAssetLoadTitle)).not.toBeInTheDocument();
  });

  it('다시 불러오기를 누르면 프리로드를 다시 시도한다', async () => {
    mocks.preloadImages.mockResolvedValue({ failed: ['/scenario/backgrounds/bg1.png'] });
    const user = userEvent.setup();
    renderPlayer();
    await screen.findByText(COPY.errors.scenarioAssetLoadTitle);
    expect(mocks.preloadImages).toHaveBeenCalledTimes(1);

    // 연결이 돌아온 상황 — 재시도는 실패 목록 없이 끝난다
    mocks.preloadImages.mockResolvedValue({ failed: [] });
    await user.click(screen.getByRole('button', { name: COPY.errors.scenarioAssetRetry }));

    expect(mocks.preloadImages).toHaveBeenCalledTimes(2);
    expect(await screen.findByText(COPY.player.tapSkip)).toBeInTheDocument();
    expect(screen.queryByText(COPY.errors.scenarioAssetLoadTitle)).not.toBeInTheDocument();
  });
});

// 시나리오는 "내가 겪는 일"로 읽혀야 한다(이입 컨셉). 원문 CSV가 주인공을
// '백설'로 서술하므로, 화면에 닿기 직전 닉네임으로 갈아 끼운다.
// 규칙 자체는 utils/personalizeScenarioText.test.ts가 고정하고, 여기서는
// **플레이어가 그 관문을 실제로 통과시키는지**만 확인한다.
describe('VisualNovelPlayer — 주인공 이름 개인화', () => {
  const baeksulEpisode: EpisodeData = {
    ...episode,
    title: '자격증 공부가 늘지 않는 백설',
    scenario: {
      ...episode.scenario,
      scenes: [
        { type: '상황', text: '백설은 팀 회의에서 발표하고 있다.', bg: 'bg1.png', chars: [] },
        { type: '상황', text: '두 번째 대사', bg: 'bg1.png', chars: [] },
      ],
    },
  };

  it('대사와 타이틀의 백설이 닉네임으로 치환되고 조사도 교정된다', async () => {
    // 받침 없는 닉네임 — 원문의 '백설은'이 '지수는'이 되어야 한다.
    useCharacterStore.setState({
      character: { nickname: '지수', gender: 'male', createdAt: '2026-08-08T00:00:00.000Z' },
    });
    const user = userEvent.setup();

    render(
      <VisualNovelPlayer
        uid="uid-1"
        episode={baeksulEpisode}
        characterGender="male"
        isLastEpisode={false}
        onExit={onExit}
        onNext={onNext}
      />,
    );

    // 타이핑을 건너뛰어 전문을 한 번에 그린다
    await user.click(screen.getByText(COPY.player.tapSkip));

    expect(screen.getByText('지수는 팀 회의에서 발표하고 있다.')).toBeInTheDocument();
    expect(screen.getByText('자격증 공부가 늘지 않는 지수')).toBeInTheDocument();
    expect(screen.queryByText(/백설/)).not.toBeInTheDocument();
  });

  // 2026-08-12(bf2e5b5)에 요정 조언·선택지가 scenario_angels.csv로 분리되면서
  // 이 텍스트들도 시트 원고가 되었다. 그전까지는 상수 한 벌을 120편이 공유해
  // '백설'이 나올 수 없었고 세 패널이 훅을 거치지 않았다.
  const angelManuscriptEpisode: EpisodeData = {
    ...episode,
    angels: {
      accept: {
        name: '수용',
        strategy: '백설의 마음 있는 그대로 보기',
        detail: '백설은 지금 느끼는 감정을 밀어내지 않는다.',
        feedback: '백설이 한결 가벼워졌다.',
      },
      reappraisal: angel('재평가'),
      refocus: angel('재초점'),
    },
    reasons: { helpful: ['백설에게 힘이 되었다'], unhelpful: ['비도움1'] },
  };

  /** 요정 3인을 다 읽고 수용을 최종 선택해 APPLY_STRATEGY까지 간다. */
  const playToApply = async (user: ReturnType<typeof userEvent.setup>) => {
    await advanceScenes(user, angelManuscriptEpisode.scenario.scenes.length);
    await readAllAngels(user);
    await user.click(angelChipButton('수용'));
    await user.click(screen.getByRole('button', { name: COPY.player.selectFinal }));
  };

  beforeEach(() => {
    useCharacterStore.setState({
      character: { nickname: '지수', gender: 'male', createdAt: '2026-08-08T00:00:00.000Z' },
    });
  });

  it('요정 조언 상세의 백설도 닉네임으로 치환된다', async () => {
    const user = userEvent.setup();
    renderEpisode(angelManuscriptEpisode);

    await advanceScenes(user, angelManuscriptEpisode.scenario.scenes.length);
    await user.click(angelChipButton('수용'));

    expect(screen.getByText('지수의 마음 있는 그대로 보기')).toBeInTheDocument();
    expect(screen.getByText('지수는 지금 느끼는 감정을 밀어내지 않는다.')).toBeInTheDocument();
    expect(screen.queryByText(/백설/)).not.toBeInTheDocument();
  });

  it('전략 실행 후 반응 대사의 백설도 닉네임으로 치환된다', async () => {
    const user = userEvent.setup();
    renderEpisode(angelManuscriptEpisode);

    await playToApply(user);

    // '백설이 한결' → 받침 없는 닉네임이라 주격 조사도 '가'로 교정된다
    expect(screen.getByText(/지수가 한결 가벼워졌다\./)).toBeInTheDocument();
    expect(screen.queryByText(/백설/)).not.toBeInTheDocument();
  });

  it('평가 선택지는 화면에서만 치환되고 저장에는 원문이 넘어간다', async () => {
    const user = userEvent.setup();
    renderEpisode(angelManuscriptEpisode);

    await playToApply(user);
    await user.click(screen.getByRole('button', { name: COPY.player.next }));
    await user.click(screen.getByRole('button', { name: COPY.player.evalYes }));

    expect(screen.getByText('지수에게 힘이 되었다')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '지수에게 힘이 되었다' }));

    // 저장값까지 치환하면 같은 선택지가 사용자마다 다른 문자열이 되어
    // 완주 보고서의 "핵심 요인 Top3"(utils/strategyStats)가 빈도 1로 무너진다.
    expect(mocks.clearEpisode).toHaveBeenCalledWith('uid-1', 'workplace-ep1', {
      selectedAngel: 'accept',
      wasHelpful: true,
      selectedReason: '백설에게 힘이 되었다',
    });
  });
});

// ── 2026-08-11 UAT 접수분 회귀 ───────────────────────────────
//
// 실제 CSV를 본뜬 4씬 에피소드. 씬 1이 상황이 벌어진 장소(회의실)이고,
// 씬 4는 CSV 120행 중 89행(74%)이 그런 것처럼 '내 방'이며 조연(연인)이
// 함께 서 있다. 아래 테스트들이 고정하는 세 가지 — 배경이 씬 1로 돌아오는
// 것, 완료 화면에 주인공만 남는 것, 작업용 라벨이 노출되지 않는 것 —
// 은 모두 이 데이터 모양에서 나온 지적이다.
const uatEpisode: EpisodeData = {
  ...episode,
  scenario: {
    ...episode.scenario,
    scenes: [
      {
        type: '공통 시나리오 - Scene 1',
        text: '회의에서 실수를 지적받았다.',
        bg: 'meeting_room.png',
        chars: ['baeksul_f_default.png', '', 'colleague_default.png'],
      },
      { type: '공통 시나리오 - Scene 2', text: '두 번째 대사', bg: 'office.png', chars: ['baeksul_f_sad.png', '', ''] },
      { type: '세부 시나리오(인지) - Scene 3', text: '세 번째 대사', bg: 'street_night.png', chars: ['baeksul_f_sad.png', '', ''] },
      {
        type: '세부 시나리오(인지) - Scene 4',
        text: '네 번째 대사',
        bg: 'my_room.png',
        chars: ['baeksul_f_sad.png', '', 'lover_default.png'],
      },
    ],
  },
};

const renderEpisode = (data: EpisodeData, isLastEpisode = false) =>
  render(
    <VisualNovelPlayer
      uid="uid-1"
      episode={data}
      characterGender="male"
      isLastEpisode={isLastEpisode}
      onExit={onExit}
      onNext={onNext}
    />,
  );

/**
 * 배경 이미지는 인라인 style로만 들어간다(스크림은 클래스).
 *
 * 배경이 바뀌는 전환에서는 잠깐 **두 겹**이 선다(2026-08-27 R2-07 — 새 장이
 * 준비될 때까지 옛 장을 붙들어 공백 프레임을 없앤 구조). 첫 번째가 바닥에 깔린
 * 장이므로 "지금 실제로 보이는 배경"은 여기서 그대로 읽힌다.
 */
const backgroundImage = () =>
  document.querySelector<HTMLElement>('[style*="background-image"]')?.style.backgroundImage ?? '';

/**
 * 배경이 이 파일로 **정착**할 때까지 기다린다.
 *
 * 예전에는 `expect(backgroundImage()).toContain(...)`로 즉시 단언했다. 배경 교체가
 * 동기였기 때문인데, R2-07에서 "준비 → 크로스페이드 → 정착" 순서가 생기면서
 * 씬을 넘긴 직후의 배경은 **아직 옛 장**이다. 단언 자체는 그대로 유효하고
 * (어떤 배경으로 가는가), 시점만 뒤로 밀린 것이라 대기로 바꾼다.
 */
const expectBackgroundToSettleOn = (file: string) =>
  waitFor(() => expect(backgroundImage()).toContain(file), { timeout: 3000 });

/** 대사 n개를 넘겨 다음 단계로. 마지막 클릭이 ANGELS로 넘긴다. */
const advanceScenes = async (user: ReturnType<typeof userEvent.setup>, count: number) => {
  for (let i = 0; i < count; i += 1) {
    await user.click(screen.getByText(COPY.player.tapSkip));
    await user.click(screen.getByText(COPY.player.tapNext));
  }
};

/**
 * 요정 3인의 조언을 모두 읽는다(최종 선택 잠금 해제).
 *
 * 2026-08-14 재설계 전에는 요정마다 [칩 → 상세 → '목록으로'] 세 걸음이 필요했다.
 * 지금은 조언이 같은 시트 안의 내용이라 칩만 옮겨 타면 되고, 돌아갈 목록 자체가
 * 없어졌다 — 이 헬퍼가 짧아진 것이 곧 P5(탐색 비용) 해소의 증거다.
 */
const readAllAngels = async (user: ReturnType<typeof userEvent.setup>) => {
  for (const name of ['수용', '재평가', '재초점']) {
    await user.click(angelChipButton(name));
  }
};

/** ANGELS 단계에서 EPISODE_COMPLETE까지 한 번에 진행한다. */
const playToComplete = async (user: ReturnType<typeof userEvent.setup>) => {
  await readAllAngels(user);
  await user.click(angelChipButton('수용'));
  await user.click(screen.getByRole('button', { name: COPY.player.selectFinal }));
  await user.click(screen.getByRole('button', { name: COPY.player.next }));
  await user.click(screen.getByRole('button', { name: COPY.player.evalYes }));
  await user.click(screen.getByRole('button', { name: '도움1' }));
  // 저장(clearEpisode)이 끝나야 완료 화면으로 넘어간다.
  // 완료 시트의 primary 버튼은 회차에 따라 갈리므로(1~9=다음 / 10=마무리)
  // 둘 중 하나가 서면 도착으로 본다. 문구는 COPY에서 그대로 끌어온다 —
  // 정규식에 문자열을 다시 적으면 카피가 바뀔 때 조용히 어긋난다.
  await screen.findByRole('button', {
    name: new RegExp(`${COPY.player.completeNext}|${COPY.player.completeCtaLast}`),
  });
};

describe('VisualNovelPlayer — 작업용 라벨 노출 (UAT 8/11)', () => {
  it('CSV의 SCENE_TYPE 값은 대사 위에 찍히지 않는다', async () => {
    const user = userEvent.setup();
    renderEpisode(uatEpisode);

    await user.click(screen.getByText(COPY.player.tapSkip));

    expect(screen.getByText('회의에서 실수를 지적받았다.')).toBeInTheDocument();
    expect(screen.queryByText('공통 시나리오 - Scene 1')).not.toBeInTheDocument();
    expect(screen.queryByText(/Scene \d/)).not.toBeInTheDocument();
  });
});

describe('VisualNovelPlayer — 요정 3인 초기 표시 (UAT 8/11)', () => {
  it('선택 전에는 세 요정이 완전히 같은 스타일로 선다', async () => {
    const user = userEvent.setup();
    renderEpisode(uatEpisode);
    await advanceScenes(user, uatEpisode.scenario.scenes.length);

    const fairies = ['수용 요정', '재평가 요정', '재초점 요정'].map((label) =>
      screen.getByAltText(label),
    );

    expect(fairies).toHaveLength(3);
    // 크기·불투명도·쌓임 순서가 하나라도 다르면 "이미 고른 것"으로 읽힌다.
    //
    // 유휴 부유의 **지연**만은 예외로 셋이 다르다(2026-08-26) — 위상을 어긋내야
    // 셋이 한 덩어리가 아니라 각각의 선택지로 읽힌다. 강약을 만드는 것은 부유가
    // 아니라 opacity·scale이므로, 여기서는 지연을 빼고 견준다.
    const withoutDelay = (img: HTMLElement) =>
      img.className
        .split(/\s+/)
        .filter((c) => c && !c.startsWith('[animation-delay:'))
        .join(' ');
    expect(new Set(fairies.map(withoutDelay)).size).toBe(1);
    expect(fairies.every((img) => !img.className.includes('z-10'))).toBe(true);
  });
});

describe('VisualNovelPlayer — 전략 적용 이후의 무대 (UAT 8/11)', () => {
  it('전략을 고르면 배경이 상황이 시작된 씬 1로 돌아온다', async () => {
    const user = userEvent.setup();
    renderEpisode(uatEpisode);

    expect(backgroundImage()).toContain('meeting_room.png');

    await advanceScenes(user, uatEpisode.scenario.scenes.length);
    // 요정 선택까지는 직전 씬의 배경을 그대로 이어받는다(전환이 튀지 않게)
    await expectBackgroundToSettleOn('my_room.png');

    await readAllAngels(user);
    await user.click(angelChipButton('수용'));
    await user.click(screen.getByRole('button', { name: COPY.player.selectFinal }));

    await expectBackgroundToSettleOn('meeting_room.png');
  });

  it('에피소드 완료 화면도 씬 1의 배경을 쓰고 주인공만 남는다', async () => {
    const user = userEvent.setup();
    renderEpisode(uatEpisode);
    await advanceScenes(user, uatEpisode.scenario.scenes.length);
    await playToComplete(user);

    await expectBackgroundToSettleOn('meeting_room.png');

    // 조연(동료·연인)이 함께 서면 "혼자가 아니다"라는 지적으로 되돌아간다
    const sprites = screen.getAllByAltText('등장 캐릭터');
    expect(sprites).toHaveLength(1);
    expect(sprites[0].getAttribute('src')).toContain('baeksul');
  });
});

// ── 에피소드 완료 화면의 선택 (UAT 8/11 · 1단계화 2026-08-16) ─────────
//
// 2026-08-16까지는 [시트의 종료 버튼 → 모달 → 그만하기/다음] 두 걸음이었다.
// 저장이 이미 끝난 뒤라 되물을 것이 없어 확인 한 겹만 남아 있었고, 그래서
// 선택지 둘을 시트로 끌어올렸다. 아래 세 테스트가 그 구조를 고정한다.
describe('VisualNovelPlayer — 에피소드 완료 화면의 선택 (2026-08-16)', () => {
  it('1~9회차는 그만하기·다음 에피소드를 시트에서 바로 고른다', async () => {
    const user = userEvent.setup();
    renderEpisode(uatEpisode, false);
    await advanceScenes(user, uatEpisode.scenario.scenes.length);
    await playToComplete(user);

    // 중간 단계 없이 두 선택지가 곧바로 서 있어야 한다
    expect(screen.getByRole('button', { name: COPY.player.completeExit })).toBeInTheDocument();
    expect(screen.queryByText(COPY.player.completeTitleLast)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: COPY.player.completeNext }));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('마지막(10)회차는 마무리 버튼 하나만 두고 문구도 갈린다', async () => {
    const user = userEvent.setup();
    renderEpisode(uatEpisode, true);
    await advanceScenes(user, uatEpisode.scenario.scenes.length);
    await playToComplete(user);

    expect(screen.getByText(COPY.player.completeTitleLast)).toBeInTheDocument();
    expect(screen.getByText(COPY.player.completeBodyLast)).toBeInTheDocument();

    // 이어서 진행할 에피소드가 없으므로 '다음'은 서지 않는다
    expect(screen.queryByRole('button', { name: COPY.player.completeNext })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: COPY.player.completeCtaLast }));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  // 회귀 가드 — 모달이 되살아나면 다시 두 걸음이 된다.
  // ui/Modal은 role을 달지 않고 #app-modal-root로 포털 렌더링되므로, 이
  // 저장소에서 "모달이 떠 있다"의 마커는 그 루트가 비어 있지 않다는 것이다.
  it('완료 단계에서는 어떤 모달도 뜨지 않는다', async () => {
    const user = userEvent.setup();
    renderEpisode(uatEpisode, false);
    await advanceScenes(user, uatEpisode.scenario.scenes.length);
    await playToComplete(user);

    expect(document.getElementById('app-modal-root')?.childElementCount).toBe(0);
  });
});

// ── 요정 상세 패널의 한 줄 요약 (2026-08-13) ─────────────────────────
//
// 원고가 없는 회차에서는 "수용 요정 / 아코의 전략 / 수용"으로 같은 말이 세 번
// 반복됐다. 세 번째 줄(한 줄 요약)의 기본값이 첫 줄의 요정 라벨과 같은 낱말이라
// 생긴 일이라, 원고가 실린 회차에서만 그 줄을 띄운다.
describe('VisualNovelPlayer — 요정 상세 패널 한 줄 요약 (2026-08-13)', () => {
  /** 한 줄 요약(CSV의 *_TITLE)만 갈아 끼운 에피소드. */
  const withStrategyLine = (line: string): EpisodeData => ({
    ...episode,
    angels: {
      ...episode.angels,
      accept: { ...episode.angels.accept, strategy: line },
    },
  });

  it('한 줄 요약이 기본값이면 같은 말이 세 번 반복되지 않게 줄을 숨긴다', async () => {
    const user = userEvent.setup();
    // 원고가 없는 회차 — 기본값은 전략 축약 라벨과 같은 문자열이다
    renderEpisode(withStrategyLine(STRATEGY_META.accept.shortLabel));

    await advanceScenes(user, episode.scenario.scenes.length);
    await user.click(angelChipButton('수용'));

    // 제목('수용 전략')은 그대로 남는다. 요정 라벨('수용 요정')을 함께 보던
    // 줄은 2026-08-27 R2-03에서 빠졌다 — 그 이름표 자체를 요정 단계에서
    // 걷어냈기 때문이다(아래 '시트 화자 이름표' 계약이 그것을 고정한다).
    expect(screen.getByText(COPY.player.strategyTitle(STRATEGY_META.accept.shortLabel)))
      .toBeInTheDocument();
    // 세 번째 반복이던 낱말 하나짜리 줄만 사라진다.
    // ⚠️ 자리를 <p>로 좁힌 것은 R2-03 이후 칩이 **요정 이름만** 들기 때문이다 —
    // 이 픽스처는 요정 이름을 '수용'으로 두었으므로 칩에도 같은 낱말이 뜬다.
    // (실제 원고에서는 '아코'라 겹치지 않지만, 픽스처를 고치면 이 파일의 다른
    // 계약들이 요정을 집는 방식까지 함께 흔들린다.)
    expect(
      screen.queryByText(STRATEGY_META.accept.shortLabel, { selector: 'p' })
    ).not.toBeInTheDocument();
  });

  it('CSV로 채운 한 줄 요약은 그대로 띄운다', async () => {
    const user = userEvent.setup();
    renderEpisode(withStrategyLine('한 걸음 물러나 바라보기'));

    await advanceScenes(user, episode.scenario.scenes.length);
    await user.click(angelChipButton('수용'));

    expect(screen.getByText('한 걸음 물러나 바라보기')).toBeInTheDocument();
  });
});

// ── 저장 이전 단계는 모두 되돌아간다 (2026-08-27 2차 UAT R2-05) ───────
//
// "전략 선택 단계로 들어가면 시나리오로 돌아갈 수가 없다"는 지적을 받아
// [요정 브라우즈 → 마지막 대사] · [전략 적용 → 요정 브라우즈] · [도움 평가 →
// 전략 적용] 세 계단을 열었다(핵심 요인 → 도움 평가는 2026-08-18부터 있었다).
//
// 열어도 되는 근거는 **쓰기가 한 번뿐**이라는 것이다 — clearEpisode는 마지막
// 평가에서만 돌고, 그 앞의 선택은 전부 화면 상태다. 그래서 아래 마지막 계약이
// "되돌려 다른 전략을 골라도 기록은 1건"을 함께 못 박는다. 이것이 깨지면
// 되돌리기가 곧 중복 기록이 된다.
describe('VisualNovelPlayer — 저장 이전 되돌리기 (R2-05)', () => {
  const backButton = (label: string) =>
    screen.getByRole('button', { name: new RegExp(label) });

  /** 마지막 대사까지 읽고 요정 단계에 선다. */
  const toAngels = async (user: ReturnType<typeof userEvent.setup>) => {
    renderEpisode(episode);
    await advanceScenes(user, episode.scenario.scenes.length);
  };

  it('요정 브라우즈에서 마지막 대사 장면으로 돌아가고, 읽음 상태는 남는다', async () => {
    const user = userEvent.setup();
    await toAngels(user);
    await user.click(angelChipButton('수용'));

    await user.click(backButton(COPY.player.backToScene));
    // 처음부터가 아니라 **마지막** 대사다. 처음으로 돌려보내면 되돌리기가 벌이 된다.
    expect(screen.getByText('두 번째 대사')).toBeInTheDocument();
    // 이미 읽은 문장이므로 타이핑을 다시 재생하지 않는다 → 곧바로 '다음으로'다.
    expect(screen.getByText(COPY.player.tapNext)).toBeInTheDocument();

    // 앞으로 넘기면 자연히 다시 요정 단계이고, 읽음 기록이 그대로다.
    await user.click(screen.getByText(COPY.player.tapNext));
    expect(
      within(angelChipButton('수용')).getByRole('img', { name: COPY.player.angelReadMark })
    ).toBeInTheDocument();
    expect(screen.getByText('수용 상세')).toBeInTheDocument();
  });

  it('전략 적용 단계에서 요정 브라우즈로 돌아간다', async () => {
    const user = userEvent.setup();
    await toAngels(user);
    await readAllAngels(user);
    await user.click(angelChipButton('수용'));
    await user.click(screen.getByRole('button', { name: COPY.player.selectFinal }));
    expect(screen.getByText(COPY.player.selectedStrategyLabel)).toBeInTheDocument();

    await user.click(backButton(COPY.player.backToAngels));
    // 펼쳐 두었던 조언 그대로 돌아온다 — 셋을 다시 읽게 만들지 않는다.
    expect(screen.getByText('수용 상세')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: COPY.player.selectFinal })).toBeEnabled();
  });

  it('도움 평가에서 전략 적용 단계로 돌아간다', async () => {
    const user = userEvent.setup();
    await toAngels(user);
    await readAllAngels(user);
    await user.click(angelChipButton('수용'));
    await user.click(screen.getByRole('button', { name: COPY.player.selectFinal }));
    await user.click(screen.getByRole('button', { name: COPY.player.next }));
    expect(screen.getByText(COPY.player.evalQuestion)).toBeInTheDocument();

    await user.click(backButton(COPY.player.backToApply));
    expect(screen.getByText(COPY.player.selectedStrategyLabel)).toBeInTheDocument();
  });

  it('되돌려 다른 전략을 골라도 기록은 마지막 하나뿐이다', async () => {
    const user = userEvent.setup();
    await toAngels(user);
    await readAllAngels(user);
    await user.click(angelChipButton('수용'));
    await user.click(screen.getByRole('button', { name: COPY.player.selectFinal }));

    // 마음을 바꿔 재평가로 다시 고른다
    await user.click(backButton(COPY.player.backToAngels));
    await user.click(angelChipButton('재평가'));
    await user.click(screen.getByRole('button', { name: COPY.player.selectFinal }));
    await user.click(screen.getByRole('button', { name: COPY.player.next }));
    await user.click(screen.getByRole('button', { name: COPY.player.evalYes }));
    await user.click(screen.getByRole('button', { name: '도움1' }));

    // 쓰기는 여기서 한 번뿐이고, 저장되는 값은 **마지막** 선택이다.
    expect(mocks.clearEpisode).toHaveBeenCalledTimes(1);
    expect(mocks.clearEpisode).toHaveBeenCalledWith('uid-1', episode.id, {
      selectedAngel: 'reappraisal',
      wasHelpful: true,
      selectedReason: '도움1',
    });
  });
});

// ── 요정 화면은 자리마다 한 가지만 말한다 (2026-08-27 2차 UAT R2-03) ──
//
// 한 화면에서 요정 이름과 전략명이 번갈아 세 번 나왔다: 시트 꼬리표("수용 요정")
// · 칩("아코(수용)") · 제목("아코의 전략"). 게다가 360px 폭에서는 칩이
// "포코(재평…"으로 잘려 이름조차 온전히 보이지 않았다. 이제 **칩은 이름,
// 제목은 전략 분류명**이고 꼬리표는 서지 않는다.
//
// 눈에 보이는 글자가 줄어든 만큼 낭독은 반대로 지켜야 한다 — 칩의 접근성
// 이름에는 전략명을 남긴다.
describe('VisualNovelPlayer — 요정 화면 문구 분담 (R2-03)', () => {
  /** 원고가 요정 이름을 채운 회차. 픽스처의 '수용'과 달리 실제 이름이 온다. */
  const namedEpisode: EpisodeData = {
    ...episode,
    angels: {
      accept: { ...episode.angels.accept, name: '아코' },
      reappraisal: { ...episode.angels.reappraisal, name: '포코' },
      refocus: { ...episode.angels.refocus, name: '리프' },
    },
  };

  const chip = (fairyName: string) =>
    screen
      .getAllByRole('button')
      .find((el) => el.textContent?.trim() === fairyName) as HTMLElement;

  it('칩은 이름만 들고, 전략명은 접근성 이름에 남는다', async () => {
    const user = userEvent.setup();
    renderEpisode(namedEpisode);
    await advanceScenes(user, episode.scenario.scenes.length);

    ['아코', '포코', '리프'].forEach((name) => expect(chip(name)).toBeTruthy());
    // 괄호 표기('아코(수용)')는 전략명이 그 자리에만 있는 화면(보고서·회복일기)
    // 의 것이다. 이 화면에는 제목이 따로 있다.
    expect(screen.queryByText(/아코\(/)).not.toBeInTheDocument();
    expect(chip('아코')).toHaveAttribute(
      'aria-label',
      COPY.player.angelChipSelect('아코', STRATEGY_META.accept.shortLabel)
    );
  });

  it('제목은 요정 이름이 아니라 전략 분류명이다', async () => {
    const user = userEvent.setup();
    renderEpisode(namedEpisode);
    await advanceScenes(user, episode.scenario.scenes.length);
    await user.click(chip('아코'));

    expect(
      screen.getByRole('heading', {
        name: COPY.player.strategyTitle(STRATEGY_META.accept.shortLabel),
      })
    ).toBeInTheDocument();
    // 이름은 칩이 말한다 — 제목이 다시 말하면 R2-03 이전으로 돌아간 것이다.
    expect(screen.queryByRole('heading', { name: /아코/ })).not.toBeInTheDocument();
  });
});

// ── 최종 선택 버튼의 잠금 안내 (2026-08-13) ──────────────────────────
//
// "조언을 모두 읽으면 선택할 수 있어요"를 비활성 버튼의 라벨로 넣었더니
// 절반 폭 버튼 안에서 두 줄로 접혔다. 안내를 버튼 밖으로 빼고 라벨은
// 동작명 하나로 고정한다.
describe('VisualNovelPlayer — 최종 선택 잠금 안내 (2026-08-13)', () => {
  it('조언을 다 읽기 전에는 버튼이 잠기고 이유는 버튼 밖 안내로 나온다', async () => {
    const user = userEvent.setup();
    renderEpisode(episode);

    await advanceScenes(user, episode.scenario.scenes.length);
    await user.click(angelChipButton('수용'));

    expect(screen.getByRole('button', { name: COPY.player.selectFinal })).toBeDisabled();
    expect(screen.getByText(COPY.player.readAllFirst)).toBeInTheDocument();
    // 안내가 버튼 라벨로 돌아가면 다시 두 줄로 접힌다
    expect(
      screen.queryByRole('button', { name: COPY.player.readAllFirst }),
    ).not.toBeInTheDocument();
  });

  it('셋을 모두 읽으면 안내가 사라지고 같은 버튼이 열린다', async () => {
    const user = userEvent.setup();
    renderEpisode(episode);

    await advanceScenes(user, episode.scenario.scenes.length);
    await readAllAngels(user);
    await user.click(angelChipButton('수용'));

    expect(screen.getByRole('button', { name: COPY.player.selectFinal })).toBeEnabled();
    expect(screen.queryByText(COPY.player.readAllFirst)).not.toBeInTheDocument();
  });
});

// ── 요정 그림으로 조언 열기 (2026-08-12 UAT) ─────────────────────────
//
// 안내문이 "각 요정을 눌러 조언을 들어보세요"라고 말하는데 정작 화면
// 한가운데 서 있는 그림은 <img>라 눌리지 않았다. 아래는 그림과 시트의
// 요정 칩이 **같은 입구**임을 고정한다 — 어느 쪽으로 들어가든 조언이 열리고,
// 읽음 기록도 같이 남아 최종 선택 잠금이 풀려야 한다.
// (2026-08-14 재설계로 하단 이름 버튼이 칩으로 바뀌었지만, 그림이 입구라는
//  이 계약 자체는 그대로다.)
describe('VisualNovelPlayer — 요정 그림 클릭 진입 (UAT 8/12)', () => {
  /** ANGELS 단계까지 진행한다. */
  const toAngels = async (user: ReturnType<typeof userEvent.setup>) => {
    renderEpisode(episode);
    await advanceScenes(user, episode.scenario.scenes.length);
  };

  it('그림을 누르면 그 요정의 조언 상세가 열린다', async () => {
    const user = userEvent.setup();
    await toAngels(user);

    await user.click(angelGraphicButton('수용'));

    expect(screen.getByText(COPY.player.strategyTitle('수용'))).toBeInTheDocument();
    expect(screen.getByText(episode.angels.accept.detail)).toBeInTheDocument();
  });

  it('그림에는 무엇이 열리는지 밝힌 이름이 붙는다', async () => {
    const user = userEvent.setup();
    await toAngels(user);

    // alt는 그림이 무엇인가(수용 요정), 버튼 이름은 누르면 무엇이 되는가
    expect(
      screen.getByRole('button', {
        name: COPY.player.angelGraphicSelect(STRATEGY_META.accept.angelLabel),
      }),
    ).toBeInTheDocument();
    expect(screen.getByAltText(STRATEGY_META.accept.angelLabel)).toBeInTheDocument();
  });

  it('키보드로도 열린다 — 그림이 진짜 버튼이라야 한다', async () => {
    const user = userEvent.setup();
    await toAngels(user);

    angelGraphicButton('재평가').focus();
    await user.keyboard('{Enter}');

    expect(screen.getByText(COPY.player.strategyTitle('재평가'))).toBeInTheDocument();
  });

  it('그림으로만 셋을 다 읽어도 최종 선택 잠금이 풀린다', async () => {
    const user = userEvent.setup();
    await toAngels(user);

    for (const name of ['수용', '재평가', '재초점']) {
      await user.click(angelGraphicButton(name));
    }
    await user.click(angelGraphicButton('수용'));

    expect(screen.getByRole('button', { name: COPY.player.selectFinal })).toBeEnabled();
  });
});

// ── 진행 문법 이식 (2026-08-14 플레이어 재설계) ───────────────────────
//
// 예전 플레이어는 **대사창을 클릭해야** 진행됐다. 대사창 밖을 눌러도 아무 일이
// 없었고, 키보드는 아예 없었으며, 지금 몇 번째 장면인지도 알 수 없었다. 같은 앱의
// 엔딩 플레이어는 이미 "화면 아무 데나 탭 · 좌측 30% 뒤로 · 방향키 · 상단
// 세그먼트 바"로 검증까지 끝나 있었으므로(파트 E 자체 검수), 그 문법을 옮겨왔다.
//
// 아래는 그 이식이 실제로 동작하는지를 고정한다. 특히 **무대 탭**은 회귀하기
// 쉬운 지점이다 — 시트에 onClick을 다시 달면 시트 안 클릭이 두 번 진행되고,
// 루트에서 떼면 무대 탭이 죽는다.
describe('VisualNovelPlayer — 진행 문법 (2026-08-14)', () => {
  /** 무대(배경 레이어) 아무 곳이나 탭한다 — 시트 밖이라는 것이 요점이다. */
  const tapStage = () => {
    const stage = document.querySelector<HTMLElement>('[style*="background-image"]');
    if (!stage) throw new Error('무대 배경 레이어를 찾지 못했다');
    fireEvent.click(stage);
  };

  it('시트 밖 무대를 탭해도 타이핑을 건너뛰고 다음 문장으로 넘어간다', async () => {
    renderPlayer();
    await screen.findByText(COPY.player.tapSkip);

    // 1탭 — 타이핑 스킵. 전문이 한 번에 뜬다
    tapStage();
    expect(screen.getByText('첫 번째 대사')).toBeInTheDocument();
    expect(screen.getByText(COPY.player.tapNext)).toBeInTheDocument();

    // 2탭 — 다음 문장
    tapStage();
    expect(screen.getByText(COPY.player.tapSkip)).toBeInTheDocument();
    tapStage();
    expect(screen.getByText('두 번째 대사')).toBeInTheDocument();
  });

  it('→키로 진행하고 ←키로 직전 문장에 돌아간다', async () => {
    renderPlayer();
    await screen.findByText(COPY.player.tapSkip);

    fireEvent.keyDown(window, { key: 'ArrowRight' }); // 타이핑 스킵
    fireEvent.keyDown(window, { key: 'ArrowRight' }); // 다음 문장
    fireEvent.keyDown(window, { key: 'ArrowRight' }); // 타이핑 스킵
    expect(screen.getByText('두 번째 대사')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    // 되돌아간 문장은 이미 읽은 것이므로 타이핑을 다시 재생하지 않는다
    expect(screen.getByText('첫 번째 대사')).toBeInTheDocument();
    expect(screen.getByText(COPY.player.tapNext)).toBeInTheDocument();
  });

  it('첫 문장에서는 되돌리기 영역이 아예 없다', async () => {
    renderPlayer();
    await screen.findByText(COPY.player.tapSkip);

    expect(
      screen.queryByRole('button', { name: COPY.player.prevSceneLabel }),
    ).not.toBeInTheDocument();

    // 진행이 생기면 그때 열린다
    tapStage();
    tapStage();
    expect(screen.getByRole('button', { name: COPY.player.prevSceneLabel })).toBeInTheDocument();
  });

  it('화면 좌측 30%를 누르면 직전 문장으로 돌아간다', async () => {
    const user = userEvent.setup();
    renderPlayer();
    await screen.findByText(COPY.player.tapSkip);
    await advanceDialogue(user);
    // 넘어온 문장은 다시 타이핑 중이므로 한 번 더 눌러 전문을 띄운다
    tapStage();
    expect(screen.getByText('두 번째 대사')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: COPY.player.prevSceneLabel }));

    expect(screen.getByText('첫 번째 대사')).toBeInTheDocument();
  });

  // "읽기는 탭, 결정은 버튼". 고르는 단계에서 탭이 살아 있으면 요정을 훑다가
  // 무대를 잘못 눌러 단계가 넘어가는 사고가 난다.
  it('요정 선택 단계에서는 무대 탭도 방향키도 먹지 않는다', async () => {
    const user = userEvent.setup();
    renderEpisode(episode);
    await advanceScenes(user, episode.scenario.scenes.length);

    tapStage();
    fireEvent.keyDown(window, { key: 'ArrowRight' });

    // 여전히 요정 선택 단계다 — 요정 셋이 그대로 서 있고 대사 힌트도 없다
    expect(screen.getByAltText(STRATEGY_META.accept.angelLabel)).toBeInTheDocument();
    expect(screen.queryByText(COPY.player.tapNext)).not.toBeInTheDocument();
    expect(screen.queryByText(COPY.player.tapSkip)).not.toBeInTheDocument();
  });

  it('상단 세그먼트 바가 지금 몇 번째 장면인지 알린다', async () => {
    const user = userEvent.setup();
    renderPlayer();
    await screen.findByText(COPY.player.tapSkip);

    expect(
      screen.getByRole('group', { name: COPY.player.sceneProgressLabel(1, 2) }),
    ).toBeInTheDocument();

    await advanceDialogue(user);

    expect(
      screen.getByRole('group', { name: COPY.player.sceneProgressLabel(2, 2) }),
    ).toBeInTheDocument();
  });
});

// ── 모션 축소 환경 ────────────────────────────────────────────────────
//
// 타이핑 연출은 이 화면에서 가장 큰 움직임이다. prefers-reduced-motion을 켠
// 사용자에게는 글자를 한 번에 띄우고, 첫 탭이 곧바로 다음 문장으로 가게 한다.
// (jsdom에는 matchMedia가 없어 평소에는 이 경로가 꺼져 있다.)
describe('VisualNovelPlayer — prefers-reduced-motion', () => {
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    window.matchMedia = ((query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it('타이핑 없이 전문을 바로 띄우고 힌트도 다음으로 넘어간다', async () => {
    renderPlayer();

    expect(await screen.findByText(COPY.player.tapNext)).toBeInTheDocument();
    expect(screen.getByText('첫 번째 대사')).toBeInTheDocument();
    expect(screen.queryByText(COPY.player.tapSkip)).not.toBeInTheDocument();
  });
});

// ── 요정 탐색: 전환 대신 칩 (2026-08-14) ──────────────────────────────
//
// 예전에는 셋을 비교하려면 [목록 → 상세 → 목록 → 상세 …]로 화면을 여섯 번
// 갈아야 했다(제안서 §1 P5). 지금은 조언이 같은 시트 안의 내용이고 요정 사이
// 이동은 칩이 맡는다 — 무대는 그대로 남고 시트 내용만 바뀐다.
describe('VisualNovelPlayer — 요정 칩 탐색 (2026-08-14)', () => {
  const toAngels = async (user: ReturnType<typeof userEvent.setup>) => {
    renderEpisode(episode);
    await advanceScenes(user, episode.scenario.scenes.length);
  };

  it('칩을 옮겨 타면 무대는 그대로 두고 조언만 바뀐다', async () => {
    const user = userEvent.setup();
    await toAngels(user);

    await user.click(angelChipButton('수용'));
    expect(screen.getByText(episode.angels.accept.detail)).toBeInTheDocument();

    await user.click(angelChipButton('재평가'));
    expect(screen.getByText(episode.angels.reappraisal.detail)).toBeInTheDocument();
    expect(screen.queryByText(episode.angels.accept.detail)).not.toBeInTheDocument();

    // 무대의 요정 셋은 내내 서 있다 — 화면이 갈리지 않았다는 증거
    for (const label of ['수용 요정', '재평가 요정', '재초점 요정']) {
      expect(screen.getByAltText(label)).toBeInTheDocument();
    }
  });

  it('읽은 요정의 칩에만 읽음 표시가 붙는다', async () => {
    const user = userEvent.setup();
    await toAngels(user);

    expect(
      within(angelChipButton('수용')).queryByLabelText(COPY.player.angelReadMark),
    ).not.toBeInTheDocument();

    await user.click(angelChipButton('수용'));

    expect(
      within(angelChipButton('수용')).getByLabelText(COPY.player.angelReadMark),
    ).toBeInTheDocument();
    expect(
      within(angelChipButton('재초점')).queryByLabelText(COPY.player.angelReadMark),
    ).not.toBeInTheDocument();
  });

  it('둘만 읽으면 최종 선택이 잠긴 채로 남는다', async () => {
    const user = userEvent.setup();
    await toAngels(user);

    await user.click(angelChipButton('수용'));
    await user.click(angelChipButton('재평가'));

    expect(screen.getByRole('button', { name: COPY.player.selectFinal })).toBeDisabled();
    expect(screen.getByText(COPY.player.readAllFirst)).toBeInTheDocument();
  });

  // ⚠️ 계약이 두 번 뒤집힌 자리다 (e99ab71 → 2026-08-26 사양 정정).
  //
  // 원래 계약은 "아무도 고르지 않은 동안에는 조언 자리에 안내만 서고, 최종 선택
  // 버튼은 조언을 펼친 뒤에야 나타난다"였다. e99ab71은 회의의 "요정 선택 첫
  // 스텝을 없애 달라"를 **첫 요정을 자동으로 펼치는 것**으로 옮겼는데, 사양
  // 정정으로 그 해석이 뒤집혔다 — 없애야 하는 것은 "누르기 전에는 아무것도 없는
  // 시트"이지 사용자의 첫 선택이 아니다. 자동으로 펼치면 고르지도 않은 조언이
  // 이미 열려 있어 무엇을 고르라는 화면인지가 오히려 흐려진다.
  //
  // 그래서 지금은 **상세 레이아웃이 처음부터 통째로 서 있되 비어 있다**: 칩 셋 ·
  // 조언 자리(안내문) · 잠금 안내 · 잠긴 최종 선택 버튼. 아래 셋이 그 계약이다.
  it('요정 단계에 들어서면 상세 레이아웃이 안내문과 함께 통째로 선다', async () => {
    const user = userEvent.setup();
    await toAngels(user);

    // 안내문은 조언 **자리**에 든다 — 조언은 아직 아무것도 펼쳐지지 않았다
    expect(screen.getByText('각 요정을 눌러')).toBeInTheDocument();
    expect(screen.queryByText(episode.angels.accept.detail)).not.toBeInTheDocument();
    expect(screen.queryByText(COPY.player.strategyTitle('수용'))).not.toBeInTheDocument();

    // 잠금 안내와 최종 선택 버튼은 처음부터 자리를 잡되 눌리지 않는다
    expect(screen.getByText(COPY.player.readAllFirst)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: COPY.player.selectFinal })).toBeDisabled();

    // 칩 셋도 처음부터 서 있다(어디로 갈 수 있는지를 먼저 보여 준다)
    for (const name of ['수용', '재평가', '재초점']) {
      expect(angelChipButton(name)).toBeInTheDocument();
    }
  });

  it('요정을 누르면 안내문이 그 요정의 조언으로 갈린다', async () => {
    const user = userEvent.setup();
    await toAngels(user);

    await user.click(angelChipButton('수용'));

    expect(screen.getByText(COPY.player.strategyTitle('수용'))).toBeInTheDocument();
    expect(screen.getByText(episode.angels.accept.detail)).toBeInTheDocument();
    // 안내문은 조언과 같은 자리를 나눠 쓰므로 함께 서 있지 않는다
    expect(screen.queryByText('각 요정을 눌러')).not.toBeInTheDocument();
    // 하나만 읽었으므로 잠금은 그대로다 — 셋을 모두 눌러야 열린다
    expect(screen.getByRole('button', { name: COPY.player.selectFinal })).toBeDisabled();
  });

  // 8/11 UAT("선택하지 않았는데 선택된 것처럼 보인다")의 재발 방지선.
  it('누르기 전 무대의 요정 셋은 강조 없이 그대로 선다', async () => {
    const user = userEvent.setup();
    await toAngels(user);

    // className 전체가 아니라 **강약을 만드는 클래스만** 본다 — 유휴 부유 모션의
    // 지연값이 요정마다 다르므로(2026-08-26) 전체 비교는 늘 셋으로 갈린다.
    const emphasisOf = (label: string) => {
      const cls = screen.getByAltText(label).className;
      return ['opacity-100', 'opacity-75', 'scale-90'].filter((c) => cls.includes(c)).join(' ');
    };
    const emphases = () => ['수용 요정', '재평가 요정', '재초점 요정'].map(emphasisOf);

    expect(new Set(emphases()).size).toBe(1);
    // 누른 것이 없으므로 눌림 상태인 그림도 없어야 한다
    expect(angelGraphicButton('수용')).toHaveAttribute('aria-pressed', 'false');

    // 실제로 누르면 그때부터 강약이 생긴다
    await user.click(angelGraphicButton('수용'));

    expect(new Set(emphases()).size).toBeGreaterThan(1);
    expect(angelGraphicButton('수용')).toHaveAttribute('aria-pressed', 'true');
  });
});

// ── 도움 평가 되돌리기 (2026-08-18 회의) ──────────────────────────────
//
// '도움이 되었나요?'를 고르면 곧바로 핵심 요인 화면으로 넘어갔고, 거기서
// 되돌아올 경로가 하나도 없었다. 잘못 누른 답이 그대로 저장되는 자리라
// 한 걸음만 되돌린다(EVALUATE_REASON → EVALUATE_HELPFUL).
//
// 되돌리기가 닿지 않는 곳이 둘 있다. **저장이 도는 동안**(같은 결과를 두 번
// 쓰거나, 저장 중인 답과 화면이 어긋난다)과 **EPISODE_COMPLETE**(이미 저장이
// 끝났다)다. 아래가 그 경계를 함께 고정한다.
describe('VisualNovelPlayer — 도움 평가 되돌리기 (2026-08-18)', () => {
  /** 핵심 요인 선택 화면까지 진행한다. */
  const toReason = async (user: ReturnType<typeof userEvent.setup>, helpful = true) => {
    renderEpisode(episode);
    await advanceScenes(user, episode.scenario.scenes.length);
    await readAllAngels(user);
    await user.click(angelChipButton('수용'));
    await user.click(screen.getByRole('button', { name: COPY.player.selectFinal }));
    await user.click(screen.getByRole('button', { name: COPY.player.next }));
    await user.click(
      screen.getByRole('button', { name: helpful ? COPY.player.evalYes : COPY.player.evalNo }),
    );
  };

  it('되돌리면 고른 답이 눌린 채로 도움 평가 화면이 다시 선다', async () => {
    const user = userEvent.setup();
    await toReason(user, false);
    expect(screen.getByText(COPY.player.reasonQuestion)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: COPY.player.evalBack }));

    expect(screen.getByText(COPY.player.evalQuestion)).toBeInTheDocument();
    // 답을 지우고 돌아가면 무엇을 골랐었는지가 사라져 같은 판단을 처음부터
    // 다시 해야 한다 — 되돌리기의 목적은 고쳐 쓰는 것이지 지우는 것이 아니다.
    expect(screen.getByRole('button', { name: COPY.player.evalNo })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: COPY.player.evalYes })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('되돌린 뒤 답을 바꾸면 그 답의 선택지 목록이 선다', async () => {
    const user = userEvent.setup();
    await toReason(user, false);
    expect(screen.getByRole('button', { name: '비도움1' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: COPY.player.evalBack }));
    await user.click(screen.getByRole('button', { name: COPY.player.evalYes }));

    expect(screen.getByRole('button', { name: '도움1' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '비도움1' })).not.toBeInTheDocument();

    // 바꾼 답이 저장까지 그대로 넘어간다
    await user.click(screen.getByRole('button', { name: '도움1' }));
    expect(mocks.clearEpisode).toHaveBeenCalledWith('uid-1', 'workplace-ep1', {
      selectedAngel: 'accept',
      wasHelpful: true,
      selectedReason: '도움1',
    });
  });

  it('저장 중에는 되돌아가지 않는다', async () => {
    const user = userEvent.setup();
    let finish: (ok: boolean) => void = () => {};
    mocks.clearEpisode.mockReturnValue(
      new Promise<boolean>((resolve) => {
        finish = resolve;
      }),
    );
    await toReason(user);

    await user.click(screen.getByRole('button', { name: '도움1' }));

    const back = screen.getByRole('button', { name: COPY.player.evalBack });
    expect(back).toBeDisabled();
    // 잠금이 disabled 하나에만 걸려 있어도 화면은 그대로여야 한다
    fireEvent.click(back);
    expect(screen.getByText(COPY.player.reasonQuestion)).toBeInTheDocument();
    expect(screen.queryByText(COPY.player.evalQuestion)).not.toBeInTheDocument();

    await act(async () => finish(true));
    expect(
      await screen.findByRole('button', {
        name: new RegExp(`${COPY.player.completeNext}|${COPY.player.completeCtaLast}`),
      }),
    ).toBeInTheDocument();
  });

  it('저장이 끝난 완료 화면에는 되돌리기가 없다', async () => {
    const user = userEvent.setup();
    await toReason(user);
    await user.click(screen.getByRole('button', { name: '도움1' }));
    await screen.findByRole('button', {
      name: new RegExp(`${COPY.player.completeNext}|${COPY.player.completeCtaLast}`),
    });

    // 여기서 되돌아가면 이미 쓴 결과와 화면이 어긋난다(저장 계약)
    expect(screen.queryByRole('button', { name: COPY.player.evalBack })).not.toBeInTheDocument();
  });
});

// ── 화자 이름표 (2026-08-14 · 2026-08-27 R2-03 축소) ──────────────────
//
// 원고의 `detail`(요정 조언)과 `feedback`(주인공 소감)은 화자가 다르다. 예전에는
// 둘 다 같은 회색 상자에 담겨 누가 말하는지 구분되지 않았다. 시트 어깨의 이름표가
// 그 구분을 맡는다.
//
// 2026-08-27(R2-03)에 **요정 조언 쪽 이름표를 걷어냈다.** 그 화면에는 강조된
// 요정 그림 · 칩(이름) · 제목(전략 분류명)이 이미 "지금 누구의 무슨 조언인가"를
// 세 겹으로 말하고 있어서 이름표가 네 번째 겹이었다. 이름표가 남는 자리는
// **누가 말하는지가 그림에 없는** 실행 소감(APPLY_STRATEGY)뿐이다.
describe('VisualNovelPlayer — 시트 화자 이름표 (2026-08-14)', () => {
  beforeEach(() => {
    useCharacterStore.setState({
      character: { nickname: '지수', gender: 'male', createdAt: '2026-08-08T00:00:00.000Z' },
    });
  });

  it('상황 프로즈는 내레이션이라 이름표가 없다', async () => {
    renderEpisode(episode);
    await screen.findByText(COPY.player.tapSkip);

    expect(screen.queryByText(STRATEGY_META.accept.angelLabel)).not.toBeInTheDocument();
    expect(screen.queryByText('지수')).not.toBeInTheDocument();
  });

  it('요정 조언에도 실행 소감에도 이름표가 서지 않는다', async () => {
    const user = userEvent.setup();
    renderEpisode(episode);
    await advanceScenes(user, episode.scenario.scenes.length);

    await user.click(angelChipButton('수용'));
    // R2-03 이전에는 여기서 '수용 요정'이 이름표로 섰다. 무대의 요정 그림이
    // 화자를 이미 가리키므로 걷어낸 자리다 — 되돌아오면 한 화면에서 같은 말이
    // 네 번 반복된다.
    expect(screen.queryByText(STRATEGY_META.accept.angelLabel)).not.toBeInTheDocument();

    await readAllAngels(user);
    await user.click(angelChipButton('수용'));
    await user.click(screen.getByRole('button', { name: COPY.player.selectFinal }));

    // 실행 소감 쪽 이름표(닉네임)도 같은 회차에 걷어냈다 — 무대에 주인공
    // 혼자 서 있고 시트에 '선택된 전략'까지 적혀 있어, 화면에 이미 있는
    // 사실을 한 번 더 말하는 자리였다.
    expect(screen.queryByText('지수')).not.toBeInTheDocument();
    expect(screen.queryByText(STRATEGY_META.accept.angelLabel)).not.toBeInTheDocument();
    // 그래도 그 단계라는 것은 확인해 둔다 — 이름표가 없다는 계약이
    // "화면이 아직 안 넘어갔다"로 조용히 통과하지 않게.
    expect(screen.getByText(COPY.player.selectedStrategyLabel)).toBeInTheDocument();
  });
});

// ── 무대 위를 덮는 칸은 클릭을 가로채지 않는다 (2026-08-18 검수) ───────
//
// 요정 그림 클릭은 2026-08-12에 고쳐 두었는데(위의 "요정 그림 클릭 진입"),
// 8/18 검수에서 다시 "그림은 안 눌린다"는 지적이 나왔다. 코드가 되돌아간 게
// 아니라 **위에 덮인 것**이 문제였다: 8/14 재설계가 넣은 여백 칸(시트를 아래로
// 미는 용도)이 무대(absolute z-0)와 같은 z-index면서 DOM에서 뒤에 와, 무대
// 위에 그려지며 히트 테스트를 가로챘다.
//
// jsdom에는 레이아웃도 히트 테스트도 없어서 클릭 테스트로는 절대 잡히지
// 않는다(그래서 4개월 가까이 조용했다). 그러니 여기서는 클릭 대신 **구조**를
// 고정한다 — 무대를 덮는 칸은 pointer-events를 갖지 않는다.
describe('VisualNovelPlayer — 무대를 덮는 여백 칸 (2026-08-18)', () => {
  it('시트를 밀어 두는 여백 칸은 클릭을 통과시킨다', async () => {
    const { container } = renderEpisode(episode);
    await screen.findByText(COPY.player.tapSkip);

    const root = container.firstElementChild!;
    // 여백 칸은 루트의 직속 자식 중 flex-1로 남은 자리를 먹는 유일한 칸이다.
    const spacers = Array.from(root.children).filter((el) =>
      el.className.split(/\s+/).includes('flex-1'),
    );
    expect(spacers).toHaveLength(1);
    expect(spacers[0].className.split(/\s+/)).toContain('pointer-events-none');
  });
});

// ── 조언 박스는 높이가 변하지 않는다 (2026-08-18 검수) ────────────────
//
// 셋째 요정을 읽는 순간 '조언을 모두 읽으면 선택할 수 있어요'가 사라지면서
// 시트가 한 줄 + gap만큼 줄어들어 박스가 들썩였다. 문구만 비우고 자리는 남긴다.
describe('VisualNovelPlayer — 조언 잠금 안내의 자리 예약 (2026-08-18)', () => {
  it('셋을 다 읽어도 안내가 서 있던 줄은 그대로 남는다', async () => {
    const user = userEvent.setup();
    renderEpisode(episode);
    await advanceScenes(user, episode.scenario.scenes.length);

    await user.click(angelChipButton('수용'));
    const noticeBefore = screen.getByText(COPY.player.readAllFirst);
    // 안내는 최종 선택 버튼 바로 위 줄이다 — 그 자리가 사라지는 것이 문제였다.
    expect(noticeBefore.nextElementSibling).toBe(
      screen.getByRole('button', { name: COPY.player.selectFinal }),
    );

    await readAllAngels(user);
    await user.click(angelChipButton('수용'));

    // 문구는 사라지되(잠금이 풀렸으니) 줄 자체는 남아 있어야 한다
    expect(screen.queryByText(COPY.player.readAllFirst)).not.toBeInTheDocument();
    const noticeAfter = screen.getByRole('button', { name: COPY.player.selectFinal })
      .previousElementSibling;
    expect(noticeAfter).not.toBeNull();
    expect(noticeAfter!.className.split(/\s+/)).toContain('invisible');
    // 빈 문자열은 줄 상자를 만들지 못한다 — nbsp 한 칸이 높이를 지킨다
    expect(noticeAfter!.textContent).toBe('\u00A0');
  });
});
