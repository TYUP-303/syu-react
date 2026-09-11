import { test, expect, type Page } from '@playwright/test';
import {
  shot,
  onboard,
  gotoHash,
  createVerifiedAccount,
  login,
  createCharacter,
  completeTest,
  STRESS_COGNITIVE,
} from './helpers';

/**
 * 홈 셸 잔여 화면 캡처 (03b)
 * 03-home.shots.ts 가 찍지 못한 것만 맡는다:
 *   - 회복일기 탭(#diary — '#analysis' 는 라우트가 아니다) 잠김·부분·상세·완주
 *   - 시나리오 2뎁스 에피소드 목록(잠김 / 완주)
 *   - 마이페이지 아바타 모달 · 닉네임 편집 중
 *   - 새 계정의 마이페이지 / 회복일기 잠김 / 홈
 *
 * 선택자는 전부 코드의 실제 문구·aria-label 이다 (추측 금지).
 * 디버그 토글 라벨은 '디버그 해금 모드: 락|부분|전체' (debugProgress.ts).
 */

/** 스크롤러가 PageLayout/마이페이지 내부 div 라 window.scrollBy 는 듣지 않는다. */
async function wheel(page: Page, dy = 700): Promise<void> {
  await page.mouse.move(200, 500);
  await page.mouse.wheel(0, dy);
  await page.waitForTimeout(500);
}

/** 디버그 토글 — 현재 모드가 라벨에 박혀 있어 목표 모드까지 누른다. */
async function setDebugMode(page: Page, target: '락' | '부분' | '전체'): Promise<void> {
  const toggle = page.locator('button[aria-label^="디버그 해금 모드"]').first();
  await expect(toggle).toBeVisible({ timeout: 10_000 });
  for (let i = 0; i < 4; i++) {
    const label = (await toggle.getAttribute('aria-label')) ?? '';
    if (label.includes(target)) return;
    await toggle.click();
    await page.waitForTimeout(500);
  }
  throw new Error(`디버그 모드 ${target} 로 못 감`);
}

