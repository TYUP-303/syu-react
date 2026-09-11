// 하네스 검증용 — 온보딩 헬퍼(계정 → 약관 → 캐릭터 → 검사 2종 → 홈)가 끝까지 도는지 본다.
import { test, expect } from '@playwright/test';
import { onboard, shot } from './helpers';

test('하네스: 온보딩 헬퍼가 홈까지 간다', async ({ page }) => {
  await onboard(page, 'harness2@example.com');
  await expect(page).toHaveURL(/#home/);
  await shot(page, '00', 'home-after-onboard', '온보딩 완료 직후 홈');
});
