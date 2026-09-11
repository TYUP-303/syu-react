import { test, expect } from '@playwright/test';
import {
  shot,
  onboard,
  gotoHash,
} from './helpers';

/**
 * 홈 셸 캡처 (03-home)
 * - 개발자 계정 test@example.com: 홈, 시나리오(3모드), 회복일기, 마이페이지
 * - 새 계정 03-fresh@example.com: 마이페이지(0%), 회복일기(잠김)
 */

test('03a: 개발자 계정 홈·시나리오·회복일기', async ({ page }) => {
  // ── 온보딩: 첫 호출 시만 진행, 이후는 건너뜀 ──
  await onboard(page, 'test@example.com', '백설이');

  // ──── 홈 탭 ────
  await gotoHash(page, 'home');
  await expect(page).toHaveURL(/#home/);
  await page.waitForTimeout(600);
  await shot(page, '03', 'home-top', '홈 탭 상단 (여정 카드, 아바타)');

  await page.evaluate(() => window.scrollBy(0, 800));
  await page.waitForTimeout(400);
  await shot(page, '03', 'home-challenges', '홈 탭 하단 (도전과제)');

  // ──── 시나리오 탭 (URL로 직접 이동) ────
  await gotoHash(page, 'scenario');
  await expect(page).toHaveURL(/#scenario/, { timeout: 10_000 });
  await page.waitForTimeout(600);

  // 테마 목록 (잠김 모드, 기본값)
  await shot(page, '03', 'scenario-locked', '시나리오 탭 - 테마 목록 (잠김 모드)');

  // 디버그 해금 토글이 있으면: 부분(1) 모드
  const debugToggle = page.locator('button[aria-label*="디버그 해금"]').first();
  if (await debugToggle.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await debugToggle.click();
    await page.waitForTimeout(400);
    await shot(page, '03', 'scenario-partial', '시나리오 탭 - 부분 해금 모드');

    // 완주(2) 모드
    await debugToggle.click();
    await page.waitForTimeout(400);
    await shot(page, '03', 'scenario-full', '시나리오 탭 - 완주 모드');

    // 토글 되돌림: 부분(1)
    await debugToggle.click();
    await page.waitForTimeout(400);
  }

  // 첫 테마 열기
  const firstTheme = page.locator('[data-testid*="theme"]').first();
  if (await firstTheme.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await firstTheme.click();
    await page.waitForTimeout(600);
    await shot(page, '03', 'scenario-episodes', '에피소드 목록 (잠김·열림 혼합)');
    await page.goBack();
  }

  // ──── 회복일기 탭 (URL로 직접 이동) ────
  await gotoHash(page, 'analysis');
  await expect(page).toHaveURL(/#analysis/, { timeout: 10_000 });
  await page.waitForTimeout(600);

  // 일기 목록 (부분 모드 상태)
  const diaryDebugToggle = page.locator('button[aria-label*="디버그 해금"]').first();
  if (await diaryDebugToggle.isVisible({ timeout: 3_000 }).catch(() => false)) {
    // 현재 부분 모드면 그대로
    await shot(page, '03', 'diary-partial-list', '회복일기 탭 - 부분 해금 목록');

    // 첫 일기 열기
    const firstDiary = page.locator('[data-testid*="diary"]').first();
    if (await firstDiary.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await firstDiary.click();
      await page.waitForTimeout(600);
      await shot(page, '03', 'diary-detail', '일기 상세 뷰');
      await page.goBack();
      await page.waitForTimeout(400);
    }

    // 완주(2) 모드: 종합 카드·앨범 게이지
    await diaryDebugToggle.click();
    await page.waitForTimeout(400);
    await diaryDebugToggle.click();
    await page.waitForTimeout(400);
    await shot(page, '03', 'diary-full-summary', '회복일기 탭 - 완주 모드 (종합 카드·앨범)');

    // 토글 되돌림: 부분(1)
    await diaryDebugToggle.click();
    await page.waitForTimeout(400);
  }
});

test('03b: 개발자 계정 마이페이지', async ({ page }) => {
  // 온보딩 (이미 만들어져 있으면 건너뜀)
  await onboard(page, 'test@example.com', '백설이');

  // 마이페이지 (URL로 직접 이동)
  await gotoHash(page, 'mypage');
  await expect(page).toHaveURL(/#mypage/);
  await page.waitForTimeout(600);
  await shot(page, '03', 'mypage-top', '마이페이지 상단 (진행도, 엔딩 해금 표시)');

  // 아바타 선택 모달
  const avatarBtn = page.locator('button, div').filter({ hasText: /아바타|avatar/ }).first();
  if (await avatarBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await avatarBtn.click({ force: true });
    await page.waitForTimeout(600);
    await shot(page, '03', 'mypage-avatar-modal', '아바타 선택 모달');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }

  // 닉네임 수정
  const editNicknameBtn = page.locator('button').filter({ hasText: /수정/ }).first();
  if (await editNicknameBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await editNicknameBtn.click({ force: true });
    await page.waitForTimeout(400);
    await shot(page, '03', 'mypage-nickname-edit', '닉네임 편집 상태');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }

  // 로그아웃 모달
  const logoutBtn = page.locator('button').filter({ hasText: /로그아웃/ }).first();
  if (await logoutBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await logoutBtn.click({ force: true });
    await page.waitForTimeout(600);
    await shot(page, '03', 'mypage-logout-modal', '로그아웃 확인 모달');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }

  // 데이터 초기화 모달
  const resetBtn = page.locator('button').filter({ hasText: /초기화/ }).first();
  if (await resetBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await resetBtn.click({ force: true });
    await page.waitForTimeout(600);
    await shot(page, '03', 'mypage-reset-modal', '데이터 초기화 모달');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }

  // 탈퇴 안내 (개발자 계정은 안내만 뜸)
  const withdrawBtn = page.locator('button').filter({ hasText: /탈퇴/ }).first();
  if (await withdrawBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await withdrawBtn.click({ force: true });
    await page.waitForTimeout(600);
    await shot(page, '03', 'mypage-withdraw-dev', '탈퇴 안내 (개발자 계정)');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }
});

test('03c: 새 계정 마이페이지 0%·회복일기 잠김', async ({ page }) => {
  // 새 계정: onboard 호출 (이미 있으면 건너뜀, 없으면 생성)
  await onboard(page, '03-fresh@example.com', '새카');

  // 마이페이지 (진행도 0%)
  await gotoHash(page, 'mypage');
  await expect(page).toHaveURL(/#mypage/);
  await page.waitForTimeout(600);
  await shot(page, '03', 'mypage-fresh-0percent', '마이페이지 - 새 계정 (진행도 0%)');

  // 회복일기 탭 (잠김 상태)
  await gotoHash(page, 'analysis');
  await expect(page).toHaveURL(/#analysis/, { timeout: 10_000 });
  await page.waitForTimeout(600);
  await shot(page, '03', 'diary-fresh-locked', '회복일기 탭 - 새 계정 (잠금)');
});
