import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useRestTimer } from './useRestTimer';

describe('useRestTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts stopped, seeded from defaultSeconds', () => {
    const { result } = renderHook(() => useRestTimer(90));
    expect(result.current.secondsLeft).toBe(90);
    expect(result.current.running).toBe(false);
  });

  it('start begins a running countdown that ticks once per second', () => {
    const { result } = renderHook(() => useRestTimer(5));

    act(() => result.current.start());
    expect(result.current.running).toBe(true);
    expect(result.current.secondsLeft).toBe(5);

    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.secondsLeft).toBe(4);

    act(() => vi.advanceTimersByTime(3000));
    expect(result.current.secondsLeft).toBe(1);
  });

  it('stops ticking once it reaches zero', () => {
    const { result } = renderHook(() => useRestTimer(2));
    act(() => result.current.start());
    act(() => vi.advanceTimersByTime(3000));
    expect(result.current.secondsLeft).toBe(0);
    expect(result.current.running).toBe(false);

    // No further ticks (and no crash from a stale interval) once stopped.
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.secondsLeft).toBe(0);
  });

  it('pause stops the countdown without resetting secondsLeft', () => {
    const { result } = renderHook(() => useRestTimer(10));
    act(() => result.current.start());
    act(() => vi.advanceTimersByTime(3000));
    expect(result.current.secondsLeft).toBe(7);

    act(() => result.current.pause());
    expect(result.current.running).toBe(false);

    act(() => vi.advanceTimersByTime(5000));
    expect(result.current.secondsLeft).toBe(7);
  });

  it('reset returns to defaultSeconds and stops running', () => {
    const { result } = renderHook(() => useRestTimer(20));
    act(() => result.current.start());
    act(() => vi.advanceTimersByTime(5000));
    act(() => result.current.reset());
    expect(result.current.secondsLeft).toBe(20);
    expect(result.current.running).toBe(false);
  });

  it('clears the interval on unmount (no crash on further timer advances)', () => {
    const { result, unmount } = renderHook(() => useRestTimer(10));
    act(() => result.current.start());
    unmount();
    expect(() => act(() => vi.advanceTimersByTime(5000))).not.toThrow();
  });

  it('updates the idle countdown when defaultSeconds changes while not running', () => {
    const { result, rerender } = renderHook(({ seconds }) => useRestTimer(seconds), {
      initialProps: { seconds: 120 },
    });
    expect(result.current.secondsLeft).toBe(120);

    rerender({ seconds: 90 });
    expect(result.current.secondsLeft).toBe(90);
  });

  it('does not interrupt a running countdown when defaultSeconds changes', () => {
    const { result, rerender } = renderHook(({ seconds }) => useRestTimer(seconds), {
      initialProps: { seconds: 120 },
    });
    act(() => result.current.start());
    act(() => vi.advanceTimersByTime(3000));
    expect(result.current.secondsLeft).toBe(117);

    rerender({ seconds: 90 });
    expect(result.current.running).toBe(true);
    expect(result.current.secondsLeft).toBe(117);
  });
});
