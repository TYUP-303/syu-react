// src/components/scenario/player/PlayerStage.test.tsx
// @vitest-environment jsdom
//
// 무대의 **배역 사이징·해석** 계약 (2026-08-18 UAT 후속).
//
// 두 가지를 고정한다.
//
//  ① 배역 높이는 인원수와 무관하게 하나다.
//     예전에는 슬롯 1(=1인 씬)만 h-[66%]이고 양옆(=2인 씬)은 h-[58%]였고,
//     거기에 <img>가 flex 아이템이라 폭이 눌리면 object-contain 때문에
//     **그려지는 높이까지** 따라 줄었다(실측 464px → 266px). 이 파일은
//     "1인·2인·3인 모두 같은 높이 클래스 + 폭 제약 없음"을 못 박는다.
//
//  ② 연인 영역의 상대역은 반대 성별 백설이이고 좌우 반전된다.
//     경로 규칙 자체는 assetUrls.test.ts가 고정한다. 여기서 확인하는 것은
//     "무대가 그 규칙을 실제로 화면에 붙이는가" — 특히 반전 클래스는 렌더
//     레벨에만 있으므로 여기서만 잡힌다.
//
//  ③ 배역은 시트 위로 올라서되 그 양에 상한(cap)이 있다 (2026-08-18 추가).
//     지면선을 올리면 대사 박스 위로 인물이 서지만, 세로가 짧은 프레임에서
//     같은 양을 올리면 머리가 상단 바를 뚫는다. 그래서 `12% + min(120px, 15%)`
//     꼴이고, 이 파일은 **식의 형태와 그 식이 만드는 수치**를 함께 고정한다.
//
//  ④ 배역이 가시 무대를 다 채우지 않는다 (2026-08-18 실플레이 지적 후속).
//     치비 에셋은 그림이 캔버스의 94%라, 높이 통일·지면선 상향과 겹치자 2인
//     씬에서 인물 둘이 무대를 통째로 메웠다(h-[66%] 시절 점유율 71~113%).
//     클래스 값만 보아서는 "얼마나 꽉 찼는지"를 알 수 없으므로 ③과 같은
//     방식으로 프레임별 점유율을 직접 계산해 **상한과 하한을 함께** 건다.
//     하한이 있는 이유: 위로만 조이면 다음 지적이 "너무 작다"가 된다.
//
//  ⑤ 요정 3인의 세로 자리는 대기·열람에서 같다 (2026-08-18 실플레이 지적).
//     예전에는 대기 bottom-30% · 열람 bottom-47%라 요정이 하단에 깔려 있다가
//     조언을 펼쳐야 중앙으로 올라왔다. 값을 하나로 합쳤고, 여기서는 "같다"와
//     "그 자리가 실제로 화면 중앙쯤이다"를 함께 고정한다.
//
//  ⑥ 그 자리는 **시트가 아무리 자라도** 시트 위다 (2026-08-27 2차 UAT R2-02).
//     ⑤의 47%는 "시트가 가장 높이 올라오는 상태 ≈340px"에서 역산한 값인데,
//     340은 px이고 47은 비율이라 두 값은 프레임 높이 723px 언저리에서 갈린다.
//     375×667·360×740에서는 시트가 47%를 넘어서서 요정 셋의 하반신이 통째로
//     시트 뒤로 들어갔다. 이제 바닥선이 `max(47%, 시트 + 틈)`이므로, 여기서는
//     **시트 높이를 넣어 가며** 그 식이 만드는 자리를 프레임별로 계산한다.
//
// jsdom에는 레이아웃이 없으므로 픽셀이 아니라 **클래스**로 판정한다. 높이가
// 인원수에 따라 갈리는 회귀는 결국 클래스가 갈리는 것으로 나타나기 때문에
// 이 판정으로 충분하다. ③④⑤만은 클래스를 읽는 데서 그치지 않고 그 안의 CSS
// 값을 꺼내 프레임 크기별로 직접 계산한다 — cap이나 점유율은 "특정 화면에서만"
// 드러나는 성질이라 클래스가 있는지 보는 것만으로는 값이 맞는지 알 수 없다.

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, within, act, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import PlayerStage from './PlayerStage';
import type { PlayStep } from './useEpisodePlayer';
import type { EpisodeData, SceneData } from '../../../api/scenarioMockData';
import { collectEpisodeImageUrls, type CharacterGender } from './assetUrls';
import { COPY } from '../../../constants/copy';
import { STRATEGY_META, type StrategyKey } from '../../../constants/strategy';
import { versionedAsset } from '../../../utils/assetVersion';

afterEach(cleanup);

/** 기대 URL. 버전 문자열 자체는 utils/assetVersion이 소유한다. */
const char = (file: string) => versionedAsset(`/scenario/characters/${file}`);

const scene = (chars: string[]): SceneData => ({
  type: '상황',
  text: '대사',
  bg: 'my_room.png',
  chars,
});

const renderStage = (
  chars: string[],
  { gender = 'female', domain }: { gender?: CharacterGender; domain?: string } = {}
) =>
  render(
    <PlayerStage
      step="SITUATION"
      scene={scene(chars)}
      characterGender={gender}
      domain={domain}
      pressedAngelKey={null}
      selectedAngelKey={null}
      readAngels={new Set()}
      onAngelSelect={() => {}}
    />
  );

const sprites = () => screen.getAllByAltText('등장 캐릭터');

/** 배역 <img>가 실제로 들고 있는 높이 관련 클래스만 뽑는다. */
const heightClasses = (el: HTMLElement) =>
  el.className
    .split(/\s+/)
    .filter((c) => c.startsWith('h-') || c.startsWith('max-h-'))
    .sort()
    .join(' ');

/**
 * 배역 층(CastLayer). 스프라이트는 칸(CastSlot) 안에 있고 칸이 층 안에 있으므로
 * 두 단계를 거슬러 올라간다. 이 저장소에는 data-testid 관례가 없어 구조로 짚는다
 * — 칸을 없애면 여기서 먼저 깨지는데, 칸이야말로 "높이가 인원수와 무관하다"를
 * 떠받치는 구조라 그 신호는 오히려 있어야 한다.
 */
const castLayer = (sprite: HTMLElement) => sprite.parentElement!.parentElement!;

const classList = (el: HTMLElement) => el.className.split(/\s+/).filter(Boolean);

/**
 * `h-[52%]` · `max-h-[400px]`처럼 임의값 클래스에서 숫자만 꺼낸다. 아래 계산이
 * 소스의 실제 값을 따라가게 해서, 상수를 고치면 테스트도 같이 움직이게 한다.
 */
const arbitraryValue = (el: HTMLElement, prefix: string, unit: string) => {
  const found = classList(el).find(
    (c) => c.startsWith(`${prefix}-[`) && c.endsWith(`${unit}]`)
  );
  if (!found) throw new Error(`${prefix}-[…${unit}] 클래스를 찾지 못했습니다: ${el.className}`);
  return Number(found.slice(prefix.length + 2, -(unit.length + 1)));
};

/** 층이 들고 있는 지면선 클래스 하나. 둘 이상이면 규칙이 갈린 것이므로 실패시킨다. */
const groundClass = (layer: HTMLElement) => {
  const found = classList(layer).filter((c) => c.startsWith('bottom-'));
  expect(found).toHaveLength(1);
  return found[0];
};

/**
 * `bottom-[calc(12%_+_min(120px,15%))]`를 세 조각으로 푼다. 형태가 어긋나면
 * (예: cap이 사라지면) 곧바로 던진다 — "상한이 있다"가 이 식의 존재 이유이므로
 * 모양이 무너진 것 자체가 회귀다.
 */
const groundParts = (ground: string) => {
  const parsed = ground.match(/^bottom-\[calc\((\d+)%_\+_min\((\d+)px,(\d+)%\)\)\]$/);
  if (!parsed) throw new Error(`지면선이 "바닥값 + min(lift, cap)" 형태가 아닙니다: ${ground}`);
  return { basePct: Number(parsed[1]), liftPx: Number(parsed[2]), capPct: Number(parsed[3]) };
};

/** 실제로 적용되는 lift(px). 짧은 프레임에서는 cap이 이 값을 깎는다. */
const appliedLiftPx = (ground: string, frameHeight: number) => {
  const { liftPx, capPct } = groundParts(ground);
  return Math.min(liftPx, (capPct / 100) * frameHeight);
};

/** 프레임 높이 H에서 배역이 서는 지면선(프레임 바닥 기준 px). */
const groundLinePx = (ground: string, frameHeight: number) =>
  (groundParts(ground).basePct / 100) * frameHeight + appliedLiftPx(ground, frameHeight);

/**
 * 배역 **상자**의 높이(px). 층(%) 안의 % + px 상한이라는 두 겹을 소스 값 그대로
 * 읽어 계산한다 — 상수를 고치면 아래 계약들이 함께 움직이게 하려는 것이다.
 */
