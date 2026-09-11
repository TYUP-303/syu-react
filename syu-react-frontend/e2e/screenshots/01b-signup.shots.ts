// e2e/screenshots/01b-signup.shots.ts
// 01b 회원가입 흐름 번들 — 약관(Step1) · 이메일/비밀번호(Step2) · 이메일 인증(Step3)
// · 가입 완료(Step4) · 가입 중단 확인 모달, 그리고 로그인 화면의 비밀번호 재설정.
//
// 01-entry.shots.ts 는 회원가입을 Step 1 첫 화면 한 장에서 멈춘다. 그 뒤는
// 실제로 UI 로 가입을 끝까지 밟아야 나오는 화면들이라 여기서 따로 찍는다.
//
// 선택자 메모 (src/pages/SignupPage.tsx):
//   - 체크박스에 id 는 없지만 전부 `input.signup-checkbox` 이고 DOM 순서가
//     [모두 동의, 이용약관, 개인정보, (마케팅)] 이다. appearance:none 일 뿐
//     실제로 보이는 요소라 그냥 click 하면 켜진다.
//   - 버튼에는 id 가 있다: #btn-signup-step1-next · #btn-signup-step2-next ·
//     #btn-signup-verify · #btn-signup-finish. Step 2 의 button[type=submit]
//     은 엔터 제출용 hidden 이라 쓰지 않는다.
//   - 전문 열람 버튼의 접근 이름은 COPY.consent.viewDocumentLabel(title) →
//     '이용약관 전문 보기' 등.
//
// 병렬 워커가 같은 순번을 동시에 집어 파일을 덮어쓰지 않도록 serial 로 돈다.

import { test, expect, type Page } from '@playwright/test';
import { shot, createVerifiedAccount, gotoHash, PASSWORD } from './helpers';

test.describe.configure({ mode: 'serial' });

/** AlertDialog / LegalDocumentSheet 의 [확인] 을 눌러 닫는다. */
async function closeDialog(page: Page): Promise<void> {
  const confirm = page.getByRole('button', { name: '확인', exact: true });
  await confirm.first().click();
  await expect(confirm.first()).toBeHidden({ timeout: 5_000 });
}

