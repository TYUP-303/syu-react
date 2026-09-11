// e2e/screenshots/01-entry.shots.ts
// 01 진입 화면 번들 — 랜딩, 로그인, 회원가입, 비로그인 #home 접근

import { test, expect } from '@playwright/test';
import {
  shot,
  createVerifiedAccount,
  login,
  gotoHash,
  PASSWORD,
} from './helpers';

test.describe('01-entry', () => {
  // ──────────────────────────────────────────
  // 랜딩 페이지
  // ──────────────────────────────────────────
  test('01 landing top', async ({ page }) => {
    await gotoHash(page, 'landing');
    await shot(page, '01', 'landing-top', 'hero section');
  });

  test('02 landing domains', async ({ page }) => {
    await gotoHash(page, 'landing');
    // 도메인 카드 영역까지 스크롤 (섹션 2)
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(600);
    await shot(page, '01', 'landing-domains', '4개 도메인 카드');
  });

  // ──────────────────────────────────────────
  // 로그인 페이지
  // ──────────────────────────────────────────
  test('03 login empty', async ({ page }) => {
    await gotoHash(page, 'login');
    await shot(page, '01', 'login-empty', '빈 상태');
  });

  test('04 login filled', async ({ page }) => {
    await gotoHash(page, 'login');
    await page.getByPlaceholder('이메일 주소를 입력하세요').fill('01-login@example.com');
    await page.getByPlaceholder('••••••••').fill('password123');
    await shot(page, '01', 'login-filled', '이메일과 비밀번호 입력');
  });

  test('05 login error', async ({ page }) => {
    await gotoHash(page, 'login');
    // 존재하지 않는 계정으로 로그인 시도
    await page.getByPlaceholder('이메일 주소를 입력하세요').fill('nonexistent@example.com');
    await page.getByPlaceholder('••••••••').fill('wrongpassword');
    await page.locator('button[type="submit"]').click();
    // 오류 메시지 대기
    await expect(page.locator('p.text-error')).toBeVisible({ timeout: 10_000 });
    await shot(page, '01', 'login-error', '잘못된 비밀번호 오류');
  });

  test('06 signup step1 unchecked', async ({ page }) => {
    await gotoHash(page, 'signup');
    await shot(page, '01', 'signup-step1-unchecked', '체크 전 (다음 버튼 비활성)');
  });
});
