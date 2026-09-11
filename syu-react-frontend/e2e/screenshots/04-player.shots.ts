// e2e/screenshots/04-player.shots.ts
// 04 시나리오 플레이어 — 영역/에피소드 목록부터 한 편 플레이, 영역 완주(에필로그·
// 유형 보고서), 다른 요정 갈래, street_day 배경까지.
//
// ── 선택자 근거 (전부 소스에 있는 문자열이다. 추측 금지) ─────────────
//   · 진행 힌트  COPY.player.tapNext '터치하여 다음으로' / tapSkip '터치하여 건너뛰기'
//     → PlayerSheet 의 hint 는 SITUATION 단계에서만 서고, isTextComplete 로 갈린다.
//       그래서 '터치하여 다음으로'가 보이면 **타이핑이 끝난 상태**다.
//   · 씬 위치    PlayerSceneProgress 의 role="group" aria-label
//                COPY.player.sceneProgressLabel → '전체 4장면 중 2번째 장면'
//     → 몇 번 눌렀는지가 아니라 **지금 몇 번째 씬인지**로 기다린다(자가 교정).
//   · 진행 조작  VisualNovelPlayer 가 window 에 ArrowRight/ArrowLeft 를 건다.
//     → 화면 좌표 탭 대신 키를 쓴다(좌측 30% '이전 문장' 존을 잘못 밟지 않는다).
//   · 요정 칩    COPY.player.angelChipSelect → '아코 — 수용 전략 조언 듣기'
//     무대의 요정 그림은 angelGraphicSelect → '수용 요정 조언 듣기' 라서
//     /전략 조언 듣기$/ 로 칩만 고른다.
//   · 나머지 버튼 문구는 constants/copy.tsx 의 player.* 그대로다.
//
// networkidle 은 쓰지 않는다(Firestore 롱폴링). helpers.gotoHash 와 같은 이유.

import { test, expect, type Page, type Locator } from '@playwright/test';
import { shot, onboard, gotoHash } from './helpers';

// 한 파일 안에서도 워커가 갈리면 shot 번호가 뒤섞이고, 무엇보다 같은 계정을
// 동시에 쓰면 진행도가 서로를 덮는다. 순차로 돌린다.
test.describe.configure({ mode: 'serial' });

const TAP_NEXT = '터치하여 다음으로';

// ── 공통 로케이터 ─────────────────────────────────────────────────
const selectFinalBtn = (page: Page) =>
  page.getByRole('button', { name: '이 전략으로 최종 선택' });
/** 요정 칩 3개 (수용 · 재평가 · 재초점 순 — STRATEGY_KEYS 순서) */
const angelChips = (page: Page) => page.getByRole('button', { name: /전략 조언 듣기$/ });
/** 핵심 요인 선택지 (EvaluateContent 의 text-left + rounded-pane 조합) */
const reasonOptions = (page: Page) =>
  page.locator('button[class*="text-left"][class*="rounded-pane"]');
const completeHeading = (page: Page) =>
  page.getByText(/멋지게 극복 완료!|에피소드 완료!|마지막 에피소드까지 완료!/);
/** 에피소드 목록의 회차 카드 (에필로그 카드는 뺀다) */
const episodeCards = (page: Page) =>
  page.locator('button[class*="rounded-pane"]').filter({ hasNotText: '에필로그' });

const sceneMarker = (page: Page, n: number) =>
  page.getByRole('group', { name: new RegExp(`중 ${n}번째 장면$`) });

/** 타이핑이 끝날 때까지 기다린다. 에셋 프리로드 게이트도 이 기다림에 포함된다. */
async function waitTypingDone(page: Page): Promise<void> {
  await expect(page.getByText(TAP_NEXT)).toBeVisible({ timeout: 90_000 });
}