test.describe('01b-signup', () => {
  test('회원가입 3단계 전 과정', async ({ page }) => {
    const email = `01b-${Date.now()}@example.com`;

    // ── Step 1 · 약관 동의 ──────────────────────────────
    await gotoHash(page, 'signup');
    await expect(page.getByRole('heading', { name: '이메일 회원가입' })).toBeVisible({ timeout: 15_000 });
    const next1 = page.locator('#btn-signup-step1-next');
    await expect(next1).toBeDisabled();
    await shot(page, '01b', 'signup-step1-unchecked', 'STEP 1 약관 — 체크 전, [다음] 비활성');

    // '모두 동의' = 첫 번째 체크박스. 켜면 필수 2건(+노출 중이면 마케팅)이 따라 켜진다.
    const boxes = page.locator('input.signup-checkbox');
    // 마케팅 행은 settings/legal.marketingConsentEnabled 가 정하므로 개수가 3 또는 4다.
    const boxCount = await boxes.count();
    expect(boxCount).toBeGreaterThanOrEqual(3);
    await boxes.first().click();
    for (let i = 1; i < boxCount; i++) await expect(boxes.nth(i)).toBeChecked();
    await expect(next1).toBeEnabled();
    await shot(page, '01b', 'signup-step1-all-agreed', "STEP 1 — '모두 동의' 체크 후 [다음] 활성");

    // 이용약관 전문 시트
    await page.getByRole('button', { name: '이용약관 전문 보기' }).click();
    await expect(page.getByRole('heading', { name: '이용약관' })).toBeVisible({ timeout: 5_000 });
    await shot(page, '01b', 'signup-step1-terms-document', "약관 '전문 보기' 시트 (이용약관 전문)");
    await closeDialog(page);

    // 개인정보 처리방침 전문 시트
    await page.getByRole('button', { name: '개인정보 처리방침 전문 보기' }).click();
    await expect(page.getByRole('heading', { name: '개인정보 처리방침' })).toBeVisible({ timeout: 5_000 });
    await shot(page, '01b', 'signup-step1-privacy-document', "약관 '전문 보기' 시트 (개인정보 처리방침 전문)");
    await closeDialog(page);

    // ── Step 2 · 이메일 / 비밀번호 ──────────────────────
    await next1.click();
    const next2 = page.locator('#btn-signup-step2-next');
    await expect(next2).toBeVisible({ timeout: 10_000 });
    await expect(next2).toBeDisabled();
    await shot(page, '01b', 'signup-step2-empty', 'STEP 2 이메일/비밀번호 — 빈 폼');

    await page.locator('#signup-email').fill(email);
    await page.locator('#signup-password').fill(PASSWORD);
    // 일부러 틀린 확인값 → COPY.errors.passwordMismatch 노출
    await page.locator('#signup-confirm-password').fill('password999');
    await expect(page.getByText('비밀번호가 일치하지 않습니다.')).toBeVisible({ timeout: 5_000 });
    await expect(next2).toBeDisabled();
    await shot(page, '01b', 'signup-step2-password-mismatch', 'STEP 2 — 비밀번호 확인 불일치 오류');

    await page.locator('#signup-confirm-password').fill(PASSWORD);
    await expect(next2).toBeEnabled({ timeout: 5_000 });
    await shot(page, '01b', 'signup-step2-filled', 'STEP 2 — 이메일·비밀번호·확인 입력 완료, [다음] 활성');

    // ── Step 3 · 이메일 인증 ────────────────────────────
    await next2.click();
    const verify = page.locator('#btn-signup-verify');
    await expect(verify).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('heading', { name: '이메일 인증' })).toBeVisible();
    await shot(page, '01b', 'signup-step3-verify-wait', 'STEP 3 이메일 인증 안내 (가입 계정 주소 표시)');

    // 인증 메일 다시 받기 → COPY.signup.resendSuccess
    await page.getByRole('button', { name: '인증 메일 다시 받기' }).click();
    await expect(page.getByText('인증 메일을 다시 보냈습니다.', { exact: false })).toBeVisible({ timeout: 10_000 });
    await shot(page, '01b', 'signup-step3-resend-sent', "STEP 3 — '인증 메일 다시 받기' 후 재발송 안내");
    await closeDialog(page);

    // 인증 전 '인증 완료 확인' → COPY.signup.verifyIncomplete
    await verify.click();
    await expect(page.getByText('아직 이메일 인증이 완료되지 않았습니다.', { exact: false })).toBeVisible({
      timeout: 10_000,
    });
    await shot(page, '01b', 'signup-step3-verify-incomplete', 'STEP 3 — 인증 전 확인 시 미완료 안내');
    await closeDialog(page);

    // 닫기(X) → 가입 중단 확인 모달 (Step 3 에서만 뜬다)
    await page.getByRole('button', { name: '닫기' }).click();
    await expect(page.getByRole('heading', { name: '가입을 잠시 멈출까요?' })).toBeVisible({ timeout: 5_000 });
    await shot(page, '01b', 'signup-step3-exit-confirm', 'STEP 3 닫기(X) — 가입 중단 확인 모달');
    await page.getByRole('button', { name: '계속하기' }).click();
    await expect(verify).toBeVisible({ timeout: 5_000 });

    // 에뮬레이터에서 emailVerified 를 켜고 다시 확인 → Step 4
    await createVerifiedAccount(email);
    await verify.click();
    await expect(page.getByRole('heading', { name: '가입이 완료되었습니다!' })).toBeVisible({ timeout: 20_000 });
    await shot(page, '01b', 'signup-step4-complete', 'STEP 4 가입 완료 — 등록된 이메일 카드');

    // 시작하기 → 홈(캐릭터 없음 상태)
    await page.locator('#btn-signup-finish').click();
    await expect(page).toHaveURL(/#home/, { timeout: 20_000 });
    await page.waitForTimeout(1_200);
    // 가입 때 동의를 기록했으므로 약관 게이트가 홈을 덮지 않아야 한다.
    await expect(page.locator('#btn-consent-agree')).toBeHidden();
    await shot(page, '01b', 'signup-after-finish-home', '가입 직후 [시작하기] → 홈 (캐릭터 생성 전)');
  });

  test('로그인 화면 비밀번호 재설정', async ({ page }) => {
    const email = `01b-reset-${Date.now()}@example.com`;
    await createVerifiedAccount(email);

    // 이메일을 비워 두고 누르면 상단 입력을 요구한다 (COPY.errors.resetEmailRequired)
    await gotoHash(page, 'login');
    await page.getByRole('button', { name: '비밀번호 재설정' }).click();
    await expect(page.getByText('비밀번호를 재설정할 이메일을 상단에 입력해 주세요.')).toBeVisible({
      timeout: 10_000,
    });
    await shot(page, '01b', 'login-reset-email-required', '비밀번호 재설정 — 이메일 미입력 안내');

    // 이메일을 채우고 다시 누르면 발송 완료 (COPY.login.resetEmailSent)
    await page.getByPlaceholder('이메일 주소를 입력하세요').fill(email);
    await page.getByRole('button', { name: '비밀번호 재설정' }).click();
    await expect(page.getByText('비밀번호 재설정 이메일이 발송되었습니다.', { exact: false })).toBeVisible({
      timeout: 10_000,
    });
    await shot(page, '01b', 'login-reset-email-sent', '비밀번호 재설정 — 발송 완료 안내 다이얼로그');
    await closeDialog(page);
  });
});