const charBoxHeight = (layer: HTMLElement, sprite: HTMLElement, frameHeight: number) =>
  Math.min(
    (arbitraryValue(sprite, 'h', '%') / 100) *
      ((arbitraryValue(layer, 'h', '%') / 100) * frameHeight),
    arbitraryValue(sprite, 'max-h', 'px')
  );

/**
 * 대사 시트 상단(프레임 바닥 기준 px). 시트는 프레임 높이를 따라가지 않고 내용
 * 높이로 서므로 상수다 — 바깥 pb-5 20 + 테두리 2 + 카드 pt-4/pb-3.5 30 +
 * 본문 5줄 예약 122 + 진행 힌트 26.
 */
const SHEET_TOP_PX = 200;

/** PlayerTopBar 실측 근사. 배역 머리끝이 이 띠를 넘어서면 안 된다. */
const TOP_BAR_PX = 70;

/**
 * 요정 단계 시트의 **실측 높이**(px). 2026-08-27에 브라우저에서 잰 값이며
 * 360·375·430 어느 폭에서도 같았다 — 칩·안내문·잠금 안내·버튼이 전부 고정
 * 높이라 폭을 타지 않기 때문이다.
 *
 *   · collapsed 조언을 아직 펼치지 않은 상태(안내문 + 잠긴 버튼)
 *   · expanded  가장 긴 조언(scenario_angels.csv의 *_DETAIL 최대 135자)이
 *               6줄로 접힌 상태. 화자 이름표가 함께 서므로 그 높이도 들어 있다.
 *
 * 시트는 프레임의 58%(SHEET_MAX_HEIGHT)를 넘지 못하므로, 아래 계약은 이 두 값과
 * **그 상한**을 함께 돌려 세 지점 모두에서 요정이 살아 있는지를 본다.
 */
const ANGEL_SHEET_PX = { collapsed: 281, expanded: 381 };

/** 시트가 프레임에서 차지할 수 있는 최대 세로 (VisualNovelPlayer.SHEET_MAX_HEIGHT). */
const SHEET_MAX_RATIO = 0.58;

/**
 * `max(47%, calc(var(--player-sheet-h, 0px) + 10px))` 꼴의 바닥선을 푼다.
 *
 * 클래스가 아니라 style로 붙는 이유는 소스 쪽 주석에 있다(Tailwind는 이 길이의
 * 임의값을 정적으로 훑지 못한다). 형태가 어긋나면 곧바로 던진다 — `max()`가
 * 사라지는 것이 곧 "시트가 낮은 프레임에서도 요정이 움직인다"는 회귀이고,
 * 반대로 `var()`가 사라지는 것이 이번 수정이 통째로 풀린 상태다.
 *
 * `rest`에는 동행 요정이 덧붙이는 지면선 환산항이 들어온다(아래 참조).
 */
const floorParts = (value: string) => {
  const parsed = value.match(
    /^max\((\d+(?:\.\d+)?)%, calc\(var\(--player-sheet-h, 0px\) \+ (\d+)px(.*)\)\)$/
  );
  if (!parsed) throw new Error(`바닥선이 "max(바닥값, 시트 + 틈)" 형태가 아닙니다: ${value}`);
  return { basePct: Number(parsed[1]), gapPx: Number(parsed[2]), rest: parsed[3] };
};

/** 프레임 높이 H · 시트 높이 S에서 요정 행이 서는 바닥선(px). */
const angelFloorPx = (row: HTMLElement, frameHeight: number, sheetPx: number) => {
  const { basePct, gapPx } = floorParts(row.style.bottom);
  return Math.max((basePct / 100) * frameHeight, sheetPx + gapPx);
};

/**
 * 프레임 (W, H)에서 요정 **그림**이 차지하는 세로 구간(프레임 바닥 기준 px).
 * 행은 flex items-end라 그림이 행 바닥에 붙고, 그림은 object-contain이라
 * 칸 너비가 곧 크기를 정한다. 캔버스 아래쪽 여백(20px)만큼 떠 있는 것까지 센다.
 */
const fairyBand = (
  row: HTMLElement,
  img: HTMLElement,
  [W, H]: readonly [number, number],
  sheetPx = 0
) => {
  const rowBottom = angelFloorPx(row, H, sheetPx);
  const rowHeight = H - (arbitraryValue(row, 'top', '%') / 100) * H - rowBottom;
  // 행 안쪽 = 프레임 폭 − px-3 좌우 24 − gap-1 두 칸 8. 셋이 균등하게 나눈다.
  const slotWidth = (W - 24 - 8) / 3;
  const imgWidth = (arbitraryValue(img, 'w', '%') / 100) * slotWidth;
  // 자연 비율대로 서되 말풍선을 뺀 남은 높이를 넘지 못한다(max-h-full + shrink).
  const boxHeight = Math.min(
    (imgWidth * FAIRY_CANVAS.height) / FAIRY_CANVAS.width,
    rowHeight - FAIRY_BUBBLE_PX
  );
  const scale = Math.min(imgWidth / FAIRY_CANVAS.width, boxHeight / FAIRY_CANVAS.height);
  const feet = rowBottom + FAIRY_CANVAS.bottomPad * scale;
  return {
    feet,
    head: feet + FAIRY_CANVAS.contentHeight * scale,
    drawnHeight: FAIRY_CANVAS.contentHeight * scale,
    bubbleTop: rowBottom + boxHeight + FAIRY_BUBBLE_PX,
  };
};

/** 흔한 프레임 높이(100dvh). 600은 가장 짧은 쪽 — cap이 걸리는 구간이다. */
const FRAME_HEIGHTS = [600, 667, 740, 800, 844, 932];

/**
 * 흔한 프레임 크기(가로 × 세로). 가로는 MobileWrapper의 max-w 430px에서 잘린다.
 * 요정 행 계산은 칸 너비를 알아야 하므로 높이만으로는 부족해 이 쌍을 쓴다.
 */
const FRAMES: readonly (readonly [number, number])[] = [
  [320, 568],
  [360, 640],
  [375, 667],
  [390, 844],
  [412, 915],
  [430, 932],
];

/**
 * 인물 에셋의 캔버스 대비 **그림** 높이 (2026-08-18 알파 실측, 29장 전부 동일:
 * 896×1200 캔버스에 그림 1129px). 클래스가 정하는 것은 상자 높이이므로, 화면에
 * 실제로 보이는 크기를 따지려면 이 비율을 곱해야 한다.
 */
const CHAR_CONTENT_RATIO = 1129 / 1200;

/**
 * 같은 실측의 **머리 위 여백** (896×1200 캔버스의 위쪽 투명 52px). 상자의 윗변이
 * 곧 머리끝이 아니므로, "요정을 주인공 머리 높이에 띄운다"를 따지려면 이만큼
 * 내려와야 진짜 머리끝이다.
 */
const CHAR_TOP_PAD_RATIO = 52 / 1200;

/** 요정 에셋 실측 — 597×720 캔버스, 그림 높이 472px, 발밑 여백 20px (3종 동일). */
const FAIRY_CANVAS = { width: 597, height: 720, contentHeight: 472, bottomPad: 20 };

/**
 * 요정 머리 위 말풍선이 차지하는 세로 (py-1 8 + 점 4 + 테두리 2 + mb-1.5 6).
 * 요정 그림의 위치가 아니라 **위쪽 여유**를 따질 때만 쓴다.
 */
const FAIRY_BUBBLE_PX = 20;

describe('PlayerStage — 배역 높이는 인원수와 무관하다', () => {
  it('1인 씬(슬롯 1)과 2인 씬(슬롯 0·2)의 높이 클래스가 같다', () => {
    renderStage(['', 'baeksul_f_default.png', '']);
    const solo = heightClasses(sprites()[0]);
    expect(solo).not.toBe('');
    cleanup();

    renderStage(['baeksul_f_default.png', '', 'colleague_default.png']);
    const duo = sprites();
    expect(duo).toHaveLength(2);
    duo.forEach((el) => expect(heightClasses(el)).toBe(solo));
  });

  // CSV에는 3인 씬이 0건이지만 파서·렌더 경로는 살아 있다. 콘텐츠가 생겨도
  // 같은 원칙(높이 유지, 칸만 좁아짐)으로 서야 한다.
  it('3인 씬도 같은 높이로 선다', () => {
    renderStage(['baeksul_f_default.png', '', 'colleague_default.png']);
    const duo = heightClasses(sprites()[0]);
    cleanup();

    renderStage(['baeksul_f_default.png', 'friend_default.png', 'colleague_default.png']);
    const trio = sprites();
    expect(trio).toHaveLength(3);
    trio.forEach((el) => expect(heightClasses(el)).toBe(duo));
  });

  // 높이가 같아도 폭 제약이 남아 있으면 flex-shrink가 그림을 다시 줄인다
  // (예전 회귀의 진짜 원인). 폭은 자연 폭 그대로여야 한다.
  it('폭 제약이 없어야 그려지는 높이가 줄지 않는다', () => {
    renderStage(['baeksul_f_default.png', '', 'colleague_default.png']);
    sprites().forEach((el) => {
      expect(el).toHaveClass('w-auto');
      expect(el).toHaveClass('max-w-none');
      // 폭이 눌린 만큼 높이를 깎던 장본인
      expect(el.className).not.toContain('object-contain');
    });
  });

  it('빈 슬롯은 그리지 않는다', () => {
    renderStage(['', 'baeksul_f_default.png', '']);
    expect(sprites()).toHaveLength(1);
  });
});

