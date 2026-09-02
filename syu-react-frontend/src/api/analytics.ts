// src/api/analytics.ts
// Firebase Analytics(GA4) 이벤트 기록의 얇은 래퍼.
//
// 이 서비스는 백엔드 API 서버가 없어, 가입 실패 같은 클라이언트 사건이 서버
// 어디에도 남지 않는다. 2026-08-30 김영원 선생님의 "회원가입 실패" 신고를
// Firebase Auth 계정 상태로 역추적해야 했던 것이 그 대가였다(감사 로그는
// 비활성, 실패를 세는 서버 메트릭도 없음). 실패를 GA4 이벤트로 남겨 두면
// 다음부터는 Analytics 대시보드/BigQuery에서 시각별로 바로 확인된다.
//
// analytics 인스턴스는 Mock 모드·에뮬레이터·비브라우저(jsdom/SSR)에서 null이다
// (api/firebase.ts 참조). 그때는 조용히 no-op이며, 계측 자체의 실패가 앱 흐름을
// 막아서는 안 되므로 예외도 삼킨다.

import { logEvent } from 'firebase/analytics';
import { analytics } from './firebase';

/**
 * GA4 커스텀 이벤트를 기록합니다. 보낼 곳이 없으면(analytics === null) 아무 일도
 * 하지 않습니다. 이벤트 이름은 GA4 규칙(소문자·언더스코어·40자 이내)을 따릅니다.
 */
export function trackEvent(
  name: string,
  params?: Record<string, string | number | boolean>
): void {
  if (!analytics) return;
  try {
    logEvent(analytics, name, params);
  } catch {
    // 계측 실패는 무시한다 — 분석은 부수 기능이고, 여기서 던지면 호출부의
    // 정상 흐름(에러 처리 등)까지 함께 끊긴다.
  }
}

/** 예외 객체에서 Firebase 에러 코드를 안전하게 뽑습니다(없으면 'unknown'). */
export function errorCode(err: unknown): string {
  return (err as { code?: string })?.code ?? 'unknown';
}