/**
 * 원하는 씬 번호(1-based)에 설 때까지 진행한다.
 *
 * 누른 횟수를 세지 않고 **씬 세그먼트 바의 aria-label** 을 본다 — 타이핑이
 * 아직이면 ArrowRight 가 '스킵'으로 소모되는데, 횟수로 세면 그때부터 계산이
 * 어긋난다. 상태를 보고 다시 누르면 저절로 맞춰진다.
 */
async function advanceToScene(page: Page, target: number): Promise<void> {
  for (let i = 0; i < 24; i++) {
    if (await sceneMarker(page, target).isVisible().catch(() => false)) return;
    await waitTypingDone(page);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(250);
  }
  throw new Error(`${target}번째 장면에 닿지 못했습니다`);
}

/** 마지막 대사 장면을 지나 요정 단계(ANGELS)까지 간다. */
async function advanceToAngels(page: Page): Promise<void> {
  for (let i = 0; i < 24; i++) {
    if (await selectFinalBtn(page).isVisible().catch(() => false)) return;
    await waitTypingDone(page);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(250);
  }
  throw new Error('요정 단계에 닿지 못했습니다');
}

/**
 * 요정 3인의 조언을 모두 열고(잠금 해제 조건) 마지막에 `pick` 을 펼친 채
 * 최종 선택한다 — 펼쳐 둔 요정이 곧 선택되는 요정이다(AngelBrowseContent).
 */
async function chooseAngel(page: Page, pick: number): Promise<void> {
  const chips = angelChips(page);
  await expect(chips).toHaveCount(3, { timeout: 15_000 });
  const order = [0, 1, 2].filter((i) => i !== pick).concat(pick);
  for (const i of order) {
    await chips.nth(i).click();
    await page.waitForTimeout(150);
  }
  await expect(selectFinalBtn(page)).toBeEnabled({ timeout: 10_000 });
  await selectFinalBtn(page).click();
}

/** 전략 적용 → 도움 평가 → 핵심 요인 → 완료. 화면은 찍지 않는다(빠른 통과용). */
async function finishEpisode(page: Page, helpful = true): Promise<void> {
  await page.getByRole('button', { name: '다음으로' }).click();
  await page
    .getByRole('button', { name: helpful ? '도움이 되었어요' : '잘 모르겠어요' })
    .click();
  await expect(reasonOptions(page).first()).toBeVisible({ timeout: 15_000 });
  await reasonOptions(page).first().click();
  await expect(completeHeading(page)).toBeVisible({ timeout: 30_000 });
}

/** 한 편을 통째로 빠르게 지난다(촬영 없음). */
async function playEpisodeFast(page: Page, pick = 0, helpful = true): Promise<void> {
  await advanceToAngels(page);
  await chooseAngel(page, pick);
  await finishEpisode(page, helpful);
}

/** 영역 목록에서 영역 하나를 연다. */
async function openTheme(page: Page, title: string): Promise<void> {
  await expect(page.getByRole('heading', { name: '시나리오 영역 선택' })).toBeVisible({
    timeout: 30_000,
  });
  const card = page
    .getByRole('button')
    .filter({ has: page.getByRole('heading', { level: 3, name: title, exact: true }) });
  await card.first().click();
  await expect(page.getByRole('button', { name: '뒤로가기' })).toBeVisible({ timeout: 15_000 });
}

/** 목록에서 회차 카드를 골라 플레이어를 연다. */
async function playEpisodeCard(page: Page, index: number): Promise<void> {
  const card: Locator = episodeCards(page).nth(index);
  await expect(card).toBeVisible({ timeout: 15_000 });
  await card.click();
  await page.getByRole('button', { name: '시나리오 플레이' }).click();
}

