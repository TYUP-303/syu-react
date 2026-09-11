import { test, expect } from '@playwright/test';
import {
  shot,
  createVerifiedAccount,
  login,
  acceptConsent,
  createCharacter,
  completeTest,
  gotoHash,
  STRESS_COGNITIVE,
} from './helpers';

/**
 * 온보딩 및 검사 화면 캡처 (02-onboard)
 */

test('온보딩 및 검사', async ({ page }) => {
  const ts = Date.now();
  const email = `02-a-${ts}@example.com`;

  // 1. 약관 동의
  await createVerifiedAccount(email);
  await login(page, email);
  await expect(page.locator('#btn-consent-agree')).toBeVisible({ timeout: 5_000 });
  await shot(page, '02', 'consent-unchecked', '필수 약관 미체크');

  // 필수 체크 후
  await page.locator('#consent-terms').click({ force: true });
  await page.locator('#consent-privacy').click({ force: true });
  await expect(page.locator('#btn-consent-agree')).toBeEnabled();
  await shot(page, '02', 'consent-checked', '필수 체크 후');

  // 동의
  await page.locator('#btn-consent-agree').click();
  await expect(page.locator('#btn-consent-agree')).toBeHidden({ timeout: 10_000 });

  // 2. 캐릭터 없는 홈
  await expect(page).toHaveURL(/#home/, { timeout: 15_000 });
  await shot(page, '02', 'home-no-character', '캐릭터 없는 홈');

  // 3. 캐릭터 생성
  await gotoHash(page, 'character-creation');
  await expect(page).toHaveURL(/#character-creation/, { timeout: 10_000 });
  await shot(page, '02', 'character-creation-init', '초기 상태');

  await page.getByRole('button', { name: /여자/ }).click();
  await shot(page, '02', 'character-creation-female', '여성 선택');

  await page.locator('#nickname').fill('백설이');
  await shot(page, '02', 'character-creation-nickname', '닉네임 입력');

  await page.getByRole('button', { name: '캐릭터 만들기' }).click();
  await expect(page.getByRole('button', { name: '검사 시작하기' })).toBeVisible({ timeout: 10_000 });
  await shot(page, '02', 'character-creation-complete', '완료 모달');

  // 4. ADHD 검사
  await page.getByRole('button', { name: '검사 시작하기' }).click();
  await expect(page).toHaveURL(/#test-adhd/, { timeout: 10_000 });
  await shot(page, '02', 'test-adhd-prep', '준비 화면');

  await page.getByRole('button', { name: '검사 시작하기' }).click();
  await expect(page.locator('button:not([aria-label="검사 닫기"])').first()).toBeVisible({ timeout: 10_000 });
  await shot(page, '02', 'test-adhd-q1-blank', 'Q1 - 답 없음');

  const answers = page
    .locator('button:not([aria-label="검사 닫기"])')
    .filter({ hasNotText: /^이전$|다음 문항으로|검사 결과 제출하기|제출 중/ });

  await answers.nth(2).click();
  await shot(page, '02', 'test-adhd-q1-answered', 'Q1 - 답 선택 후');

  // Q2~Q5 진행
  const next = page.getByRole('button', { name: '다음 문항으로' });
  for (let i = 0; i < 4; i++) {
    await next.click();
    await expect(answers.first()).toBeVisible({ timeout: 10_000 });
    await answers.nth(2).click();
  }

  // Q6 진행
  await next.click();
  await expect(page.getByRole('button', { name: '검사 결과 제출하기' })).toBeVisible({ timeout: 10_000 });
  await shot(page, '02', 'test-adhd-q6-last', 'Q6 - 제출 버튼');

  await answers.nth(2).click();
  await page.getByRole('button', { name: '검사 결과 제출하기' }).click();

  // 결과
  await expect(page.getByRole('button', { name: /다음 검사 진행/ })).toBeVisible({ timeout: 15_000 });
  await shot(page, '02', 'test-adhd-result', 'ADHD 결과');

  // 5. 스트레스 검사
  await page.getByRole('button', { name: /다음 검사 진행/ }).click();
  await expect(page).toHaveURL(/#test-stress/, { timeout: 10_000 });
  await shot(page, '02', 'test-stress-prep', '스트레스 준비');

  await page.getByRole('button', { name: '검사 시작하기' }).click();
  await expect(
    page.locator('button:not([aria-label="검사 닫기"])').first(),
  ).toBeVisible({ timeout: 10_000 });
  await shot(page, '02', 'test-stress-q1', '스트레스 Q1');

  // 완료 (인지형: 앞 4개 예, 나머지 아니요)
  await completeTest(page, STRESS_COGNITIVE);
  await shot(page, '02', 'test-stress-result-cognitive', '스트레스 결과 - 인지형');

  // 홈으로
  const homeBtn = page.getByRole('button', { name: '홈 화면으로 돌아가기' });
  if (await homeBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await homeBtn.click();
  } else {
    await page.goto('/#home');
  }

  await expect(page).toHaveURL(/#home/, { timeout: 15_000 });
  await shot(page, '02', 'home-all-done', '홈 - 검사 완료');

  // 6. 검사 닫기 모달 (새 검사에서)
  await gotoHash(page, 'test-stress');
  const prepBtn = page.getByRole('button', { name: '검사 시작하기' });
  if (await prepBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await prepBtn.click();
    await expect(page.locator('button[aria-label="검사 닫기"]')).toBeVisible({ timeout: 10_000 });
    await page.locator('button[aria-label="검사 닫기"]').click();

    const exitText = page.getByText('정말 검사를 나가시겠어요?');
    if (await exitText.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await shot(page, '02', 'test-exit-confirm', '검사 닫기 모달');
      await page.getByRole('button', { name: '계속 검사하기' }).click();
    }
  }
});

test.skip('스트레스 판별 불가', async ({ page }) => {
  // 판별 불가 테스트는 별도로 구현 필요
});