// ────────────────────────────────────────────────────────────────
// A-1. 회복일기 탭 (개발자 계정)
// ────────────────────────────────────────────────────────────────
test('03b-1: 회복일기 탭 — 잠김·부분·상세·완주', async ({ page }) => {
  await onboard(page, 'test@example.com', '백설이');

  await gotoHash(page, 'diary');
  await expect(page).toHaveURL(/#diary/, { timeout: 10_000 });
  await page.waitForTimeout(800);

  // ── 잠김(락) 모드: 완주 기록 0건 → DiaryLockedView ──
  await setDebugMode(page, '락');
  await shot(page, '03', 'diary-dev-locked', '회복일기 탭 - 디버그 락 (기록 0건 잠금 화면)');

  // ── 부분 모드: 영역 0/20/60/100 % 가 한 화면에 ──
  await setDebugMode(page, '부분');
  await expect(page.getByRole('heading', { name: '백설이의 회복일기' })).toBeVisible({
    timeout: 10_000,
  });
  await shot(page, '03', 'diary-partial-top', '회복일기 부분 해금 - 상단 (앨범 게이지·영역 카드)');
  await wheel(page, 800);
  await shot(page, '03', 'diary-partial-bottom', '회복일기 부분 해금 - 하단 (종합 인사이트 잠금 카드)');

  // ── 일기 상세: '이어하기'(진행 중) 영역 카드 ──
  await wheel(page, -900);
  const continueCard = page.getByRole('button').filter({ hasText: '· 이어하기' }).first();
  await expect(continueCard).toBeVisible({ timeout: 10_000 });
  await continueCard.click();
  await page.waitForTimeout(900);
  await shot(page, '03', 'diary-detail-top', '일기 상세 - 상단 (미완주 안내·영역 진행 카드)');
  await wheel(page, 900);
  await shot(page, '03', 'diary-detail-mid', '일기 상세 - 중단 (도움됨·전략 빈도 통계)');
  await wheel(page, 900);
  await shot(page, '03', 'diary-detail-bottom', '일기 상세 - 하단 (해석·제안)');

  // 목록으로
  await page.getByRole('button', { name: '뒤로가기' }).first().click();
  await page.waitForTimeout(700);

  // ── 완주(전체) 모드: 종합 인사이트 해금 + 앨범 4/4 ──
  await setDebugMode(page, '전체');
  await expect(page.getByRole('heading', { name: /축하해요/ })).toBeVisible({ timeout: 10_000 });
  await shot(page, '03', 'diary-full-top', '회복일기 완주 - 상단 (앨범 4/4·종합 인사이트 해금 카드)');
  await wheel(page, 800);
  await shot(page, '03', 'diary-full-bottom', '회복일기 완주 - 하단 (영역 카드 4장 완료)');

  // 종합 인사이트 보고서
  await wheel(page, -900);
  const comprehensive = page.getByRole('button').filter({ hasText: '종합 인사이트' }).first();
  if (await comprehensive.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await comprehensive.click();
    await page.waitForTimeout(900);
    await shot(page, '03', 'diary-comprehensive-top', '종합 인사이트 보고서 - 상단');
    await wheel(page, 900);
    await shot(page, '03', 'diary-comprehensive-mid', '종합 인사이트 보고서 - 중단');
    await wheel(page, 900);
    await shot(page, '03', 'diary-comprehensive-bottom', '종합 인사이트 보고서 - 하단 (엔딩 CTA)');
  }
});

// ────────────────────────────────────────────────────────────────
// A-2. 시나리오 2뎁스 — 에피소드 목록
// ────────────────────────────────────────────────────────────────
test('03b-2: 에피소드 목록 — 잠김·완주', async ({ page }) => {
  await onboard(page, 'test@example.com', '백설이');

  await gotoHash(page, 'scenario');
  await expect(page).toHaveURL(/#scenario/, { timeout: 10_000 });
  await page.waitForTimeout(800);

  // 테마 카드는 "N% 완료" 를 달고 있는 버튼이다.
  const themeCard = () => page.getByRole('button').filter({ hasText: '% 완료' }).first();

  // ── 잠김 모드 ──
  await setDebugMode(page, '락');
  await expect(themeCard()).toBeVisible({ timeout: 10_000 });
  await themeCard().click();
  await page.waitForTimeout(900);
  await shot(page, '03', 'episodes-locked', '에피소드 목록 - 잠김 (1화만 열림·에필로그 잠금)');
  await wheel(page, 800);
  await shot(page, '03', 'episodes-locked-bottom', '에피소드 목록 - 잠김 하단 (잠긴 에필로그 카드)');
  await page.getByRole('button', { name: '뒤로가기' }).first().click();
  await page.waitForTimeout(700);

  // ── 완주 모드 ──
  await setDebugMode(page, '전체');
  await expect(themeCard()).toBeVisible({ timeout: 10_000 });
  await themeCard().click();
  await page.waitForTimeout(900);
  await shot(page, '03', 'episodes-full', '에피소드 목록 - 완주 (에필로그 해금·10편 완료)');
  await wheel(page, 800);
  await shot(page, '03', 'episodes-full-bottom', '에피소드 목록 - 완주 하단');
});

// ────────────────────────────────────────────────────────────────
// A-3. 마이페이지 — 아바타 모달 · 닉네임 편집
// ────────────────────────────────────────────────────────────────
test('03b-3: 마이페이지 아바타 모달·닉네임 편집', async ({ page }) => {
  await onboard(page, 'test@example.com', '백설이');

  await gotoHash(page, 'mypage');
  await expect(page).toHaveURL(/#mypage/, { timeout: 10_000 });
  await page.waitForTimeout(800);

  // ── 아바타 선택 모달 (aria-label = COPY.myPage.avatarEdit) ──
  const avatarBtn = page.getByRole('button', { name: '프로필 이미지 변경' });
  await expect(avatarBtn).toBeVisible({ timeout: 10_000 });
  await avatarBtn.click();
  await page.waitForTimeout(700);
  await shot(page, '03', 'mypage-avatar-modal', '아바타 선택 모달 (기본 이미지 + 프리셋 그리드)');

  // 프리셋 하나를 골라 선택 표시가 보이게 (저장하지 않는다)
  const tiles = page.locator('button[aria-pressed]');
  if ((await tiles.count()) > 1) {
    await tiles.nth(1).click();
    await page.waitForTimeout(400);
    await shot(page, '03', 'mypage-avatar-modal-selected', '아바타 선택 모달 - 프리셋 선택 상태');
  }
  await page.getByRole('button', { name: '취소' }).first().click();
  await page.waitForTimeout(600);

  // ── 닉네임 수정 중 (저장하지 않고 취소) ──
  const editBtn = page.getByRole('button', { name: '닉네임 수정' });
  await expect(editBtn).toBeVisible({ timeout: 10_000 });
  await editBtn.click();
  await page.waitForTimeout(500);
  await shot(page, '03', 'mypage-nickname-editing', '닉네임 수정 중 (입력창·글자수·저장/취소)');
  await page.getByRole('button', { name: '취소' }).first().click();
  await page.waitForTimeout(500);
  await expect(page.getByRole('button', { name: '닉네임 수정' })).toBeVisible({ timeout: 5_000 });
});

/**
 * 약관 게이트를 **길게** 기다렸다 처리한다.
 * helpers.acceptConsent 는 8초만 보는데, 병렬 부하에서 게이트가 그보다 늦게
 * 떠 03-fresh 계정이 동의 없이 캐릭터 생성으로 넘어갔고, 뒤늦게 뜬 모달이
 * (#app-modal-root) 모든 클릭을 가로채 10분 타임아웃까지 매달렸다.
 */
async function acceptConsentLong(page: Page): Promise<void> {
  const agree = page.locator('#btn-consent-agree');
  if (!(await agree.isVisible({ timeout: 30_000 }).catch(() => false))) return;
  for (const id of ['#consent-terms', '#consent-privacy']) {
    const box = page.locator(id);
    if (!(await box.isChecked().catch(() => false))) await box.click({ force: true });
  }
  await expect(agree).toBeEnabled({ timeout: 5_000 });
  await agree.click();
  await expect(agree).toBeHidden({ timeout: 15_000 });
}

/** helpers.onboard 와 같은 흐름이되 약관 대기만 길게 잡은 판본. */
async function onboardPatient(page: Page, email: string, nickname: string): Promise<void> {
  await createVerifiedAccount(email);
  await login(page, email);
  await acceptConsentLong(page);
  await gotoHash(page, 'character-creation');
  await page.waitForTimeout(800);
  // 이동 뒤에 게이트가 올라오는 경우까지 한 번 더 본다.
  await acceptConsentLong(page);
  if (/#character-creation/.test(page.url())) {
    await createCharacter(page, nickname);
    await page.getByRole('button', { name: '검사 시작하기' }).click();
  } else {
    await gotoHash(page, 'test-adhd');
  }
  await expect(page).toHaveURL(/#test-adhd/, { timeout: 15_000 });
  await completeTest(page);
  await page.getByRole('button', { name: /다음 검사 진행/ }).click();
  await completeTest(page, STRESS_COGNITIVE);
  await page.getByRole('button', { name: /홈 화면으로 돌아가기/ }).click();
  await expect(page).toHaveURL(/#home/, { timeout: 15_000 });
}

// ────────────────────────────────────────────────────────────────
// B. 새 계정 — 진행도 0 · 회복일기 잠김 · 홈
// ────────────────────────────────────────────────────────────────
test('03b-4: 새 계정 마이페이지·회복일기 잠김·홈', async ({ page }) => {
  await onboardPatient(page, '03-fresh@example.com', '새카');

  // ── 마이페이지 ──
  await gotoHash(page, 'mypage');
  await expect(page).toHaveURL(/#mypage/, { timeout: 10_000 });
  await page.waitForTimeout(800);
  await shot(page, '03', 'mypage-fresh-top', '새 계정 마이페이지 - 상단 (프로필·알림 설정)');
  // 한 번의 휠로 이미 바닥이다 (402×874에서 마이페이지는 두 화면 분량) —
  // 700px씩 두 번 굴리면 두 번째 컷이 첫 번째와 픽셀까지 같은 파일이 됐다.
  await wheel(page, 1400);
  await shot(
    page,
    '03',
    'mypage-fresh-bottom',
    '새 계정 마이페이지 - 하단 (활동 내역 0·엔딩 잠김·계정 관리)',
  );

  // ── 회복일기 탭 (잠김) ──
  await gotoHash(page, 'diary');
  await expect(page).toHaveURL(/#diary/, { timeout: 10_000 });
  await page.waitForTimeout(900);
  await shot(page, '03', 'diary-fresh-locked', '새 계정 회복일기 - 잠금 화면 (DiaryLockedView)');

  // ── 홈 탭 ──
  await gotoHash(page, 'home');
  await expect(page).toHaveURL(/#home/, { timeout: 10_000 });
  await page.waitForTimeout(900);
  await shot(page, '03', 'home-fresh-top', '새 계정 홈 탭 - 상단');
  await wheel(page, 800);
  await shot(page, '03', 'home-fresh-bottom', '새 계정 홈 탭 - 하단');
});
