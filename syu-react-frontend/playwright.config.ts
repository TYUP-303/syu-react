import { defineConfig, devices } from '@playwright/test';

// 이 앱은 MobileWrapper(max-w 430px, h-[100dvh]) 프레임 전제이므로 모바일 뷰포트로 고정한다.
export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: 'http://localhost:5199',
    ...devices['Pixel 7'],
    viewport: { width: 430, height: 932 },
  },
  webServer: [
    {
      command:
        'PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH" npx firebase emulators:start --project demo-syu',
      url: 'http://127.0.0.1:4000',
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      // 프로젝트 ID를 시드 스크립트와 같은 demo-syu로 덮어써야 시드 데이터가 보인다
      // (.env.local의 실 프로젝트 ID로 붙으면 에뮬레이터 안에서 네임스페이스가 갈린다)
      command:
        'VITE_USE_EMULATOR=true VITE_FIREBASE_API_KEY=fake-api-key VITE_FIREBASE_PROJECT_ID=demo-syu npm run dev -- --port 5199 --strictPort',
      url: 'http://localhost:5199',
      reuseExistingServer: true,
    },
  ],
});
