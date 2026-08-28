// src/components/home/HomeTab.test.tsx
// @vitest-environment jsdom
//
// 여정 목록 4단계(시나리오) 카드의 해금 조건을 고정한다 (UAT 2026-08-11 김도영).
//
// 예전에는 이 카드만 `isStressDone` 하나로 열렸는데, 실제 진입 게이트인
// ScenarioTab은 `!!adhdResult && !!stressResult` 둘 다 요구한다. 두 검사가
// 순서대로 끝나는 정상 경로에서는 같은 값이라 티가 나지 않지만, ADHD 결과
// 없이 스트레스만 있는 상태(다른 기기에서 계정 초기화 후 스트레스만 재검사)
// 에서는 카드가 열린 것처럼 보이는데 눌러도 잠김 화면이 나왔다.
//
// 여기서 고정하는 계약은 "홈 카드의 표시·클릭 가능 여부 == ScenarioTab 게이트"다.
// 게이트 식을 바꿀 일이 생기면 두 곳을 함께 고쳐야 한다.

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, getDefaultNormalizer } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';

vi.mock('../../api/env', () => ({ IS_MOCK_MODE: true }));
vi.mock('../../api/firebase', () => ({ db: {} }));

import HomeTab from './HomeTab';
import { useTestStore, type TestResultData } from '../../store/useTestStore';
import {
  useScenarioStore,
  type EpisodeProgress,
  type ScenarioProgressMap,
} from '../../store/useScenarioStore';
import { COPY } from '../../constants/copy';
import type { DebugUnlockMode } from '../../utils/debugProgress';

const character = {
  nickname: '백설이',
  gender: 'female' as const,
  createdAt: '2026-08-01T00:00:00.000Z',
};

const adhdResult: TestResultData = {
  testType: 'adhd',
  answers: { 1: 2 },
  score: 50,
  completedAt: '2026-08-01T00:00:00.000Z',
};

const stressResult: TestResultData = {
  testType: 'stress',
  answers: { 1: 0 },
  score: 6,
  completedAt: '2026-08-02T00:00:00.000Z',
  resultType: 'cognitive',
};

const onStartCreation = vi.fn();
const onStartTest = vi.fn();
const onGoScenario = vi.fn();
const onGoDiary = vi.fn();

function seed(adhd: TestResultData | null, stress: TestResultData | null) {
  useTestStore.setState({
    isLoading: false,
    adhdResult: adhd,
    stressResult: stress,
    invalidStressAttempt: false,
  });
}

// ── 시나리오 진행도 시드 (도전과제 판정용) ──
//
// HomeTab이 마운트할 때 fetchThemes()를 부르므로 테마(4영역 × 10편)는 실제
// CSV에서 온다 — 회차 수·에피소드 id를 테스트가 임의로 지어내지 않는다.
// 진행도만 우리가 채운다 (uid가 없으므로 fetchProgress는 호출되지 않는다).
const clearedEntry = (): EpisodeProgress => ({
  cleared: true,
  selectedAngel: 'accept',
  wasHelpful: true,
  selectedReason: '감정을 편안하게 해줌',
  updatedAt: '2026-08-18T00:00:00.000Z',
});

/** 앞에서부터 n개 영역을 완주하고, 그다음 영역에서 extra편을 더 깬 상태. */
function seedScenario(completedThemes: number, extraEpisodes = 0) {
  const themes = useScenarioStore.getState().themes;
  const progress: ScenarioProgressMap = {};
  themes.forEach((theme, themeIdx) => {
    theme.episodes.forEach((ep, epIdx) => {
      const isCleared =
        themeIdx < completedThemes || (themeIdx === completedThemes && epIdx < extraEpisodes);
      if (isCleared) progress[ep.id] = clearedEntry();
    });
  });
  useScenarioStore.setState({ progress, isLoading: false, isThemesLoading: false });
}

const renderTab = (debugMode?: DebugUnlockMode) =>
  render(
    <HomeTab
      isLoading={false}
      character={character}
      onStartCreation={onStartCreation}
      onStartTest={onStartTest}
      onGoScenario={onGoScenario}
      onGoDiary={onGoDiary}
      debugMode={debugMode}
    />
  );

const renderWithoutCharacter = () =>
  render(
    <HomeTab
      isLoading={false}
      character={null}
      onStartCreation={onStartCreation}
      onStartTest={onStartTest}
      onGoScenario={onGoScenario}
      onGoDiary={onGoDiary}
    />
  );

