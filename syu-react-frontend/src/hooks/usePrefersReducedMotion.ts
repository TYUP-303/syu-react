// src/hooks/usePrefersReducedMotion.ts
// `prefers-reduced-motion: reduce` 구독 훅.
//
// 원래 useEndingSequence 안에 사적으로 들어 있던 함수다. 2026-08-14 플레이어
// 재설계에서 시나리오 플레이어도 같은 판단(타이핑 연출·시트 등장 모션을 끌지)을
// 필요로 하게 되어 공용 위치로 끌어올렸다. 두 벌로 두면 한쪽만 고쳐지는 날이 온다.
//
// window.matchMedia가 없는 환경(jsdom 기본)에서는 false로 떨어진다 — 옵셔널
// 체이닝을 지우지 말 것. 테스트가 전부 이 경로로 돈다.

import { useEffect, useState } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => window.matchMedia?.(QUERY).matches ?? false);

  useEffect(() => {
    const query = window.matchMedia?.(QUERY);
    if (!query) return;
    const handleChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener('change', handleChange);
    return () => query.removeEventListener('change', handleChange);
  }, []);

  return reduced;
}
