// e2e/smoke.spec.ts
// P0 인프라 검증용: 에뮬레이터 + dev 서버 + 모바일 뷰포트에서 앱이 뜨는지만 확인
import { test, expect } from '@playwright/test';

test('랜딩 페이지가 렌더링된다', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#root')).not.toBeEmpty();
});