describe('PlayerStage — 연인 영역 상대역', () => {
  it('여성 주인공의 상대역은 남성 백설이이고 좌우 반전된다', () => {
    renderStage(['baeksul_f_default.png', '', 'lover_default.png'], {
      gender: 'female',
      domain: '연인1',
    });
    const [hero, partner] = sprites();

    expect(hero.getAttribute('src')).toBe(char('baeksul_f_date_default.png'));
    expect(hero.className).not.toContain('-scale-x-100');

    expect(partner.getAttribute('src')).toBe(char('baeksul_m_date_default.png'));
    expect(partner).toHaveClass('-scale-x-100');
  });

  it('남성 주인공의 상대역은 여성 백설이다', () => {
    renderStage(['baeksul_f_default.png', '', 'lover_tired.png'], {
      gender: 'male',
      domain: '연인6',
    });
    const [hero, partner] = sprites();

    expect(hero.getAttribute('src')).toBe(char('baeksul_m_date_default.png'));
    // lover_tired의 tired는 백설이에게 없는 표정 → default 폴백
    expect(partner.getAttribute('src')).toBe(char('baeksul_f_date_default.png'));
    expect(partner).toHaveClass('-scale-x-100');
  });

  it('연인 영역 밖의 조연은 반전하지 않는다', () => {
    renderStage(['baeksul_f_default.png', '', 'colleague_default.png'], { domain: '직장1' });
    sprites().forEach((el) => expect(el.className).not.toContain('-scale-x-100'));
  });

  // 전용 lover 에셋을 지운 뒤(2026-08-26)로는 도메인이 연인이 아니어도 같은
  // 백설이로 치환된다. 다만 **반전은 연인 영역과 무관**하다 — 마주봄은 도메인이
  // 아니라 '무대에 같은 그림이 둘 서 있는가'가 정하기 때문이다.
  it('다른 영역의 lover_*도 백설이로 치환된다', () => {
    renderStage(['baeksul_f_default.png', '', 'lover_default.png'], { domain: '일상3' });
    const partner = sprites()[1];
    expect(partner.getAttribute('src')).toBe(char('baeksul_m_date_default.png'));
  });
});

// ── 의상: 영역이 옷을 정한다 (2026-08-18) ───────────────────────────────
//
// 매핑 자체는 assetUrls.test.ts가 고정한다. 여기서 확인하는 것은 "무대가
// 도메인을 실제로 흘려 보내는가" — prop 배선이 끊기면 조용히 기본복으로만
// 돌아가고, 그 회귀는 경로 테스트로는 절대 잡히지 않는다.
describe('PlayerStage — 백설이 의상', () => {
  it('직장·취업준비는 정장, 연인은 데이트 차림, 일상은 기본복이다', () => {
    const heroSrc = (domain?: string) => {
      renderStage(['', 'baeksul_f_sad.png', ''], { gender: 'female', domain });
      const src = sprites()[0].getAttribute('src');
      cleanup();
      return src;
    };

    expect(heroSrc('직장2')).toBe(char('baeksul_f_suit_sad.png'));
    // 취업준비는 배경이 정한다 (R2-18): 테스트 씬의 배경은 my_room이라 기본복.
    expect(heroSrc('취업준비7')).toBe(char('baeksul_f_sad.png'));
    expect(heroSrc('연인4')).toBe(char('baeksul_f_date_sad.png'));
    expect(heroSrc('일상5')).toBe(char('baeksul_f_sad.png'));
    // 도메인을 받지 못하면 기본복이다 — 배선이 끊긴 상태의 모습이기도 하다.
    expect(heroSrc(undefined)).toBe(char('baeksul_f_sad.png'));
  });

  it('취업준비는 면접장 배경일 때만 정장을 입는다 (R2-18)', () => {
    render(
      <PlayerStage
        step="SITUATION"
        scene={{ ...scene(['', 'baeksul_f_sad.png', '']), bg: 'interview_room.png' }}
        characterGender="female"
        domain="취업준비1"
        pressedAngelKey={null}
        selectedAngelKey={null}
        readAngels={new Set()}
        onAngelSelect={() => {}}
      />
    );
    expect(sprites()[0].getAttribute('src')).toBe(char('baeksul_f_suit_sad.png'));
  });

  it('전략 적용 이후 화면에서도 같은 의상을 입고 있다', () => {
    render(
      <PlayerStage
        step="APPLY_STRATEGY"
        scene={scene(['baeksul_f_sad.png', '', 'lover_default.png'])}
        characterGender="male"
        domain="연인1"
        pressedAngelKey={null}
        selectedAngelKey="accept"
        readAngels={new Set()}
        onAngelSelect={() => {}}
      />
    );
    // 의상은 date 그대로다 — 이 테스트가 지키는 것은 그 한 가지다.
    // 표정이 sad가 아닌 것은 의도된 것으로, 전략 적용 이후 단계에서는 주인공이
    // 회복 표정으로 선다(2026-08-26). 그쪽 계약은 아래 전용 절이 따로 잡는다.
    expect(screen.getByAltText('등장 캐릭터').getAttribute('src')).toBe(
      char('baeksul_m_date_default.png')
    );
  });
});

// ── 마주봄: 반전은 자리가 정한다 (2026-08-18) ───────────────────────────
//
// 에셋 18종 실측 결과 전부 정면이라 뒤집어도 향하는 방향이 바뀌지 않는다.
// 그래서 반전은 "같은 그림 둘이 복제 인간처럼 서는 것"을 깨는 용도이며,
// **배역이 아니라 자리**를 따른다. 무대가 확인할 것은 그 판단이 화면의
// 클래스로 옮겨졌는가이다 — 반전 클래스는 렌더 레벨에만 있다.
describe('PlayerStage — 마주봄 반전', () => {
  it('1인 씬의 주인공은 반전하지 않는다', () => {
    renderStage(['', 'baeksul_f_default.png', ''], { domain: '연인1' });
    expect(sprites()[0].className).not.toContain('-scale-x-100');
  });

  it('상대역이 왼쪽에 서면 반전도 오른쪽 인물에게 넘어간다', () => {
    renderStage(['lover_default.png', '', 'baeksul_f_default.png'], {
      gender: 'female',
      domain: '연인2',
    });
    const [left, right] = sprites();

    expect(left.getAttribute('src')).toBe(char('baeksul_m_date_default.png'));
    expect(left.className).not.toContain('-scale-x-100');
    expect(right.getAttribute('src')).toBe(char('baeksul_f_date_default.png'));
    expect(right).toHaveClass('-scale-x-100');
  });
});

// ── 캐시 버스터: 프리로드와 렌더가 같은 URL이어야 한다 ──────────────────
//
// /scenario/**는 max-age 7일로 서빙되므로 버전 쿼리가 붙는다. 한쪽에만 붙으면
// 브라우저에게는 다른 URL이라 **프리로드가 통째로 헛돈다** — 게이트는 열렸는데
// 화면은 그때부터 받기 시작하는, 프리로드를 넣기 전보다 나쁜 상태가 된다.
describe('PlayerStage — 렌더 URL은 프리로드 URL과 같다', () => {
  const episode = {
    scenario: {
      no: '21',
      domain: '연인1',
      reactionType: '인지',
      title: '연락이 없는 연인',
      scenes: [scene(['baeksul_f_default.png', '', 'lover_default.png'])],
    },
  } as unknown as EpisodeData;

  it('배역·요정 그림이 모두 프리로드 목록 안의 URL이다', () => {
    (['male', 'female'] as const).forEach((gender) => {
      const preloaded = new Set(collectEpisodeImageUrls(episode, gender));

      render(
        <PlayerStage
          step="SITUATION"
          scene={episode.scenario.scenes[0]}
          characterGender={gender}
          domain={episode.scenario.domain}
          pressedAngelKey={null}
          selectedAngelKey={null}
          readAngels={new Set()}
          onAngelSelect={() => {}}
        />
      );
      sprites().forEach((el) => {
        expect(el.getAttribute('src')).toContain('?v=');
        expect(preloaded).toContain(el.getAttribute('src'));
      });
      cleanup();

      render(
        <PlayerStage
          step="ANGELS"
          scene={episode.scenario.scenes[0]}
          characterGender={gender}
          domain={episode.scenario.domain}
          pressedAngelKey={null}
          selectedAngelKey={null}
          readAngels={new Set()}
          onAngelSelect={() => {}}
        />
      );
      (['accept', 'reappraisal', 'refocus'] as StrategyKey[]).forEach((key) => {
        const src = screen.getByAltText(STRATEGY_META[key].angelLabel).getAttribute('src');
        expect(src).toContain('?v=');
        expect(preloaded).toContain(src);
      });
      cleanup();
    });
  });
});