/** 시나리오 탭에 서서 영역 목록이 뜰 때까지 기다린다. */
async function enterScenario(page: Page): Promise<void> {
  await gotoHash(page, 'scenario');
  await expect(page).toHaveURL(/#scenario/, { timeout: 20_000 });
  await expect(page.getByRole('heading', { name: '시나리오 영역 선택' })).toBeVisible({
    timeout: 30_000,
  });
}

test.describe('04-player', () => {
  // ──────────────────────────────────────────────────────────────
  // 01 목록 3종 + 1화 전 구간 + 종료 확인 모달
  // ──────────────────────────────────────────────────────────────
  // ⚠️ 이 계정의 **직장 영역 진행도가 비어 있어야** 'episode-list-locked'가
  // 제 뜻대로 찍힌다(1화만 열리고 나머지가 잠긴 목록). 테스트 자체는 진행도가
  // 있어도 통과하지만, 그때는 그 한 장이 "2화까지 열린 목록"이 된다.
  test('01 목록과 1화 플레이 전 구간', async ({ page }) => {
    await onboard(page, '04-player@example.com');
    await enterScenario(page);
    await shot(page, '04', 'theme-list', '시나리오 영역 목록 — 4개 영역 카드와 완주율');

    await openTheme(page, '직장');
    await shot(page, '04', 'episode-list-locked', '직장 에피소드 목록 — 1화만 열림, 2~10화·에필로그 잠김');

    // 카드를 고르면 그 자리에서 첫 장면 내레이션 전문이 펼쳐진다(시작 전 안내).
    await episodeCards(page).first().click();
    await expect(page.getByRole('button', { name: '시나리오 플레이' })).toBeEnabled();
    await shot(page, '04', 'episode-card-expanded', '1화 카드 펼침 — 시작 전 줄거리 안내');

    await page.getByRole('button', { name: '시나리오 플레이' }).click();

    // ── 대사 장면 ──
    await advanceToScene(page, 1);
    await waitTypingDone(page);
    await shot(page, '04', 'player-scene1-cast', '1장면: 회의실 배경 + 백설이 + 동료(조연)');

    await advanceToScene(page, 2);
    await waitTypingDone(page);
    await shot(page, '04', 'player-scene2-supporting', '2장면: 상사가 함께 선 장면');

    // ── 플레이 중 종료 확인 모달 ──
    // (저장 전 진행이 있어야 뜬다 — 첫 대사에 머물면 되묻지 않는다)
    await page.getByRole('button', { name: '플레이 종료' }).click();
    await expect(page.getByText('정말 나가시겠어요?')).toBeVisible({ timeout: 10_000 });
    await shot(page, '04', 'player-exit-confirm', '플레이 종료 확인 모달');
    await page.getByRole('button', { name: '계속 훈련하기' }).click();
    await expect(page.getByText('정말 나가시겠어요?')).toBeHidden({ timeout: 10_000 });

    await advanceToScene(page, 3);
    await waitTypingDone(page);
    await shot(page, '04', 'player-scene3-solo', '3장면: 백설이 혼자 서 있는 대사 장면');

    // ── 요정 단계 ──
    await advanceToAngels(page);
    await shot(page, '04', 'player-angels-intro', '요정 3종 등장 — 조언 자리에 열람 안내');

    const chips = angelChips(page);
    await expect(chips).toHaveCount(3);
    await chips.nth(0).click();
    await expect(page.getByText('수용 전략')).toBeVisible({ timeout: 10_000 });
    await shot(page, '04', 'player-angel-accept', '아코(수용) 조언 펼침 — 선택 직후 요정 조언');

    await chips.nth(1).click();
    await expect(page.getByText('재평가 전략')).toBeVisible({ timeout: 10_000 });
    await shot(page, '04', 'player-angel-reappraisal', '포코(재평가) 조언');

    await chips.nth(2).click();
    await expect(page.getByText('재초점 전략')).toBeVisible({ timeout: 10_000 });
    await chips.nth(0).click();
    await expect(selectFinalBtn(page)).toBeEnabled({ timeout: 10_000 });
    await shot(page, '04', 'player-angel-all-read', '3인 모두 읽음 — 최종 선택 버튼 해금');

    await selectFinalBtn(page).click();

    // ── 전략 적용 ──
    await expect(page.getByText('선택된 전략')).toBeVisible({ timeout: 20_000 });
    await shot(page, '04', 'player-apply-strategy', '전략 적용 — 아코(수용)를 써 본 뒤의 소감');

    // ── 평가 2단 ──
    await page.getByRole('button', { name: '다음으로' }).click();
    await expect(page.getByText('도움이 되었나요?')).toBeVisible({ timeout: 15_000 });
    await shot(page, '04', 'player-eval-helpful', '도움 평가 — 도움/모르겠음 선택');

    await page.getByRole('button', { name: '도움이 되었어요' }).click();
    await expect(page.getByText('핵심 요인을 1가지 선택해 주세요.')).toBeVisible({
      timeout: 15_000,
    });
    await shot(page, '04', 'player-eval-reason-helpful', '핵심 요인 — 도움 요인 목록');

    await reasonOptions(page).first().click();
    await expect(completeHeading(page)).toBeVisible({ timeout: 30_000 });
    await shot(page, '04', 'player-episode-complete', '에피소드 완료 — 그만하기/다음 에피소드');

    // 목록으로 빠져나와 완주 표시가 붙은 목록도 한 장 남긴다.
    await page.getByRole('button', { name: '그만하기' }).click();
    await expect(page.getByRole('button', { name: '뒤로가기' })).toBeVisible({ timeout: 15_000 });
    await shot(page, '04', 'episode-list-after-clear', '1화 완주 후 목록 — 2화 해금·완주 체크');
  });

  // ──────────────────────────────────────────────────────────────
  // 02 직장 10편 완주 → 에필로그 → 유형 보고서
  // ──────────────────────────────────────────────────────────────
  // 계정을 매 실행 새로 만든다. 유형 보고서는 **첫 완주 1회**만 열리는 화면이라
  // (ScenarioTab.isFirstThemeReport → users/{uid}.seenReports), 같은 계정을 다시
  // 쓰면 두 번째 실행부터는 보고서 대신 회복일기 탭으로 빠져 이 test가 깨진다.
  test('02 영역 완주와 마무리 흐름', async ({ page }) => {
    test.setTimeout(600_000);
    await onboard(page, `04-theme-${Date.now()}@example.com`);
    await enterScenario(page);
    await openTheme(page, '직장');
    await playEpisodeCard(page, 0);

    // 1~9화는 완료 시트의 '다음 에피소드'로 이어 달린다(목록을 거치지 않는다).
    for (let n = 1; n <= 9; n++) {
      // 전략을 돌려 가며 고른다 — 보고서의 전략 분포가 한 칸에만 몰리지 않게.
      await playEpisodeFast(page, (n - 1) % 3, n % 4 !== 0);
      await page.getByRole('button', { name: '다음 에피소드' }).click();
      await page.waitForTimeout(400);
    }

    // 10화
    await playEpisodeFast(page, 2, true);
    await expect(page.getByText('마지막 에피소드까지 완료!')).toBeVisible({ timeout: 30_000 });
    await shot(page, '04', 'player-complete-last', '10화 완료 — 마지막 에피소드 완료 카드');

    await page.getByRole('button', { name: '마지막 에피소드 마치기' }).click();

    // 에필로그 해금 안내
    await expect(page.getByText('직장 영역 에필로그가 열렸어요!')).toBeVisible({ timeout: 30_000 });
    await shot(page, '04', 'epilogue-unlock-modal', '에필로그 해금 안내 모달');

    await page.getByRole('button', { name: '에필로그 보러가기' }).click();

    // 에필로그 플레이어 — 마지막 씬까지 읽는다.
    await waitTypingDone(page);
    await shot(page, '04', 'epilogue-scene1', '에필로그 1장면');
    // ArrowRight 한 번은 타이핑 중이면 '스킵', 끝났으면 '다음 씬'이다.
    // 마지막 씬을 넘기면 화면은 그대로 두고 회복일기 안내가 위에 뜬다.
    for (let i = 0; i < 40; i++) {
      if (await page.getByText('직장 영역 기록 완성!').isVisible().catch(() => false)) break;
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(350);
      // 중간 한 장을 남긴다.
      if (i === 6) await shot(page, '04', 'epilogue-scene-mid', '에필로그 중간 장면');
    }

    // 회복일기 기록 완성 안내 → 유형 보고서
    await expect(page.getByText('직장 영역 기록 완성!')).toBeVisible({ timeout: 30_000 });
    await shot(page, '04', 'diary-unlock-modal', '영역 기록 완성 안내 — 에필로그 마지막 장면 위');

    await page.getByRole('button', { name: '회복일기 보러가기' }).click();
    await expect(page.getByRole('heading', { name: '나의 정서 대응 프로필' })).toBeVisible({
      timeout: 30_000,
    });
    await shot(page, '04', 'type-report-top', '유형 보고서 상단 — 종합 진단·도움 체감도');

    // 보고서는 한 화면에 다 들어오지 않는다. 아래쪽도 한 장.
    await page.mouse.wheel(0, 1400);
    await page.waitForTimeout(500);
    await shot(page, '04', 'type-report-bottom', '유형 보고서 하단 — 전략 분포·닫기 버튼');
  });

  // ──────────────────────────────────────────────────────────────
  // 03 다른 요정 갈래 + street_day 배경 (취업준비)
  // ──────────────────────────────────────────────────────────────
  test('03 다른 요정 갈래와 street_day 배경', async ({ page }) => {
    test.setTimeout(600_000);
    await onboard(page, '04-street@example.com');
    await enterScenario(page);
    await openTheme(page, '취업준비');
    await playEpisodeCard(page, 0);

    // 1화 — 리프(재초점)를 고르고 '잘 모르겠어요'로 평가해 반대 갈래를 본다.
    await advanceToAngels(page);
    const chips = angelChips(page);
    await expect(chips).toHaveCount(3);
    for (const i of [0, 1, 2]) {
      await chips.nth(i).click();
      await page.waitForTimeout(150);
    }
    await expect(page.getByText('재초점 전략')).toBeVisible({ timeout: 10_000 });
    await shot(page, '04', 'player-angel-refocus', '리프(재초점) 조언 — 다른 요정 갈래');

    await selectFinalBtn(page).click();
    await expect(page.getByText('선택된 전략')).toBeVisible({ timeout: 20_000 });
    await shot(page, '04', 'player-apply-refocus', '재초점 전략 적용 — 다른 갈래의 소감');

    await page.getByRole('button', { name: '다음으로' }).click();
    await page.getByRole('button', { name: '잘 모르겠어요' }).click();
    await expect(page.getByText('핵심 요인을 1가지 선택해 주세요.')).toBeVisible({
      timeout: 15_000,
    });
    await shot(page, '04', 'player-eval-reason-unhelpful', '핵심 요인 — 비도움 요인 목록');

    await reasonOptions(page).first().click();
    await expect(completeHeading(page)).toBeVisible({ timeout: 30_000 });

    // 2~5화를 지나 6화(취업준비6 = street_day 배경)까지 이어 간다.
    for (let n = 1; n <= 5; n++) {
      await page.getByRole('button', { name: '다음 에피소드' }).click();
      await page.waitForTimeout(400);
      if (n === 5) break; // 6화는 플레이하지 않고 첫 장면만 찍는다
      await playEpisodeFast(page, n % 3, true);
    }

    await advanceToScene(page, 1);
    await waitTypingDone(page);
    await shot(page, '04', 'player-street-day', '취업준비 6화 1장면 — street_day 배경 + 친구(조연)');
  });
});
