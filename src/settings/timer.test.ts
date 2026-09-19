import { describe, it, expect } from 'vitest';
import { timerReducer, initialTimer } from './timer';
import type { TimerState } from './timer';

describe('initialTimer', () => {
  it('creates a stopped timer with the given seconds', () => {
    expect(initialTimer(90)).toEqual({ secondsLeft: 90, running: false });
  });
});

describe('timerReducer', () => {
  it('start sets secondsLeft and running true', () => {
    const state = initialTimer(0);
    const next = timerReducer(state, { type: 'start', seconds: 120 });
    expect(next).toEqual({ secondsLeft: 120, running: true });
  });

  it('tick decrements secondsLeft while running', () => {
    const state: TimerState = { secondsLeft: 10, running: true };
    const next = timerReducer(state, { type: 'tick' });
    expect(next).toEqual({ secondsLeft: 9, running: true });
  });

  it('tick at 0 stops the timer and stays at 0', () => {
    const state: TimerState = { secondsLeft: 0, running: true };
    const next = timerReducer(state, { type: 'tick' });
    expect(next).toEqual({ secondsLeft: 0, running: false });
  });

  it('tick reaching 0 from 1 stops the timer', () => {
    const state: TimerState = { secondsLeft: 1, running: true };
    const next = timerReducer(state, { type: 'tick' });
    expect(next).toEqual({ secondsLeft: 0, running: false });
  });

  it('tick while not running does nothing', () => {
    const state: TimerState = { secondsLeft: 10, running: false };
    const next = timerReducer(state, { type: 'tick' });
    expect(next).toEqual({ secondsLeft: 10, running: false });
  });

  it('pause sets running false and keeps secondsLeft', () => {
    const state: TimerState = { secondsLeft: 45, running: true };
    const next = timerReducer(state, { type: 'pause' });
    expect(next).toEqual({ secondsLeft: 45, running: false });
  });

  it('reset sets secondsLeft to given seconds and running false', () => {
    const state: TimerState = { secondsLeft: 5, running: true };
    const next = timerReducer(state, { type: 'reset', seconds: 60 });
    expect(next).toEqual({ secondsLeft: 60, running: false });
  });
});