describe('PlayerStage — 전략 적용 이후의 무대', () => {
  it('주인공은 SITUATION과 같은 높이로 남고 요정이 곁에 선다', () => {
    renderStage(['', 'baeksul_f_default.png', '']);
    const inScene = heightClasses(sprites()[0]);
    cleanup();

    render(
      <PlayerStage
        step="APPLY_STRATEGY"
        scene={scene(['baeksul_f_default.png', '', 'lover_default.png'])}
        characterGender="female"
        domain="연인1"
        pressedAngelKey={null}
        selectedAngelKey="accept"
        readAngels={new Set()}
        onAngelSelect={() => {}}
      />
    );

    const hero = screen.getByAltText('등장 캐릭터');
    expect(heightClasses(hero)).toBe(inScene);
    expect(hero.getAttribute('src')).toContain('baeksul');
    // 조연(연인)은 남지 않는다 — "백설이 혼자가 아니다" 지적의 방지선
    expect(screen.getAllByAltText('등장 캐릭터')).toHaveLength(1);
    expect(screen.getByAltText('수용 요정')).toBeInTheDocument();
  });
});

describe('PlayerStage — 배역은 시트 위로 올라서되 상한이 있다', () => {
  const renderApplyStep = () =>
    render(
      <PlayerStage
        step="APPLY_STRATEGY"
        scene={scene(['baeksul_f_default.png', '', 'lover_default.png'])}
        characterGender="female"
        domain="연인1"
        pressedAngelKey={null}
        selectedAngelKey="accept"
        readAngels={new Set()}
        onAngelSelect={() => {}}
      />
    );

  it('지면선은 바닥값에 lift를 더한 값이고, lift에는 상한이 걸려 있다', () => {
    renderStage(['', 'baeksul_f_default.png', '']);
    // 형태가 어긋나면 groundParts가 던진다 — 그 자체가 이 테스트의 판정이다.
    const { basePct, liftPx, capPct } = groundParts(groundClass(castLayer(sprites()[0])));
    expect(basePct).toBeGreaterThan(0);
    expect(liftPx).toBeGreaterThan(0);
    expect(capPct).toBeGreaterThan(0);
  });

  it('흔한 프레임 높이에서 배역이 대사 시트 위에 선다', () => {
    renderStage(['', 'baeksul_f_default.png', '']);
    const ground = groundClass(castLayer(sprites()[0]));

    // cap이 놀고 lift가 온전히 적용되는 구간(요즘 폰의 세로 길이)이 기준이다.
    // 여기서 시트를 넘지 못하면 애초에 이 수정이 성립하지 않는다.
    [800, 844, 932].forEach((frameHeight) => {
      expect(groundLinePx(ground, frameHeight)).toBeGreaterThan(SHEET_TOP_PX);
    });
  });

  it('세로가 짧은 프레임에서는 cap이 lift를 깎는다', () => {
    renderStage(['', 'baeksul_f_default.png', '']);
    const ground = groundClass(castLayer(sprites()[0]));
    const { liftPx } = groundParts(ground);

    // 짧은 쪽에서만 걸리는 장치라야 한다 — 늘 걸리면 그냥 %이고,
    // 한 번도 안 걸리면 그냥 px이다. 둘 다 "상한선"이 아니다.
    expect(appliedLiftPx(ground, 600)).toBeLessThan(liftPx);
    expect(appliedLiftPx(ground, 932)).toBe(liftPx);
  });

  it('어떤 프레임 높이에서도 머리끝이 상단 바를 뚫지 않는다', () => {
    renderStage(['', 'baeksul_f_default.png', '']);
    const layer = castLayer(sprites()[0]);
    const ground = groundClass(layer);

    FRAME_HEIGHTS.forEach((frameHeight) => {
      const headTop =
        groundLinePx(ground, frameHeight) + charBoxHeight(layer, sprites()[0], frameHeight);
      expect(headTop).toBeLessThanOrEqual(frameHeight - TOP_BAR_PX);
    });
  });

  it('지면선을 올려도 층 높이는 그대로다 — 배역 크기가 따라 줄면 안 된다', () => {
    renderStage(['', 'baeksul_f_default.png', '']);
    const layer = castLayer(sprites()[0]);

    // 높이를 못박아 두지 않으면 top/bottom 한 쌍이 위치와 높이를 같이 정하게 되고,
    // 지면선을 올린 만큼 층이 얇아져 h-[66%]인 배역까지 작아진다.
    expect(arbitraryValue(layer, 'h', '%')).toBe(88);
    // top까지 주면 세 값이 과잉 구속되어 bottom(지면선)이 무시된다.
    expect(classList(layer)).not.toContain('top-0');
    expect(classList(layer)).not.toContain('inset-0');
  });

  it('스프라이트는 칸 바닥에 붙고, 지면선은 층이 소유한다', () => {
    renderStage(['baeksul_f_default.png', '', 'colleague_default.png']);
    sprites().forEach((el) => {
      expect(el).toHaveClass('bottom-0');
      // 배역마다 따로 올리면 인원수·단계별로 지면선이 갈린다.
      expect(classList(el).filter((c) => c.startsWith('bottom-'))).toEqual(['bottom-0']);
    });
  });

  it('전략 적용 이후 화면도 같은 지면선·높이를 쓴다', () => {
    renderStage(['', 'baeksul_f_default.png', '']);
    const inScene = castLayer(sprites()[0]).className;
    cleanup();

    renderApplyStep();
    const hero = screen.getByAltText('등장 캐릭터');
    expect(castLayer(hero).className).toBe(inScene);

    // 동행 요정도 같은 층에 서므로 지면선은 여전히 층 하나가 소유한다.
    const fairy = screen.getByAltText('수용 요정');
    expect(castLayer(fairy)).toBe(castLayer(hero));

    // ⚠️ 요정만은 그 지면선에 **발을 붙이지 않는다** (2026-08-26 회의). 예전에는
    // 주인공과 같이 bottom-0이었는데, 요정은 주인공의 30% 남짓 키라 그 상태로는
    // 정강이 옆에 섰다. 얼마나 띄우는지는 "동행 요정은 주인공 눈높이에" 절이 잰다.
    expect(fairy).not.toHaveClass('bottom-0');
  });
});

// ── 치비 전환 후 축소: 무대를 다 채우지 않는다 (2026-08-18 실플레이 지적) ────
//
// "캐릭터가 너무 크다"는 지적은 클래스 하나로는 확인되지 않는다 — 같은 h-[52%]도
// 에셋의 그림 비율과 프레임 높이에 따라 화면을 채우는 정도가 달라지기 때문이다.
// 그래서 **상단 바와 대사 시트 사이의 가시 무대**를 분모로 놓고 점유율을 잰다.
// h-[66%] 시절의 실측 점유율은 71~113%였고(짧은 프레임에서는 무대를 넘겼다),
// 지금 값은 57~78% 구간에 있다.
describe('PlayerStage — 배역이 가시 무대를 다 채우지 않는다', () => {
  /** 상단 바 아래 ~ 대사 시트 위. 배역이 온전히 보일 수 있는 세로 구간. */
  const visibleStagePx = (frameHeight: number) => frameHeight - TOP_BAR_PX - SHEET_TOP_PX;

  it('가시 무대 점유율이 프레임마다 상한과 하한 사이에 있다', () => {
    renderStage(['', 'baeksul_f_default.png', '']);
    const layer = castLayer(sprites()[0]);
    const sprite = sprites()[0];

    FRAME_HEIGHTS.forEach((frameHeight) => {
      // 클래스가 정하는 것은 상자 높이다. 화면에 보이는 크기는 그림 비율을 곱한 값.
      const drawn = CHAR_CONTENT_RATIO * charBoxHeight(layer, sprite, frameHeight);
      const occupancy = drawn / visibleStagePx(frameHeight);

      // 상한 — 여기를 넘으면 다시 "무대를 인물이 메운다"가 된다. 2인 씬이면
      // 같은 크기가 둘이므로 체감은 이 값보다 훨씬 크다.
      expect(occupancy).toBeLessThanOrEqual(0.85);
      // 하한 — 위로만 조이면 다음 지적은 "너무 작다"가 된다.
      expect(occupancy).toBeGreaterThanOrEqual(0.5);
    });
  });

  it('동행 요정은 주인공이 줄어든 만큼 함께 줄어든다', () => {
    render(
      <PlayerStage
        step="APPLY_STRATEGY"
        scene={scene(['baeksul_f_default.png', '', 'lover_default.png'])}
        characterGender="female"
        domain="연인1"
        pressedAngelKey={null}
        selectedAngelKey="accept"
        readAngels={new Set()}
        onAngelSelect={() => {}}
      />
    );
    const hero = screen.getByAltText('등장 캐릭터');
    const fairy = screen.getByAltText(STRATEGY_META.accept.angelLabel);

    // 둘은 같은 층에 같은 방식으로 서므로 클래스 값끼리 바로 비교할 수 있다.
    // 한쪽만 만지면 "요정이 갑자기 커졌다"가 되므로 비율에 띠를 두른다.
    const pctRatio = arbitraryValue(fairy, 'h', '%') / arbitraryValue(hero, 'h', '%');
    const maxRatio = arbitraryValue(fairy, 'max-h', 'px') / arbitraryValue(hero, 'max-h', 'px');
    expect(pctRatio).toBeGreaterThan(0.4);
    expect(pctRatio).toBeLessThan(0.5);
    expect(maxRatio).toBeGreaterThan(0.35);
    expect(maxRatio).toBeLessThan(0.5);
  });
});