// ── 줄바꿈까지 고정하는 텍스트 매처 (UAT 2026-08-18) ──
// 말풍선 문구 일부는 문장 경계에 \n을 갖고, HomeCtaCard가 whitespace-pre-line으로
// 그대로 렌더한다. RTL의 기본 정규화는 개행을 공백 한 칸으로 접어 버려서
// COPY 상수를 그대로 매처로 넘기면 매칭이 실패한다 — 접기를 끄면 문구가
// 화면에 **줄바꿈까지 그대로** 나가는지가 계약으로 고정된다.
const exact = { normalizer: getDefaultNormalizer({ collapseWhitespace: false }) };

// 여정 카드는 role이 없는 div다. 제목 <p> → 텍스트 묶음 → 행 → 카드 순으로
// 3단계 위가 onClick과 잠김 스타일을 소유한 요소다.
function cardOf(title: string): HTMLElement {
  const el = screen.getByText(title).parentElement?.parentElement?.parentElement;
  if (!el) throw new Error(`카드를 찾지 못했습니다: ${title}`);
  return el as HTMLElement;
}

// 테마(시나리오 CSV 파싱)는 한 번만 만들어 두고 파일 전체가 공유한다 —
// 스토어가 같은 배치면 다시 파싱하지 않으므로, 각 테스트의 마운트는
// 진행도만 보게 된다.
beforeAll(async () => {
  await useScenarioStore.getState().fetchThemes();
});

beforeEach(() => {
  onStartCreation.mockClear();
  onStartTest.mockClear();
  onGoScenario.mockClear();
  onGoDiary.mockClear();
});

afterEach(() => {
  cleanup();
  seed(null, null);
  useScenarioStore.setState({ progress: {}, isLoading: false, isThemesLoading: false });
});

