// e2e/screenshots/playwright.config.ts
// README·최종보고서용 화면 캡처 전용 설정. 검증(test:e2e)과 분리한다 —
// 여기 spec은 통과/실패보다 "파일이 남는 것"이 목적이라 같은 러너에 섞지 않는다.
//
// 실행 (에뮬레이터 + dev 서버는 미리 띄워 둔다 — package.json 의 emulators:start,
// dev 서버는 e2e/../playwright.config.ts 의 webServer 명령과 같은 환경변수로):
//   npx playwright test -c e2e/screenshots/playwright.config.ts
//   SHOT_OUT=<저장 폴더> 로 저장 위치를 바꾼다 (기본은 helpers.ts 참조).
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: /.*\.shots\.ts/,
  fullyParallel: true,
  workers: 5,
  retries: 0,
  // 온보딩 헬퍼(검사 2종)가 병렬 부하에서 1~2분 걸리고, 한 test() 안에서 계정을
  // 둘 쓰면 그 두 배다.
  timeout: 600_000,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5199',
    // iPhone 17 (402×874pt, 3배율) — Playwright 프리셋의 viewport 는 브라우저 크롬을
    // 뺀 높이(681)라, 캡처는 폰 화면 전체 비율로 맞춘다.
    ...devices['iPhone 17'],
    // 프리셋의 기본 브라우저는 WebKit 인데 설치돼 있지 않다. 기존 e2e 도 Chromium
    // (Pixel 7)이라 같은 엔진으로 맞춘다 — 치수·배율·터치만 iPhone 17.
    defaultBrowserType: 'chromium',
    viewport: { width: 402, height: 874 },
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    colorScheme: 'light',
  },
});