// ── 요정 행의 세로 자리 (2026-08-18 실플레이 지적) ──────────────────────
//
// "요정들이 화면 하단에 있다가, 선택하면 그제서야 중앙으로 올라온다. 처음부터
// 중앙에 떠 있었으면 좋겠다." 예전 값(대기 bottom-30% · 열람 bottom-47%)의
// 그림 세로 중심은 각각 프레임의 36.7~38.3%와 53.7~55.3%였다 — 지적 그대로다.
// 값을 하나로 합쳤고, 여기서는 "두 상태가 같다"와 "그 자리가 중앙쯤이다"를
// 함께 고정한다. 앞엣것만 고정하면 둘 다 하단으로 내려도 통과한다.
describe('PlayerStage — 요정 행은 처음부터 중앙에 선다', () => {
  const renderAngelRow = (active: StrategyKey | null) =>
    render(
      <PlayerStage
        step={active ? 'ANGEL_DETAIL' : 'ANGELS'}
        scene={scene([])}
        characterGender="female"
        pressedAngelKey={active}
        selectedAngelKey={null}
        readAngels={new Set()}
        onAngelSelect={() => {}}
      />
    );

  const fairyImage = () => screen.getByAltText(STRATEGY_META.accept.angelLabel);

  /** 요정 행(그림 → 버튼 → 행). 버튼 구조가 무너지면 여기서 먼저 깨진다. */
  const angelRow = () => {
    const button = fairyImage().closest('button');
    if (!button) throw new Error('요정 그림이 버튼 안에 있지 않다 — 눌리지 않는 그림');
    return button.parentElement as HTMLElement;
  };


  it('대기 상태와 조언 열람 상태의 행 위치가 같다', () => {
    renderAngelRow(null);
    const idle = { className: angelRow().className, bottom: angelRow().style.bottom };
    cleanup();

    renderAngelRow('accept');
    // 위치가 갈리면 그 차이가 곧 "눌러야 올라온다"는 그 점프다. 2026-08-27부터
    // 바닥선이 style에 있으므로 클래스만 보면 통과해 버린다 — 둘 다 본다.
    expect(angelRow().className).toBe(idle.className);
    expect(angelRow().style.bottom).toBe(idle.bottom);
    // ⚠️ 이 계약이 잡는 것은 **무대가 step에 따라 다른 값을 쓰지 않는다**까지다.
    // 시트가 실제로 자라면 두 상태의 자리는 화면에서 갈린다(그것이 R2-02 수정의
    // 목적이다). 대신 시트 쪽이 관측 최고치만 흘려 행이 되내려오지 않게 하며,
    // 그 규칙은 VisualNovelPlayer가 소유한다.
  });

  it('대기 상태에서 이미 그림의 세로 중심이 화면 중앙쯤이다', () => {
    renderAngelRow(null);
    const row = angelRow();
    const img = fairyImage();

    FRAMES.forEach((frame) => {
      const { feet, head } = fairyBand(row, img, frame);
      const centerRatio = (feet + head) / 2 / frame[1];
      // 예전 대기 값(bottom-30%)은 0.367~0.383이었다. 중앙 언저리로 못 박는다.
      expect(centerRatio).toBeGreaterThan(0.45);
      expect(centerRatio).toBeLessThan(0.6);
    });
  });

  it('머리 위 말풍선이 상단 바를 침범하지 않는다', () => {
    renderAngelRow(null);
    const row = angelRow();
    const img = fairyImage();

    FRAMES.forEach((frame) => {
      expect(fairyBand(row, img, frame).bubbleTop).toBeLessThanOrEqual(frame[1] - TOP_BAR_PX);
    });
  });
});

// ── 요정 행은 시트가 자라도 시트 위다 (2026-08-27 2차 UAT R2-02) ────────
//
// 위 ⑤의 47%는 **비율**이고 시트 높이는 **px**이라, 프레임이 짧아질수록 둘이
// 어긋난다. 375×667 실측에서 시트는 조언을 펼치면 380.8px(=57.1%)까지 자라
// 요정 셋의 하반신을 통째로 가렸다. 바닥선을 `max(47%, 시트 + 틈)`으로 바꿨고,
// 여기서는 그 식이 **세 가지 시트 높이 × 흔한 프레임**에서 만드는 자리를 잰다.
//
// 프레임 크기가 약분되지 않는 계약이라(px과 %가 섞인다) FRAMES를 전부 돈다.
describe('PlayerStage — 요정 행은 시트가 자라도 시트 위다 (R2-02)', () => {
  const renderAngelRow = () =>
    render(
      <PlayerStage
        step="ANGEL_DETAIL"
        scene={scene([])}
        characterGender="female"
        pressedAngelKey="accept"
        selectedAngelKey={null}
        readAngels={new Set()}
        onAngelSelect={() => {}}
      />
    );

  const angelRow = () =>
    screen.getByAltText(STRATEGY_META.accept.angelLabel).closest('button')!.parentElement!;

  it('바닥선이 "max(바닥값, 시트 + 틈)" 형태다', () => {
    renderAngelRow();
    const parts = floorParts(angelRow().style.bottom);
    // 바닥값이 사라지면 시트가 낮은 프레임에서도 요정이 시트를 따라 움직인다.
    expect(parts.basePct).toBe(47);
    // 틈이 0이면 발끝이 시트 테두리에 닿는다.
    expect(parts.gapPx).toBeGreaterThan(0);
    // 행 몫에는 지면선 환산항이 붙지 않는다 — 무대 좌표가 곧 프레임 좌표다.
    expect(parts.rest).toBe('');
  });

  it('시트가 낮은 프레임에서는 예전 자리가 그대로다', () => {
    renderAngelRow();
    const row = angelRow();
    // 430×932에서 요정 시트(최대 381px)는 47%(438px)에 미치지 못한다 — 이
    // 프레임에서 자리가 1px이라도 움직이면 8/18에 합의한 배치가 바뀐 것이다.
    expect(angelFloorPx(row, 932, ANGEL_SHEET_PX.expanded)).toBeCloseTo(0.47 * 932, 5);
  });

  it('어떤 프레임에서도 요정 셋이 시트 위에 온전히 선다', () => {
    renderAngelRow();
    const row = angelRow();
    const img = screen.getByAltText(STRATEGY_META.accept.angelLabel);

    FRAMES.forEach(([W, H]) => {
      // 시트는 프레임의 58%를 넘지 못한다(그 위로는 시트 **안에서** 스크롤한다).
      // 실측값을 그대로 쓰면 320×568 같은 짧은 프레임에 67%짜리 시트를 세우게 돼
      // 화면에 없는 상태를 계약으로 박게 된다.
      const sheets = [ANGEL_SHEET_PX.collapsed, ANGEL_SHEET_PX.expanded, SHEET_MAX_RATIO * H].map(
        (px) => Math.min(px, SHEET_MAX_RATIO * H)
      );
      sheets.forEach((sheetPx) => {
        const band = fairyBand(row, img, [W, H], sheetPx);
        // ① 발끝이 시트 윗변보다 위에 있다 = 가려지는 부분이 없다.
        expect(band.feet).toBeGreaterThan(sheetPx);
        // ② 위로 밀린 만큼 상단 바를 뚫지 않는다(말풍선까지 포함).
        expect(band.bubbleTop).toBeLessThanOrEqual(H - TOP_BAR_PX);
        // ③ 남은 무대가 좁아져도 요정이 알아볼 수 없게 작아지지는 않는다.
        //    가장 빡빡한 조합(시트 58% + 320×568)에서 그림 높이가 프레임의
        //    15.1%다. 12%를 하한으로 둔다.
        expect(band.drawnHeight / H).toBeGreaterThan(0.12);
      });
    });
  });
});

