// src/utils/lastLoginMethod.ts
// "가장 최근에 로그인" 뱃지가 참조하는 로그인 수단의 단일 출처.
//
// 로그인이 성공하면 useAuthStore가 수단을 기록하고, 다음 방문 때 로그인
// 화면이 그 값을 읽어 해당 버튼 위에 뱃지를 띄운다. 키 문자열이 스토어와
// 화면 양쪽에 흩어져 있으면 한쪽만 고쳐도 조용히 어긋나므로(실제로
// 이메일 경로는 기록만 되고 표시가 없었다) 여기 한 곳에 모은다.
//
// localStorage 접근은 try/catch로 감싼다 — 사파리 프라이빗 모드처럼
// 스토리지가 막힌 환경에서 throw하면 로그인 흐름 자체가 끊긴다.
// 뱃지는 편의 기능이므로 실패는 조용히 무시하는 것이 맞다.

export type LastLoginMethod = 'email' | 'google';

/** 기존 사용자 기록과의 호환을 위해 키 이름은 바꾸지 않는다. */
const STORAGE_KEY = 'react_last_login_method';

/** 로그인 성공 직후 호출한다. 실패한 로그인은 기록하지 않는다. */
export function rememberLastLoginMethod(method: LastLoginMethod): void {
  try {
    localStorage.setItem(STORAGE_KEY, method);
  } catch {
    // 기록 실패는 뱃지가 안 뜨는 것으로 끝난다.
  }
}

/** 저장된 값이 알 수 없는 문자열이면 null로 취급한다(뱃지 미표시). */
export function getLastLoginMethod(): LastLoginMethod | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === 'email' || raw === 'google' ? raw : null;
  } catch {
    return null;
  }
}
