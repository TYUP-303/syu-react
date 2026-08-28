// src/components/ending/useEndingSequence.ts
// 엔딩 챕터 전환 상태 머신.
//
// 챕터는 "페이드 아웃 → 교체 → 페이드 인" 3단계를 거친다. 교체를 페이드 아웃이
// 끝난 뒤로 미루지 않으면 글자가 사라지기 전에 다음 문단으로 바뀌어 두 텍스트가
// 겹쳐 보인다. 그래서 목적지를 pending에 담아 두고, 아웃이 끝나면 그때 옮긴다.
//
// ⚠️ pending은 반드시 state여야 한다. ref로 두면 값이 바뀌어도 리렌더가 없어
// 교체 타이머를 거는 effect가 실행되지 않는다. 실제로 2026-08-07 이전에는
// pendingRef를 썼는데, 챕터가 교체된 직후(visible이 아직 false인 20ms 창)에
// goTo가 불리면 setVisible(false)가 상태를 바꾸지 못해 리렌더가 일어나지
// 않았고, 그대로 전환이 영구히 멎었다. 방향키를 연타하면 쉽게 재현됐다.
//
// 자동 진행과 탭 전환은 같은 goTo를 쓴다. 탭하면 자동 진행 타이머가 걸려 있던
// effect가 index 변경으로 정리되므로 별도 취소 로직이 없다.

import { useCallback, useEffect, useState } from 'react';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';

/** 페이드 인 — 등장은 천천히 */
export const FADE_IN_MS = 600;
/** 페이드 아웃 — 퇴장은 빠르게 (대기 시간으로 체감되지 않도록) */
export const FADE_OUT_MS = 400;
/** prefers-reduced-motion일 때의 전환 시간 */
const REDUCED_FADE_MS = 120;
/**
 * 챕터 교체 후 페이드 인을 시작하기까지의 지연.
 * 0이면 브라우저가 opacity 변화를 한 프레임으로 합쳐 트랜지션을 건너뛴다.
 */
const ENTER_DELAY_MS = 20;

export interface EndingSequence {
  /** 현재 챕터 인덱스 */
  index: number;
  /** true면 페이드 인 상태, false면 페이드 아웃 상태 */
  visible: boolean;
  reducedMotion: boolean;
  fadeInMs: number;
  fadeOutMs: number;
  goTo: (next: number) => void;
  next: () => void;
  prev: () => void;
}

/**
 * @param durations 챕터별 체류 시간(ms). 길이가 곧 전체 챕터 수이며,
 *                  마지막 챕터는 자동 진행하지 않으므로 그 값은 쓰이지 않는다.
 *                  렌더마다 새 배열을 넘기면 타이머가 리셋되니 상수를 넘길 것.
 */
export function useEndingSequence(durations: readonly number[]): EndingSequence {
  const total = durations.length;
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(false);
  /** 전환 목적지. null이면 전환 중이 아니다. */
  const [pending, setPending] = useState<number | null>(null);

  const reducedMotion = usePrefersReducedMotion();
  const fadeInMs = reducedMotion ? REDUCED_FADE_MS : FADE_IN_MS;
  const fadeOutMs = reducedMotion ? REDUCED_FADE_MS : FADE_OUT_MS;

  const goTo = useCallback(
    (nextIndex: number) => {
      if (nextIndex < 0 || nextIndex >= total) return;
      // 전환이 진행 중이면 무시한다. 연타해도 한 칸씩만 움직인다.
      if (nextIndex === index || pending !== null) return;
      setPending(nextIndex);
      setVisible(false);
    },
    [index, total, pending],
  );

  const next = useCallback(() => goTo(index + 1), [goTo, index]);
  const prev = useCallback(() => goTo(index - 1), [goTo, index]);

  // 챕터가 교체되면 한 프레임 뒤 페이드 인을 시작한다.
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), ENTER_DELAY_MS);
    return () => clearTimeout(timer);
  }, [index]);

  // 페이드 아웃이 끝나야 실제로 챕터를 교체한다.
  // pending을 의존성으로 두는 것이 핵심이다. visible에만 기대면 이미 false인
  // 상태에서 시작된 전환을 감지하지 못한다.
  useEffect(() => {
    if (pending === null) return;
    const timer = setTimeout(() => {
      setIndex(pending);
      setPending(null);
    }, fadeOutMs);
    return () => clearTimeout(timer);
  }, [pending, fadeOutMs]);

  // 자동 진행. 마지막 챕터(크레딧)에서는 멈추고 사용자의 닫기를 기다린다.
  useEffect(() => {
    if (!visible || pending !== null || index >= total - 1) return;
    const timer = setTimeout(() => goTo(index + 1), durations[index]);
    return () => clearTimeout(timer);
  }, [visible, pending, index, total, durations, goTo]);

  return { index, visible, reducedMotion, fadeInMs, fadeOutMs, goTo, next, prev };
}