// ── 요정 단계에는 스크림이 한 겹 더 얹힌다 (2026-08-18 회의) ──────────
//
// 배경 스크림은 step과 무관한 그라데이션 한 장이었다(surface 3/8/45%). 요정
// 셋이 배경 한가운데 서는 단계에서는 그 정도로 대비가 나지 않아 "요정이 배경에
// 묻힌다"는 지적을 받았다. 그렇다고 공용 그라데이션을 짙게 하면 상황 대사
// 화면까지 함께 어두워진다 — 8/18 검수에서 걷어낸 "배경이 전체적으로 뿌옇다"가
// 그대로 되돌아온다. 그래서 **요정 단계에만** 한 겹을 더 얹는다.
//
// 색은 surface 계열이 아니라 검정 알파 토큰이다. --color-surface는 밝은 회백이라
// 비율을 올릴수록 어두워지는 게 아니라 하얗게 뿌옇다.
describe('PlayerStage — 요정 단계의 추가 스크림 (2026-08-18)', () => {
  const renderStep = (step: PlayStep) =>
    render(
      <PlayerStage
        step={step}
        scene={scene(['baeksul_f_default.png'])}
        characterGender="female"
        pressedAngelKey={null}
        selectedAngelKey={null}
        readAngels={new Set()}
        onAngelSelect={() => {}}
      />
    );

  const angelScrims = (container: HTMLElement) =>
    container.querySelectorAll('.bg-scenario-scrim-angel');

  it('요정 단계에서만 한 겹이 더 선다', () => {
    for (const step of ['ANGELS', 'ANGEL_DETAIL'] as PlayStep[]) {
      const { container } = renderStep(step);
      expect(angelScrims(container)).toHaveLength(1);
      cleanup();
    }

    for (const step of [
      'SITUATION',
      'APPLY_STRATEGY',
      'EVALUATE_HELPFUL',
      'EVALUATE_REASON',
      'EPISODE_COMPLETE',
    ] as PlayStep[]) {
      const { container } = renderStep(step);
      expect(angelScrims(container)).toHaveLength(0);
      cleanup();
    }
  });

  // ⚠️ 이 파일이 확인할 수 있는 것은 **클래스가 붙는가**까지다. 토큰
  // (--color-scenario-scrim-angel)이 index.css에서 사라지면 Tailwind가
  // 유틸리티를 만들지 않아 화면에서만 조용히 실패하는데, vitest는 CSS import를
  // 빈 문자열로 처리하고 jsdom에는 스타일시트가 붙지 않아 여기서는 잡히지
  // 않는다(node:fs로 원문을 읽는 길은 이 프로젝트에 @types/node가 없어 타입
  // 체크에서 막힌다). 토큰을 옮기거나 지울 때는 `npm run build` 후 dist의
  // CSS에 `.bg-scenario-scrim-angel`이 남아 있는지 함께 보라.
  it('추가 스크림은 요정 행보다 DOM 앞에 있다 — 요정을 덮지 않는다', () => {
    const { container } = renderStep('ANGELS');
    const scrim = angelScrims(container)[0];
    const fairyRow = screen
      .getByAltText(STRATEGY_META.accept.angelLabel)
      .closest('button')!.parentElement!;

    // 둘 다 z-0이므로 순서가 곧 쌓임 순서다. 뒤로 가면 요정이 스크림에 잠긴다.
    expect(scrim.compareDocumentPosition(fairyRow)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });
});

// ── 요정 행: 어디를 눌러야 하는지, 어디를 아직 안 들었는지 (2026-08-18 검수) ──
//
// 두 지적을 함께 고정한다.
//  ① "각 요정을 눌러 조언을 들어보세요"라고 해 놓고 어느 요정이 남았는지는
//     무대가 알려 주지 않았다 → 아직 듣지 않은 요정 위에 말풍선을 띄운다.
//     읽고 나면 감추되 **자리는 남긴다** — 지우면 그만큼 요정이 내려앉아
//     조언을 들을 때마다 무대가 들썩인다.
//  ② 하나를 펼치면 나머지가 opacity-40이라 "있는지도 모르게" 흐려졌다 →
//     흐림의 목적은 지우는 것이 아니라 앞세우는 것이므로 하한을 못 박는다.
describe('PlayerStage — 요정 행의 미열람 표시와 흐림', () => {
  const renderAngels = ({
    active = null,
    read = [],
  }: { active?: StrategyKey | null; read?: StrategyKey[] } = {}) =>
    render(
      <PlayerStage
        step="ANGELS"
        scene={scene([])}
        characterGender="female"
        pressedAngelKey={active}
        selectedAngelKey={null}
        readAngels={new Set<string>(read)}
        onAngelSelect={() => {}}
      />
    );

  /** 무대에 선 요정 그림 버튼 — 그림에서 거슬러 올라간다. */
  const fairyButton = (key: StrategyKey) => {
    const button = screen.getByAltText(STRATEGY_META[key].angelLabel).closest('button');
    if (!button) throw new Error(`요정 그림(${key})이 버튼 안에 있지 않다 — 눌리지 않는 그림`);
    return button;
  };

  it('아직 듣지 않은 요정에만 말풍선이 붙는다', () => {
    renderAngels({ read: ['accept'] });

    expect(
      within(fairyButton('accept')).queryByLabelText(COPY.player.angelUnreadMark),
    ).not.toBeInTheDocument();
    for (const key of ['reappraisal', 'refocus'] as StrategyKey[]) {
      expect(
        within(fairyButton(key)).getByLabelText(COPY.player.angelUnreadMark),
      ).toBeInTheDocument();
    }
  });

  it('읽은 뒤에도 말풍선 자리는 남는다 — 요정이 내려앉지 않는다', () => {
    renderAngels({ read: ['accept'] });
    const bubble = fairyButton('accept').firstElementChild!;

    // 감추기만 한다. 흐름에서 빼면(hidden) 그 높이만큼 요정이 아래로 내려앉는다.
    expect(bubble.className).toContain('invisible');
    expect(bubble.className.split(/\s+/)).not.toContain('hidden');
  });

  it('하나를 펼쳐도 나머지 요정이 알아볼 만큼은 남는다', () => {
    renderAngels({ active: 'accept' });

    const dimmed = screen.getByAltText(STRATEGY_META.refocus.angelLabel);
    const matched = dimmed.className.match(/opacity-(\d+)/);
    if (!matched) throw new Error(`흐림 클래스를 찾지 못했습니다: ${dimmed.className}`);
    // 40은 "있는지도 모르게" 흐려졌던 값이다. 70 아래로는 다시 내려가지 않는다.
    expect(Number(matched[1])).toBeGreaterThanOrEqual(70);
    expect(Number(matched[1])).toBeLessThan(100);
  });

  it('아무도 고르지 않은 동안에는 셋이 완전히 같은 모습이다', () => {
    renderAngels();

    const fairies = (['accept', 'reappraisal', 'refocus'] as StrategyKey[]).map((key) =>
      screen.getByAltText(STRATEGY_META[key].angelLabel),
    );
    // 유휴 부유의 **지연**만은 일부러 셋이 다르다(2026-08-26) — 그것까지 같아지면
    // 셋이 한 몸처럼 움직여 "아직 고르지 않았다"는 신호가 사라진다. 여기서 보는
    // 것은 강약(또렷함/흐림)이므로 지연 클래스는 빼고 견준다.
    const withoutDelay = (img: HTMLElement) =>
      classList(img)
        .filter((c) => !c.startsWith('[animation-delay:'))
        .join(' ');
    expect(new Set(fairies.map(withoutDelay)).size).toBe(1);
  });

  // 유휴 부유 모션 — "아직 고르지 않았다"를 그림이 말한다 (조세현 UAT 제안).
  it('요정 셋이 서로 다른 지연으로 부유한다', () => {
    renderAngels();

    const delays = (['accept', 'reappraisal', 'refocus'] as StrategyKey[]).map((key) => {
      const img = screen.getByAltText(STRATEGY_META[key].angelLabel);
      expect(img.className).toContain('animate-fairy-float');
      const found = classList(img).find((c) => c.startsWith('[animation-delay:'));
      if (!found) throw new Error(`부유 지연 클래스를 찾지 못했습니다: ${img.className}`);
      return found;
    });

    // 셋이 같은 위상으로 뜨면 한 덩어리로 움직여 개별 선택지로 읽히지 않는다.
    expect(new Set(delays).size).toBe(3);
  });
});

// ── 동행 요정은 주인공 눈높이에 떠 있다 (2026-08-26 회의) ──────────────
//
// 전략을 고른 뒤 주인공 옆에 서는 요정이 **지면선에 발을 붙이고** 있었다
// (SPRITE_BASE의 bottom-0). 요정은 인물의 30% 남짓 키라 그 상태로는 주인공의
// 정강이 옆에 서고, "함께 있다"가 아니라 "발밑에 뭔가 있다"로 읽힌다.
//
// 그래서 띄운다. 목표는 요정 그림의 **세로 중심**이 주인공 머리끝에서 25~35%
// 내려온 자리 — 머리~어깨 옆이다. jsdom에는 레이아웃이 없으므로 이 파일의
// 다른 계약과 같은 방식으로, 클래스에서 값을 꺼내 알파 실측 비율과 함께
// 직접 계산한다. 층(CastLayer) 높이를 1로 두면 프레임 크기가 약분되므로
// 프레임을 돌 필요가 없다.
describe('PlayerStage — 동행 요정은 주인공 눈높이에 떠 있다 (2026-08-26)', () => {
  const renderApply = () =>
    render(
      <PlayerStage
        step="APPLY_STRATEGY"
        scene={scene(['baeksul_f_default.png'])}
        characterGender="female"
        pressedAngelKey={null}
        selectedAngelKey="accept"
        readAngels={new Set()}
        onAngelSelect={() => {}}
      />
    );

  const companion = () => screen.getByAltText(STRATEGY_META.accept.angelLabel);

  it('바닥 정렬이 아니라 위로 띄우는 오프셋을 든다', () => {
    renderApply();

    // bottom-0이 남아 있으면 두 bottom 유틸이 겹쳐 어느 쪽이 이길지가
    // Tailwind의 정렬 순서에 달린다 — 그 상태를 계약으로 막는다.
    expect(classList(companion())).not.toContain('bottom-0');
    expect(floorParts(companion().style.bottom).basePct).toBeGreaterThan(0);
  });

  it('그림 중심이 주인공 머리에서 25~35% 내려온 자리에 온다', () => {
    renderApply();
    const hero = screen.getByAltText('등장 캐릭터');
    const fairy = companion();

    const heroBox = arbitraryValue(hero, 'h', '%') / 100;
    const fairyBox = arbitraryValue(fairy, 'h', '%') / 100;
    // 시트가 낮을 때(=바닥값이 이기는 자리)의 관계를 본다. 시트가 그보다 높이
    // 올라오면 요정이 함께 올라가지만, 그때는 주인공도 시트에 잠기는 중이라
    // "머리~어깨 옆"이라는 이 계약의 기준선 자체가 화면에 남지 않는다.
    const lift = floorParts(fairy.style.bottom).basePct / 100;

    const heroHead = heroBox * (1 - CHAR_TOP_PAD_RATIO);
    const heroContent = heroBox * CHAR_CONTENT_RATIO;
    const fairyContent = fairyBox * (FAIRY_CANVAS.contentHeight / FAIRY_CANVAS.height);
    const fairyCenter =
      lift + fairyBox * (FAIRY_CANVAS.bottomPad / FAIRY_CANVAS.height) + fairyContent / 2;

    const dropFromHead = (heroHead - fairyCenter) / heroContent;
    expect(dropFromHead).toBeGreaterThanOrEqual(0.25);
    expect(dropFromHead).toBeLessThanOrEqual(0.35);

    // 자리만 맞고 크기가 어긋나면 "동행하는 작은 요정"이라는 관계가 무너진다.
    expect(fairyContent / heroContent).toBeGreaterThanOrEqual(0.3);
    expect(fairyContent / heroContent).toBeLessThanOrEqual(0.4);
  });

  it('동행 요정도 같은 부유 모션을 든다', () => {
    renderApply();
    expect(companion().className).toContain('animate-fairy-float');
  });

  // ── 시트를 넘어서는 프레임에서는 요정도 비켜선다 (2026-08-27 R2-02) ──
  //
  // 요정 선택 화면과 같은 문제가 이 단계에도 있다. 다만 이 요정은 **배역 층
  // 안**에 있어서, 프레임 좌표로 재 온 시트 높이와 더하려면 지면선을 층 좌표로
  // 옮겨야 한다(12% ÷ 0.88 = 13.636% · 15% ÷ 0.88 = 17.045%). 그 환산이
  // 어긋나면 요정이 엉뚱한 높이에 서는데 **화면에서만** 드러나므로 여기서
  // CAST_GROUND에서 다시 계산해 맞춰 본다.
  const companionRest = (rest: string) => {
    const parsed = rest.match(/^ - (\d+(?:\.\d+)?)% - min\((\d+)px, (\d+(?:\.\d+)?)%\)$/);
    if (!parsed) throw new Error(`동행 요정 바닥선에 지면선 환산항이 없습니다: "${rest}"`);
    return { basePct: Number(parsed[1]), liftPx: Number(parsed[2]), capPct: Number(parsed[3]) };
  };

  it('지면선 환산이 CAST_GROUND와 어긋나지 않는다', () => {
    renderApply();
    const layer = castLayer(screen.getByAltText('등장 캐릭터'));
    const ground = groundParts(groundClass(layer));
    const layerRatio = arbitraryValue(layer, 'h', '%') / 100;
    const rest = companionRest(floorParts(companion().style.bottom).rest);

    expect(rest.basePct * layerRatio).toBeCloseTo(ground.basePct, 1);
    expect(rest.liftPx).toBe(ground.liftPx); // px은 좌표계를 타지 않는다
    expect(rest.capPct * layerRatio).toBeCloseTo(ground.capPct, 1);
  });

  it('가장 높은 시트 앞에서도 요정 상자가 시트 위에 온다', () => {
    renderApply();
    const layer = castLayer(screen.getByAltText('등장 캐릭터'));
    const layerRatio = arbitraryValue(layer, 'h', '%') / 100;
    const floor = floorParts(companion().style.bottom);
    const rest = companionRest(floor.rest);

    FRAMES.forEach(([, H]) => {
      const layerHeight = layerRatio * H;
      const groundPx = groundLinePx(groundClass(layer), H);
      const sheetPx = SHEET_MAX_RATIO * H;
      const inLayer = Math.max(
        (floor.basePct / 100) * layerHeight,
        sheetPx +
          floor.gapPx -
          ((rest.basePct / 100) * layerHeight +
            Math.min(rest.liftPx, (rest.capPct / 100) * layerHeight))
      );
      // 층 안의 자리를 프레임 좌표로 되돌린 값이 시트 윗변을 넘어야 한다.
      expect(groundPx + inLayer).toBeGreaterThanOrEqual(sheetPx + floor.gapPx - 0.5);
    });
  });
});

// ── 전략을 적용한 뒤의 주인공 표정 (2026-08-26 회의) ───────────────────
//
// CSV의 씬 표정은 **상황**의 것이라 대개 sad다. 그런데 무대는 전략 적용 이후
// (APPLY_STRATEGY · EVALUATE_* · EPISODE_COMPLETE)에도 마지막 씬의 chars를 그대로
// 쓰기 때문에, "대처법을 써서 나아졌다"는 장면에서 주인공이 계속 울상이었다.
//
// CSV는 건드리지 않는다(프로덕션 원문은 Firestore에서 오므로 렌더 레벨이 유일하게
// 안전한 자리다 — 의상 치환과 같은 이유다). 무대가 그 단계에서만 표정 토큰을
// default로 갈아 끼우고, 성별·의상·영역 규칙은 그대로 통과한다.
describe('PlayerStage — 전략 적용 뒤 주인공은 회복 표정으로 선다 (2026-08-26)', () => {
  const renderStep = (step: PlayStep, charFile: string, domain?: string) =>
    render(
      <PlayerStage
        step={step}
        scene={scene([charFile])}
        characterGender="female"
        domain={domain}
        pressedAngelKey={null}
        selectedAngelKey="accept"
        readAngels={new Set()}
        onAngelSelect={() => {}}
      />
    );

  const heroSrc = () => screen.getByAltText('등장 캐릭터').getAttribute('src');

  it('CSV가 sad여도 전략 적용 이후에는 default로 뜬다', () => {
    for (const step of [
      'APPLY_STRATEGY',
      'EVALUATE_HELPFUL',
      'EVALUATE_REASON',
      'EPISODE_COMPLETE',
    ] as PlayStep[]) {
      renderStep(step, 'baeksul_f_sad.png');
      expect(heroSrc()).toBe(char('baeksul_f_default.png'));
      cleanup();
    }
  });

  it('상황 단계의 표정은 그대로 sad다 — 치환은 그 뒤 단계에만 걸린다', () => {
    renderStep('SITUATION', 'baeksul_f_sad.png');
    expect(heroSrc()).toBe(char('baeksul_f_sad.png'));
  });

  it('표정만 갈아 끼운다 — 영역이 정한 의상은 그대로다', () => {
    renderStep('APPLY_STRATEGY', 'baeksul_f_sad.png', '연인1');
    expect(heroSrc()).toBe(char('baeksul_f_date_default.png'));
  });

  it('프리로드 목록에도 그 default 파일이 들어 있다', () => {
    // 렌더 URL과 프리로드 URL이 어긋나면 이 한 장만 게이트 뒤에 늦게 뜬다.
    // 씬 1이 default인 회차가 대부분이라 대개는 이미 들어 있지만, 마지막
    // 씬까지 전부 sad인 회차에서는 그렇지 않다 — 아래가 그 경우다.
    const sadOnly = {
      scenario: {
        domain: '직장1',
        scenes: [scene(['baeksul_f_sad.png']), scene(['baeksul_f_sad.png'])],
      },
    } as unknown as EpisodeData;

    (['male', 'female'] as const).forEach((gender) => {
      const preloaded = new Set(collectEpisodeImageUrls(sadOnly, gender));
      const token = gender === 'male' ? 'm' : 'f';
      expect(preloaded).toContain(char(`baeksul_${token}_suit_default.png`));
    });
  });
});

// ─────────────────────────────────────────────────────────────────────
// ⑥ 씬이 넘어가도 같은 인물은 같은 노드로 남는다 (2026-08-27 R2-04)
//
// 2차 UAT 지적: "같은 캐릭터가 유지되는 상황임에도 클릭하는 순간 캐릭터가
// 순간적으로 없어졌다가 다시 나타난다." 원인은 배역 <img>의 React key였다.
// `${slot}-${charName}`은 표정 토큰과 슬롯을 둘 다 물고 있어서, 같은 인물이
// 이어져도 둘 중 하나만 달라지면 노드가 통째로 새로 만들어졌다. 새 <img>는
// 트리에 들어가는 순간 그림이 붙어 있지 않으므로(naturalWidth 0) 그 파일이
// 메모리 캐시에 없으면 그 프레임이 빈다.
//
// 아래는 그 계약을 **노드 동일성**으로 못 박는다 — 클래스나 src가 아니라
// "같은 DOM 노드인가"가 이 회귀의 유일한 관측점이다. 480씬 실측으로 같은
// 인물이 이어지는 전환 377건 중 258건이 예전 key에서 리마운트됐고, 그중
// 172건은 화면상 자리까지 그대로였다.
// ─────────────────────────────────────────────────────────────────────
describe('PlayerStage — 씬이 넘어가도 같은 인물은 같은 노드로 남는다 (R2-04)', () => {
  const at = (chars: string[], bg = 'meeting_room.png') => (
    <PlayerStage
      step="SITUATION"
      scene={{ type: '상황', text: '대사', bg, chars }}
      characterGender="female"
      pressedAngelKey={null}
      selectedAngelKey={null}
      readAngels={new Set()}
      onAngelSelect={() => {}}
    />
  );

  it('표정만 바뀌면 리마운트하지 않고 src만 갈린다', () => {
    const { rerender } = render(at(['baeksul_f_worried.png', '', '']));
    const before = screen.getByAltText('등장 캐릭터');
    const srcBefore = before.getAttribute('src');

    rerender(at(['baeksul_f_sad.png', '', '']));

    const after = screen.getByAltText('등장 캐릭터');
    expect(after).toBe(before);
    expect(after.getAttribute('src')).not.toBe(srcBefore);
    expect(after.getAttribute('src')).toBe(char('baeksul_f_sad.png'));
  });

  it('같은 파일이 다른 슬롯으로 옮겨가도 노드가 살아남는다', () => {
    // CSV에서 가장 억울한 사례다 — 그림도 화면상 자리도 그대로인데(1인 씬은
    // 칸이 flex-1이라 슬롯 번호와 무관하게 가운데다) 예전 key만 달라졌다.
    const { rerender } = render(at(['', 'baeksul_f_worried.png', '']));
    const before = screen.getByAltText('등장 캐릭터');

    rerender(at(['baeksul_f_worried.png', '', '']));

    expect(screen.getByAltText('등장 캐릭터')).toBe(before);
  });

  it('인물이 빠져도 남는 인물의 노드는 그대로다', () => {
    const { rerender } = render(at(['baeksul_f_sad.png', '', 'boss_stern.png']));
    const [heroBefore] = screen.getAllByAltText('등장 캐릭터');

    rerender(at(['', 'baeksul_f_worried.png', '']));

    const remaining = screen.getAllByAltText('등장 캐릭터');
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toBe(heroBefore);
  });

  it('새로 들어온 인물만 새 노드로 마운트된다', () => {
    const { rerender } = render(at(['baeksul_f_worried.png', '', 'colleague_default.png']));
    const [heroBefore, sideBefore] = screen.getAllByAltText('등장 캐릭터');

    // 주인공은 표정만 바뀌고, 옆자리는 동료 → 상사로 사람이 바뀐다.
    rerender(at(['baeksul_f_sad.png', '', 'boss_stern.png']));

    const [heroAfter, sideAfter] = screen.getAllByAltText('등장 캐릭터');
    expect(heroAfter).toBe(heroBefore);
    expect(sideAfter).not.toBe(sideBefore);
  });

  it('등장 페이드는 배역 <img>가 든다 — 마운트될 때만 도는 성질이 곧 조건이다', () => {
    // animate-fadeIn은 `animation: … both`라 마운트 시 한 번만 재생된다.
    // 위 테스트들이 보장하는 "이어지는 인물은 언마운트되지 않는다"와 합쳐지면,
    // 별도의 상태 없이 "새 인물만 페이드인"이 성립한다.
    renderStage(['baeksul_f_worried.png', '', '']);
    expect(classList(sprites()[0])).toContain('animate-fadeIn');
  });

  it('배역 <img>에는 transition을 걸지 않는다 — 반전이 애니메이션으로 새지 않게', () => {
    // 노드가 살아남게 된 뒤로는 transition-all이 실제로 발동한다. 마주봄 반전
    // (-scale-x-100)이 씬 사이에 풀리거나 걸릴 때 인물이 좌우로 뒤집히는
    // 300ms 애니메이션이 생기므로 걷어냈다.
    renderStage(['baeksul_f_worried.png', '', '']);
    expect(classList(sprites()[0]).filter((c) => c.startsWith('transition'))).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────
// ⑦ 배경은 준비된 뒤 크로스페이드로 갈린다 (2026-08-27 R2-07)
//
// 배역 <img>와 달리 CSS background-image에는 "새 그림이 준비될 때까지 옛
// 그림을 그린다"는 장치가 없다. 준비 안 된 URL로 바꾸면 그 프레임이 그냥
// 빈다. 그래서 배경만은 두 겹을 겹쳐, 새 장이 decode를 마친 뒤에야 옛 장
// 위에 얹고 페이드한다.
//
// jsdom은 이미지를 실제로 받지 않고 decode()도 구현하지 않으므로, 준비 신호를
// 가짜 Image로 대신 준다. 스텁 없이는 "준비 전에는 위층이 서지 않는다"를
// 확인할 수 없다 — 그 상태가 영원히 유지되기 때문이다.
// ─────────────────────────────────────────────────────────────────────
describe('PlayerStage — 배경은 준비된 뒤 크로스페이드로 갈린다 (R2-07)', () => {
  const bgLayers = (container: HTMLElement) =>
    Array.from(container.querySelectorAll<HTMLElement>('div[style*="background-image"]'));

  const bgOf = (el: HTMLElement) => el.style.backgroundImage;

  const at = (bg: string) => (
    <PlayerStage
      step="SITUATION"
      scene={{ type: '상황', text: '대사', bg, chars: ['baeksul_f_worried.png', '', ''] }}
      characterGender="female"
      pressedAngelKey={null}
      selectedAngelKey={null}
      readAngels={new Set()}
      onAngelSelect={() => {}}
    />
  );

  /** decode()를 손으로 풀 수 있는 가짜 Image. 준비 전/후를 갈라 보기 위한 것이다. */
  let releaseDecode: (() => void) | null = null;
  beforeEach(() => {
    releaseDecode = null;
    class FakeImage {
      src = '';
      decode() {
        return new Promise<void>((resolve) => {
          releaseDecode = resolve;
        });
      }
    }
    vi.stubGlobal('Image', FakeImage);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('배경이 같은 파일이면 층을 건드리지 않는다', async () => {
    const { container, rerender } = render(at('meeting_room.png'));
    const [before] = bgLayers(container);

    rerender(at('meeting_room.png'));
    await act(async () => {});

    const after = bgLayers(container);
    expect(after).toHaveLength(1);
    expect(after[0]).toBe(before);
    expect(releaseDecode).toBeNull(); // decode 자체를 시작하지 않는다
  });

  it('배경이 바뀌면 decode가 끝난 뒤에야 새 층이 선다', async () => {
    const { container, rerender } = render(at('meeting_room.png'));
    const [base] = bgLayers(container);
    const baseImage = bgOf(base);

    rerender(at('library.png'));
    await act(async () => {});

    // 준비 전 — 층은 아직 하나, 그림도 옛 것 그대로다.
    expect(bgLayers(container)).toHaveLength(1);
    expect(bgOf(bgLayers(container)[0])).toBe(baseImage);

    await act(async () => {
      releaseDecode?.();
    });

    // 준비 뒤 — 옛 층은 그대로 있고 새 층이 투명도 0으로 그 위에 선다.
    const layers = bgLayers(container);
    expect(layers).toHaveLength(2);
    expect(bgOf(layers[0])).toBe(baseImage);
    expect(bgOf(layers[1])).toContain('library');
    expect(layers[0]).toBe(base);
    expect(classList(layers[1])).toContain('transition-opacity');
    // 시작 프레임이 opacity-0이라야 페이드가 성립한다 — 곧바로 100이면
    // 트랜지션이 생략되고 그냥 갈아치우는 것과 같아진다.
    expect(classList(layers[1]).some((c) => c === 'opacity-0' || c === 'opacity-100')).toBe(true);
  });

  it('페이드가 끝나면 새 장만 남고 층은 다시 하나가 된다', async () => {
    const { container, rerender } = render(at('meeting_room.png'));
    rerender(at('library.png'));
    await act(async () => {
      releaseDecode?.();
    });
    expect(bgLayers(container)).toHaveLength(2);

    await waitFor(
      () => {
        const layers = bgLayers(container);
        expect(layers).toHaveLength(1);
        expect(bgOf(layers[0])).toContain('library');
      },
      { timeout: 2000 }
    );
  });
});
