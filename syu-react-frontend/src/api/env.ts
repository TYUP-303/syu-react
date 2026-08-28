// src/api/env.ts
// 환경 판별 플래그의 단일 출처(single source of truth).
//
// Firebase 실 연동 여부는 VITE_FIREBASE_API_KEY 하나로 결정합니다.
// 키가 비어 있거나 .env.example의 플레이스홀더(`your_api_key`)가 그대로 남아 있으면
// Mock 모드로 간주하고, 각 스토어는 Firestore 대신 localStorage를 사용합니다.
//
// ⚠️ useAuthStore는 이 플래그를 따르지 않고 항상 실제 Firebase Auth를 사용합니다(의도된 예외).
//    그래서 키가 설정되지 않은 환경에서는 "로그인만 실패하고 캐릭터/검사/시나리오는
//    정상 동작하는" 상태가 됩니다. 새 환경에서 이 증상이 보이면 .env.local부터 확인하세요.
//    배경은 useAuthStore.ts 상단 주석 참고.

export const IS_MOCK_MODE =
  !import.meta.env.VITE_FIREBASE_API_KEY ||
  import.meta.env.VITE_FIREBASE_API_KEY.includes('your_api_key');
