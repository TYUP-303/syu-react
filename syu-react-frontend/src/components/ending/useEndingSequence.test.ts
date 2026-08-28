// src/components/ending/useEndingSequence.test.ts
// @vitest-environment jsdom
// 챕터 전환 상태 머신의 회귀 테스트.
//
// 이 훅은 "페이드 아웃 → 교체 → 페이드 인" 사이에 좁은 타이밍 창이 여럿 있어
// 눈으로는 잡기 어려운 방식으로 멈출 수 있다. 실제로 2026-08-07에 방향키를
// 연타하면 전환이 영구히 멎는 버그가 있었다(아래 테스트가 그 재현이다).

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEndingSequence } from './useEndingSequence';

/** 챕터 3개짜리 시퀀스. 마지막 값은 자동 진행이 없어 쓰이지 않는다. */
const DURATIONS = [5_000, 5_000, 5_000];

/**
 * 페이드 인이 끝나 "보이는" 상태가 될 때까지 시간을 흘린다.
 * 두 번 나눠 흘리는 이유: 첫 흐름에서 교체 타이머가 setIndex를 부르면 그로 인한
 * effect(페이드 인 예약)는 act 경계에서야 등록되므로, 같은 흐름 안에서는 실행되지
 * 않는다. 한 번 더 흘려야 등장까지 끝난다.
 */
const settle = () => {
  act(() => void vi.advanceTimersByTime(1_000));
  act(() => void vi.advanceTimersByTime(1_000));
};

describe('useEndingSequence', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('첫 챕터가 페이드 인된다', () => {
    const { result } = renderHook(() => useEndingSequence(DURATIONS));

    expect(result.current.index).toBe(0);
    settle();
    expect(result.current.visible).toBe(true);
  });

  it('next()로 다음 챕터로 넘어간다', () => {
    const { result } = renderHook(() => useEndingSequence(DURATIONS));
    settle();

    act(() => result.current.next());
    settle();

    expect(result.current.index).toBe(1);
    expect(result.current.visible).toBe(true);
  });

  it('체류 시간이 지나면 자동으로 넘어간다', () => {
    const { result } = renderHook(() => useEndingSequence(DURATIONS));
    settle();

    act(() => void vi.advanceTimersByTime(DURATIONS[0]));
    settle();

    expect(result.current.index).toBe(1);
  });

  it('마지막 챕터에서는 자동으로 넘어가지 않는다', () => {
    const { result } = renderHook(() => useEndingSequence(DURATIONS));
    settle();
    act(() => result.current.goTo(2));
    settle();

    act(() => void vi.advanceTimersByTime(60_000));

    expect(result.current.index).toBe(2);
  });

  // ── 회귀: 방향키 연타 ────────────────────────────────────────
  // 챕터가 교체된 직후에는 아직 visible이 false다(페이드 인 시작 전).
  // 이 좁은 창에서 goTo가 불리면 setVisible(false)가 상태를 바꾸지 못해
  // 리렌더가 일어나지 않았고, 교체 타이머를 거는 effect가 재실행되지 않아
  // 전환이 영구히 멎었다. 자동 진행도 함께 멈춰 세그먼트 바가 가득 찬 채로
  // 아무 일도 일어나지 않았다.
  it('챕터 교체 직후 곧바로 넘겨도 멈추지 않는다', () => {
    const { result } = renderHook(() => useEndingSequence(DURATIONS));
    settle();

    act(() => result.current.next());
    // 페이드 아웃(400ms)이 끝나 교체되는 순간까지만 흘린다.
    // 아직 페이드 인(20ms)은 시작되지 않았다.
    act(() => void vi.advanceTimersByTime(400));
    act(() => result.current.next());
    settle();

    expect(result.current.index).toBe(2);
  });

  it('연타해도 이후 자동 진행이 살아 있다', () => {
    const { result } = renderHook(() => useEndingSequence(DURATIONS));
    settle();

    act(() => result.current.next());
    act(() => void vi.advanceTimersByTime(400));
    act(() => result.current.next());
    settle();

    // 마지막 챕터에 도달했으므로 더는 자동 진행하지 않아야 한다.
    expect(result.current.index).toBe(2);
    expect(result.current.visible).toBe(true);
  });

  it('전환 중에 들어온 요청은 무시하되 상태를 망가뜨리지 않는다', () => {
    const { result } = renderHook(() => useEndingSequence(DURATIONS));
    settle();

    act(() => {
      result.current.next();
      result.current.next();
      result.current.next();
    });
    settle();

    // 한 칸만 이동하고, 이후 조작도 정상이어야 한다.
    expect(result.current.index).toBe(1);

    act(() => result.current.next());
    settle();
    expect(result.current.index).toBe(2);
  });

  it('범위를 벗어난 이동은 무시한다', () => {
    const { result } = renderHook(() => useEndingSequence(DURATIONS));
    settle();

    act(() => result.current.prev());
    settle();

    expect(result.current.index).toBe(0);
  });
});