// ── 상단 CTA 카드 (2026-08-14 히어로 교체) ──
//
// 말풍선 + 캐릭터 일러스트 + 닉네임 + 큰 버튼(실측 438px)을 카드 한 장으로
// 접었다. 여기서 고정하는 계약은 세 가지다:
//   1. 상태마다 **말과 목적지가 짝을 이룬다** — 예전에는 말풍선 분기와 버튼
//      분기가 따로 서 있어 한쪽만 고치면 어긋날 수 있었다.
//   2. 화면에서 사라진 버튼 라벨(COPY.home.cta*)이 **접근성 이름으로 살아
//      있다** — 스크린 리더 사용자와 기존 셀렉터 양쪽이 여기에 의존한다.
//   3. 카드가 곧 버튼이다 (role=button 하나).
describe('HomeTab — 상단 CTA 카드', () => {
  it('캐릭터가 없으면 생성으로 안내하고 눌리면 생성 화면으로 보낸다', async () => {
    const user = userEvent.setup();
    seed(null, null);
    renderWithoutCharacter();

    const card = screen.getByRole('button', { name: COPY.home.ctaCreateCharacter });
    expect(screen.getByText(COPY.home.speechNoCharacter, exact)).toBeInTheDocument();

    await user.click(card);
    expect(onStartCreation).toHaveBeenCalledTimes(1);
  });

  it('ADHD 미완이면 ADHD 검사를 말하고 ADHD 검사로 보낸다', async () => {
    const user = userEvent.setup();
    seed(null, null);
    renderTab();

    const card = screen.getByRole('button', { name: COPY.home.ctaStartAdhd });
    expect(
      screen.getByText(COPY.home.speechNeedAdhd(character.nickname))
    ).toBeInTheDocument();

    await user.click(card);
    expect(onStartTest).toHaveBeenCalledWith('adhd');
  });

  it('ADHD만 끝났으면 스트레스 검사를 말하고 스트레스 검사로 보낸다', async () => {
    const user = userEvent.setup();
    seed(adhdResult, null);
    renderTab();

    const card = screen.getByRole('button', { name: COPY.home.ctaStartStress });
    expect(screen.getByText(COPY.home.speechNeedStress)).toBeInTheDocument();

    await user.click(card);
    expect(onStartTest).toHaveBeenCalledWith('stress');
  });

  it('두 검사가 끝났으면 훈련 시작을 말하고 시나리오 탭으로 보낸다', async () => {
    const user = userEvent.setup();
    seed(adhdResult, stressResult);
    renderTab();

    const card = screen.getByRole('button', { name: COPY.home.ctaGoScenario });
    expect(screen.getByText(COPY.home.speechAllDone, exact)).toBeInTheDocument();

    await user.click(card);
    expect(onGoScenario).toHaveBeenCalledTimes(1);
  });

  // 여정 단계 카드는 role 없는 div이므로, 홈 탭 안의 유일한 button은 이 카드다.
  // 여기가 2개가 되면 "카드 전체가 하나의 버튼"이라는 전제가 깨진 것이다.
  it('상단에 버튼은 이 카드 하나뿐이다', () => {
    seed(adhdResult, stressResult);
    renderTab();

    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  // ── 화자 라벨 (2026-08-14 시안 2.2) ──
  // 히어로를 접으면서 사라졌던 닉네임을 말 위 라벨로 되살렸다. "캐릭터가 말을
  // 건다"는 이 카드의 전제를 화자 이름이 직접 밝히는 자리라, 화면에 실제로
  // 그려지는지를 고정한다. 카드의 접근성 이름은 여전히 aria-label(=행동
  // 이름)이므로, 라벨이 늘어도 기존 getByRole 셀렉터는 영향을 받지 않는다.
  it('캐릭터가 있으면 말 위에 닉네임을 화자로 밝힌다', () => {
    seed(adhdResult, null);
    renderTab();

    expect(screen.getByText(character.nickname)).toBeInTheDocument();
    // 접근성 이름은 여전히 행동 이름이다 (닉네임이 섞여 들지 않는다).
    expect(
      screen.getByRole('button', { name: COPY.home.ctaStartStress })
    ).toBeInTheDocument();
  });

  it('캐릭터가 없으면 화자 라벨 자체가 없다', () => {
    seed(null, null);
    renderWithoutCharacter();

    expect(screen.queryByText(character.nickname)).not.toBeInTheDocument();
    // 말과 목적지는 그대로 있어야 한다 — 라벨만 빠지는 것이다.
    expect(screen.getByText(COPY.home.speechNoCharacter, exact)).toBeInTheDocument();
  });

  // ── 말풍선 줄바꿈 (UAT 2026-08-18) ──
  // 두 문장짜리 대사가 430px 폭에서 "없어요. 여기를"처럼 문장 중간에 접혔다.
  // 문구가 정한 자리(\n)에서 접히려면 렌더러가 그 개행을 살려야 한다 —
  // whitespace-pre-line이 빠지면 CSS가 개행을 공백으로 접어 회귀한다.
  it('말풍선의 \\n을 줄바꿈으로 살린다', () => {
    seed(null, null);
    renderWithoutCharacter();

    const bubble = screen.getByText(COPY.home.speechNoCharacter, exact);
    expect(COPY.home.speechNoCharacter).toContain('\n');
    expect(bubble.className).toMatch(/whitespace-pre-line/);
  });
});

describe('HomeTab — 4단계(시나리오) 해금 조건', () => {
  it('두 검사를 모두 마쳐야 입장 칩이 뜨고 클릭이 먹는다', async () => {
    const user = userEvent.setup();
    seed(adhdResult, stressResult);
    renderTab();

    const card = cardOf(COPY.home.step4Title);
    expect(screen.getByText(COPY.home.step4DescUnlocked)).toBeInTheDocument();
    expect(screen.getByText(COPY.home.chipEnter)).toBeInTheDocument();

    await user.click(card);
    expect(onGoScenario).toHaveBeenCalledTimes(1);
  });

  // 이 케이스가 UAT에서 보고된 회귀 그 자체다.
  it('스트레스만 완료된 상태에서는 잠긴 채로 남고 클릭해도 열리지 않는다', async () => {
    const user = userEvent.setup();
    seed(null, stressResult);
    renderTab();

    const card = cardOf(COPY.home.step4Title);
    expect(screen.getByText(COPY.home.step4DescLocked)).toBeInTheDocument();
    expect(screen.queryByText(COPY.home.chipEnter)).not.toBeInTheDocument();

    await user.click(card);
    expect(onGoScenario).not.toHaveBeenCalled();
  });

  it('ADHD만 완료된 상태에서도 잠겨 있다', async () => {
    const user = userEvent.setup();
    seed(adhdResult, null);
    renderTab();

    expect(screen.getByText(COPY.home.step4DescLocked)).toBeInTheDocument();

    await user.click(cardOf(COPY.home.step4Title));
    expect(onGoScenario).not.toHaveBeenCalled();
  });
});

// ── 캐릭터 생성 전에도 여정 지도를 보여 준다 (UAT 2026-08-18) ──
//
// 회귀 그 자체: HomeTab이 `if (!character) return <HomeCtaCard …/>`로 조기
// 반환해 여정 지도(Step 1~4)가 **아예 렌더되지 않았다**. 앞으로 무엇을 하게
// 되는지 가장 알고 싶은 시점에 지도를 감춘 셈이었다.
//
// 여기서 고정하는 계약은 "캐릭터 유무는 여정의 한 상태일 뿐, 지도의 존재
// 조건이 아니다"이다.
describe('HomeTab — 캐릭터 미생성 상태의 여정 지도', () => {
  it('캐릭터가 없어도 Step 1~4가 모두 렌더된다', () => {
    seed(null, null);
    renderWithoutCharacter();

    for (const title of [
      COPY.home.step1Title,
      COPY.home.step2Title,
      COPY.home.step3Title,
      COPY.home.step4Title,
    ]) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
    expect(screen.getByText(COPY.home.journeyTitle)).toBeInTheDocument();
  });

  it('Step 1은 진행 대기로 서고 누르면 캐릭터 생성으로 보낸다', async () => {
    const user = userEvent.setup();
    seed(null, null);
    renderWithoutCharacter();

    expect(screen.getByText(COPY.home.step1DescTodo)).toBeInTheDocument();
    expect(screen.queryByText(COPY.home.step1DescDone)).not.toBeInTheDocument();
    // 지금 할 수 있는 단계는 Step 1 하나뿐이므로 '시작' 칩도 하나뿐이다.
    expect(screen.getAllByText(COPY.home.chipStart)).toHaveLength(1);

    await user.click(cardOf(COPY.home.step1Title));
    expect(onStartCreation).toHaveBeenCalledTimes(1);
  });

  it('Step 2(ADHD)는 잠긴 채로 남고 눌러도 검사가 시작되지 않는다', async () => {
    const user = userEvent.setup();
    seed(null, null);
    renderWithoutCharacter();

    expect(screen.getByText(COPY.home.step2DescLocked)).toBeInTheDocument();

    await user.click(cardOf(COPY.home.step2Title));
    expect(onStartTest).not.toHaveBeenCalled();
  });

  it('캐릭터가 생기면 Step 1이 완료로 바뀐다', () => {
    seed(null, null);
    renderTab();

    expect(screen.getByText(COPY.home.step1DescDone)).toBeInTheDocument();
    expect(screen.queryByText(COPY.home.step1DescTodo)).not.toBeInTheDocument();
    // 이제 다음 차례는 Step 2다.
    expect(screen.getByText(COPY.home.step2DescTodo)).toBeInTheDocument();
  });
});

// jsdom은 레이아웃을 계산하지 않으므로 "카드가 몇 장 보이는가"는 여기서 검증할
// 수 없다. 대신 그 문제의 **원인이었던 DOM 구조**를 고정한다 — 홈 탭 안에 자체
// 스크롤러가 다시 생기면 히어로가 뷰포트를 선점하는 회귀가 그대로 돌아온다.
//
// ── 2026-08-18 팀 회의: 상단 CTA 카드는 스크롤해도 움직이지 않는다 ──
// "자체 스크롤러 금지"와 "CTA 고정"은 어긋나지 않는다. 2026-08-13에 문제였던 것은
// 438px 히어로가 **자기 스크롤러를 갖고** 뷰포트를 선점해 여정 카드에 아예 닿지
// 못한 것이지 sticky 자체가 아니었다. 지금 고정되는 것은 CTA 카드 한 장(약 113px)
// 이었다가, 8/26 검수로 여정 타이틀(h3)까지 고정 블록에 함께 둔다 — h3까지
// 묶으면 157px이라 430px 프레임에서 과하다.
//
// 아래 두 계약은 함께 지켜야 한다. 한쪽만 보고 다른 쪽을 걷어내지 말 것.
describe('HomeTab — 스크롤 구조 (Z Fold 6 제보 2026-08-13 · CTA 고정 2026-08-18)', () => {
  it('홈 탭 내부에는 스크롤 컨테이너도 높이 강제도 없다', () => {
    seed(adhdResult, stressResult);
    const { container } = renderTab();

    // 여정 목록은 4단계 카드의 부모다 (카드 → 목록).
    const journeyList = cardOf(COPY.home.step4Title).parentElement!;
    expect(journeyList.className).not.toMatch(/overflow-y-auto/);
    expect(journeyList.className).not.toMatch(/flex-1/);

    // 스크롤은 PageLayout의 콘텐츠 영역이 소유한다 — 홈 탭 어디에도 없어야 한다.
    expect(container.querySelectorAll('[class*="overflow-y-auto"]')).toHaveLength(0);

    // 루트와 상단 블록에 높이 강제가 없어야 여정 목록이 프레임 높이에 갇히지
    // 않는다. 상단 블록은 sticky지만 높이는 여전히 내용이 정한다 — h-full을
    // 주면 한 장짜리 CTA가 화면을 통째로 차지한다.
    // (h-full 검사를 트리 전체로 넓히지 않는 것은 CharacterGraphic 내부의
    //  `w-full h-full`이 자기 고정 크기 박스를 채우는 것이라 무관하기 때문이다.)
    const root = container.firstElementChild as HTMLElement;
    const heroBlock = journeyList.previousElementSibling as HTMLElement;
    for (const el of [root, heroBlock]) {
      expect(el.className).not.toMatch(/h-full/);
      expect(el.className).not.toMatch(/shrink-0/);
    }
  });

  it('상단 CTA 블록은 스크롤포트 상단에 플러시로 고정된다', () => {
    seed(adhdResult, stressResult);
    renderTab();

    const journeyList = cardOf(COPY.home.step4Title).parentElement!;
    const heroBlock = journeyList.previousElementSibling as HTMLElement;

    expect(heroBlock.className).toMatch(/\bsticky\b/);
    expect(heroBlock.className).toMatch(/\btop-0\b/);

    // 음수 마진은 스크롤포트 상단까지의 누적 여백을 **정확히** 상쇄해야 한다.
    // 홈은 자체 py가 없으므로 상쇄 대상은 HomePage 콘텐츠 래퍼의 py-6(24px)과
    // main의 px-6뿐이다. 값이 어긋나면 스크롤 0에서 위에 틈이 남거나(작게 잡으면)
    // 아래 카드와 겹친다(크게 잡으면). 안쪽 pt-6/px-6이 그 여백을 되돌린다.
    expect(heroBlock.className).toMatch(/-mt-6\b/);
    expect(heroBlock.className).toMatch(/-mx-6\b/);
    expect(heroBlock.className).toMatch(/\bpt-6\b/);
    expect(heroBlock.className).toMatch(/\bpx-6\b/);

    // 지나가는 카드를 가리려면 불투명 배경이 필요하다. surface-container 같은
    // 컨테이너 톤이 아니라 스크롤포트 바탕과 같은 bg-surface여야 한다.
    expect(heroBlock.className).toMatch(/\bbg-surface\b(?!-)/);

    // 고정되는 것은 CTA 카드 한 장뿐 — 여정 타이틀은 목록과 함께 흐른다.
    const journeyTitle = screen.getByText(COPY.home.journeyTitle);
    expect(heroBlock).toContainElement(journeyTitle);
    expect(journeyList).not.toContainElement(journeyTitle);
  });
});

// ── Step 4 이후 도전과제 (2026-08-16 검수 확정 기획) ──
//
// 여기서 고정하는 계약은 두 가지다:
//   1. 네 줄의 판정이 **회복일기와 같은 집계**에서 나온다 — 홈이 "첫 영역을
//      완성했어요"라고 말하면 회복일기 앨범도 1장이다.
//   2. 신호가 없는 항목은 사실을 넘겨 말하지 않는다 — 회복일기·종합
//      인사이트의 '열람'은 어디에도 기록되지 않으므로 각각 "볼 것이 생겼다"
//      /"열렸다"까지만 말한다.
describe('HomeTab — Step 4 이후 도전과제', () => {
  const totalThemes = () => useScenarioStore.getState().themes.length;

  it('시나리오가 잠겨 있으면 도전과제 네 줄이 모두 잠김이다', () => {
    seed(null, null);
    seedScenario(0);
    renderTab();

    for (const desc of [
      COPY.home.challenge1DescLocked,
      COPY.home.challenge2DescLocked,
      COPY.home.challenge3DescLocked,
      COPY.home.challenge4DescLocked,
    ]) {
      expect(screen.getByText(desc)).toBeInTheDocument();
    }
    // 잠긴 줄에는 상태 칩이 붙지 않는다 (자물쇠만 남는다).
    expect(screen.queryByText(COPY.home.chipInProgress)).not.toBeInTheDocument();
    expect(screen.queryByText(COPY.home.chipOpened)).not.toBeInTheDocument();
  });

  it('두 검사를 마치면 첫 도전과제만 열리고 나머지는 잠긴 채다', () => {
    seed(adhdResult, stressResult);
    seedScenario(0);
    renderTab();

    expect(screen.getByText(COPY.home.challenge1DescTodo)).toBeInTheDocument();
    expect(screen.getByText(COPY.home.challenge2DescLocked)).toBeInTheDocument();
    expect(screen.getByText(COPY.home.challenge3DescLocked)).toBeInTheDocument();
    expect(screen.getByText(COPY.home.challenge4DescLocked)).toBeInTheDocument();
    // 열려 있는 도전과제는 한 번에 하나뿐이므로 '진행 중' 칩도 하나뿐이다.
    expect(screen.getAllByText(COPY.home.chipInProgress)).toHaveLength(1);
  });

  it('에피소드를 하나만 완료해도 회복일기 도전과제가 달성된다', () => {
    seed(adhdResult, stressResult);
    seedScenario(0, 1);
    renderTab();

    expect(screen.getByText(COPY.home.challenge1DescDone)).toBeInTheDocument();
    expect(screen.queryByText(COPY.home.challenge1DescTodo)).not.toBeInTheDocument();
    // 사슬이 한 칸 내려간다 — 다음 줄이 열린다.
    expect(screen.getByText(COPY.home.challenge2DescTodo)).toBeInTheDocument();
    expect(screen.getByText(COPY.home.challenge3DescLocked)).toBeInTheDocument();
  });

  it('한 영역을 완주하면 첫 영역 도전과제가 달성되고 남은 영역 수를 센다', () => {
    seed(adhdResult, stressResult);
    seedScenario(1);
    renderTab();

    expect(screen.getByText(COPY.home.challenge2DescDone)).toBeInTheDocument();
    expect(
      screen.getByText(COPY.home.challenge3DescProgress(1, totalThemes()))
    ).toBeInTheDocument();
    // 종합 인사이트는 아직 잠겨 있다.
    expect(screen.getByText(COPY.home.challenge4DescLocked)).toBeInTheDocument();
    expect(screen.queryByText(COPY.home.chipOpened)).not.toBeInTheDocument();
  });

  it('한 영역만 부분 진행해서는 완주 도전과제가 열리지 않는다', () => {
    seed(adhdResult, stressResult);
    seedScenario(0, 9); // 10편 중 9편
    renderTab();

    expect(screen.getByText(COPY.home.challenge2DescTodo)).toBeInTheDocument();
    expect(screen.queryByText(COPY.home.challenge2DescDone)).not.toBeInTheDocument();
    expect(screen.getByText(COPY.home.challenge3DescLocked)).toBeInTheDocument();
  });

  it('네 영역을 모두 완주하면 종합 인사이트가 열림으로 바뀐다', () => {
    seed(adhdResult, stressResult);
    seedScenario(totalThemes());
    renderTab();

    expect(screen.getByText(COPY.home.challenge3DescDone)).toBeInTheDocument();
    expect(screen.getByText(COPY.home.challenge4DescUnlocked)).toBeInTheDocument();
    // '달성'이 아니라 '열림'이다 — 열어 봤는지는 앱이 모른다.
    expect(screen.getByText(COPY.home.chipOpened)).toBeInTheDocument();
  });

  // 3단계 카드와 같은 원칙: 이미 쌓인 기록을 '잠김'으로 되돌리지 않는다.
  it('검사 결과가 없어도 이미 남은 기록은 달성으로 표시한다', () => {
    seed(null, null);
    seedScenario(1);
    renderTab();

    expect(screen.getByText(COPY.home.challenge1DescDone)).toBeInTheDocument();
    expect(screen.getByText(COPY.home.challenge2DescDone)).toBeInTheDocument();
    expect(screen.queryByText(COPY.home.challenge1DescLocked)).not.toBeInTheDocument();
  });

  // ── 도전과제 줄의 목적지 (계약 갱신 2026-08-18) ──
  //
  // 예전 계약은 "이 줄들은 눌리지 않는다"였다. 목적지인 회복일기 탭으로 보내는
  // 콜백이 HomeTab에 없어서였고, 갈 곳 없는 카드를 눌리게 만들면 4단계 카드의
  // 회귀(UAT 2026-08-11)를 되풀이하기 때문이었다.
  //
  // 이제 HomePage가 onGoDiary를 내려주므로 그 전제가 사라졌다. 문구가 "회복일기
  // 탭에서 확인할 수 있어요"라고 말하면서 갈 방법은 하단 탭바뿐인 상태가 더 나쁜
  // 어긋남이다. 계약을 **Step 1~4와 같은 관례**로 옮긴다:
  //   1. 행 전체가 클릭 대상이다 (별도 링크를 안에 두지 않는다).
  //   2. 갈 수 있을 때만 눌린다 — 잠긴 줄, 그리고 회복일기 자체가 잠긴 상태
  //      (캐릭터·두 검사 미완)에서는 아무 일도 일어나지 않는다.
  //   3. role은 그대로 없다 — "상단 CTA 카드가 유일한 button"은 유지된다.
  it('열린 도전과제 줄을 누르면 회복일기 탭으로 보낸다', async () => {
    const user = userEvent.setup();
    seed(adhdResult, stressResult);
    seedScenario(1);
    renderTab();

    await user.click(cardOf(COPY.home.challenge1Title)); // 달성
    expect(onGoDiary).toHaveBeenCalledTimes(1);

    await user.click(cardOf(COPY.home.challenge3Title)); // 진행 중
    expect(onGoDiary).toHaveBeenCalledTimes(2);

    // 다른 목적지로는 새지 않는다.
    expect(onGoScenario).not.toHaveBeenCalled();
    expect(onStartTest).not.toHaveBeenCalled();
    expect(onStartCreation).not.toHaveBeenCalled();
  });

  it('종합 인사이트가 열리면 그 줄도 회복일기로 보낸다', async () => {
    const user = userEvent.setup();
    seed(adhdResult, stressResult);
    seedScenario(useScenarioStore.getState().themes.length);
    renderTab();

    await user.click(cardOf(COPY.home.challenge4Title));
    expect(onGoDiary).toHaveBeenCalledTimes(1);
  });

  it('잠긴 줄은 눌러도 회복일기로 보내지 않는다', async () => {
    const user = userEvent.setup();
    seed(adhdResult, stressResult);
    seedScenario(0); // 1번만 열리고 2~4번은 잠김
    renderTab();

    await user.click(cardOf(COPY.home.challenge3Title));
    await user.click(cardOf(COPY.home.challenge4Title));
    expect(onGoDiary).not.toHaveBeenCalled();

    // 열린 줄은 같은 화면에서 정상 동작한다 (잠금 판정이 줄 단위임을 고정).
    await user.click(cardOf(COPY.home.challenge1Title));
    expect(onGoDiary).toHaveBeenCalledTimes(1);
  });

  // 4단계 카드에서 겪은 회귀와 같은 형태: 회복일기 탭의 잠금 게이트
  // (AnalysisTab lockedGate = 캐릭터 → 두 검사)를 통과하지 못하는 상태에서
  // 줄을 열어 두면 눌렀을 때 잠금 화면이 나온다. 기록만 남고 검사 결과가
  // 사라진 계정에서 실제로 재현된다.
  it('검사가 끝나지 않았으면 달성 줄이어도 회복일기로 보내지 않는다', async () => {
    const user = userEvent.setup();
    seed(null, null);
    seedScenario(1);
    renderTab();

    // 표시는 달성 그대로다 (이미 쌓인 기록을 되돌리지 않는다).
    expect(screen.getByText(COPY.home.challenge1DescDone)).toBeInTheDocument();

    await user.click(cardOf(COPY.home.challenge1Title));
    await user.click(cardOf(COPY.home.challenge2Title));
    expect(onGoDiary).not.toHaveBeenCalled();
  });

  it('도전과제 줄은 여전히 button이 아니다 (상단 CTA 하나뿐)', () => {
    seed(adhdResult, stressResult);
    seedScenario(1);
    renderTab();

    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  // 진행도를 아직 못 읽은 동안 "0/4"를 보여 주는 것은 로딩이 아니라 오답이다.
  // 완주한 사용자가 홈을 먼저 여는 경로에서 실제로 일어난다.
  it('진행도를 읽는 중에는 도전과제를 그리지 않는다', () => {
    seed(adhdResult, stressResult);
    seedScenario(1);
    useScenarioStore.setState({ isLoading: true });
    renderTab();

    expect(screen.queryByText(COPY.home.challenge1Title)).not.toBeInTheDocument();
    expect(screen.queryByText(COPY.home.challenge4Title)).not.toBeInTheDocument();
    // 기존 Step 1~4는 그대로 보인다 (이 데이터와 무관하다).
    expect(screen.getByText(COPY.home.step4Title)).toBeInTheDocument();
  });
});

// ── 개발자 디버그 해금 (2026-08-18) ──
//
// 해금 모드를 소유한 곳은 HomePage 하나이고 시나리오·회복일기 탭이 그 값으로
// 합성 진행도를 그린다. 홈만 그 값을 못 받고 있어서, 토글을 켜 둔 채 홈으로
// 돌아오면 "시나리오는 전부 완주인데 홈 도전과제만 잠김"인 화면이 나왔다.
//
// 여기서 고정하는 계약은 "세 탭이 같은 진행도를 본다"이다 — 판정은 다른 두
// 탭과 똑같이 resolveDisplayProgress 한 곳을 지난다.
describe('HomeTab — 디버그 해금 모드', () => {
  it('전체 해금이면 실 진행도가 비어 있어도 도전과제가 모두 달성으로 선다', () => {
    seed(adhdResult, stressResult);
    seedScenario(0); // 실데이터는 0편
    renderTab('full');

    expect(screen.getByText(COPY.home.challenge1DescDone)).toBeInTheDocument();
    expect(screen.getByText(COPY.home.challenge2DescDone)).toBeInTheDocument();
    expect(screen.getByText(COPY.home.challenge3DescDone)).toBeInTheDocument();
    expect(screen.getByText(COPY.home.challenge4DescUnlocked)).toBeInTheDocument();
  });

  // 부분 해금은 영역 순서대로 0 / 20 / 60 / 100 %다 — 한 영역만 완주한 상태가
  // 되므로 도전과제 사슬도 딱 거기까지 내려온다.
  it('부분 해금이면 한 영역 완주 상태로 판정한다', () => {
    seed(adhdResult, stressResult);
    seedScenario(0);
    renderTab('partial');

    expect(screen.getByText(COPY.home.challenge2DescDone)).toBeInTheDocument();
    expect(
      screen.getByText(
        COPY.home.challenge3DescProgress(1, useScenarioStore.getState().themes.length)
      )
    ).toBeInTheDocument();
    expect(screen.getByText(COPY.home.challenge4DescLocked)).toBeInTheDocument();
  });

  // 락은 기본값이자 실데이터 경로다 — 합성값이 새어 들면 안 된다.
  it('락 모드에서는 실 진행도를 그대로 쓴다', () => {
    seed(adhdResult, stressResult);
    seedScenario(0);
    renderTab('locked');

    expect(screen.getByText(COPY.home.challenge1DescTodo)).toBeInTheDocument();
    expect(screen.getByText(COPY.home.challenge4DescLocked)).toBeInTheDocument();
  });
});

describe('HomeTab — 3단계(스트레스) 카드 표시', () => {
  // 4단계와 같은 재현 경로에서, 이미 끝낸 검사를 '잠김'으로 그리면
  // 사용자에게 두 번째 거짓말이 된다.
  it('ADHD 결과가 없어도 스트레스가 끝났으면 완료로 표시한다', () => {
    seed(null, stressResult);
    renderTab();

    expect(screen.getByText(COPY.home.step3DescDone)).toBeInTheDocument();
    expect(screen.queryByText(COPY.home.step3DescLocked)).not.toBeInTheDocument();
  });

  it('둘 다 없으면 잠김으로 표시하고 클릭해도 검사를 시작하지 않는다', async () => {
    const user = userEvent.setup();
    seed(null, null);
    renderTab();

    expect(screen.getByText(COPY.home.step3DescLocked)).toBeInTheDocument();

    await user.click(cardOf(COPY.home.step3Title));
    expect(onStartTest).not.toHaveBeenCalled();
  });
});
