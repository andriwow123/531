import { describe, it, expect } from 'vitest';
import {
  formatElapsed, formatWorkoutDuration, toTimeInput, atTimeOnDay,
  resolveEndTime, guessFinishTime, isLeftRunning,
} from './workoutTime';

const at = (h: number, m: number, day = 24) => new Date(2026, 8, day, h, m).toISOString();

describe('workout time helpers', () => {
  it('formats elapsed as m:ss under an hour and h:mm:ss after', () => {
    expect(formatElapsed(0)).toBe('0:00');
    expect(formatElapsed(754)).toBe('12:34');
    expect(formatElapsed(3912)).toBe('1:05:12');
  });
  it('formats duration in whole minutes / hours', () => {
    expect(formatWorkoutDuration(at(18, 0), at(18, 52))).toBe('52 min');
    expect(formatWorkoutDuration(at(18, 0), at(19, 5))).toBe('1 h 5 min');
    expect(formatWorkoutDuration(at(18, 0), at(20, 0))).toBe('2 h');
  });
  it('round-trips a local time of day', () => {
    expect(toTimeInput(at(6, 4))).toBe('06:04');
    expect(atTimeOnDay(at(18, 0), '19:30')).toBe(at(19, 30));
  });
  it('puts an end at or before the start on the next day', () => {
    expect(resolveEndTime(at(18, 0), '19:10')).toBe(at(19, 10));
    expect(resolveEndTime(at(23, 30), '00:20')).toBe(at(0, 20, 25));
    expect(resolveEndTime(at(18, 0), '18:00')).toBe(at(18, 0, 25));
  });
  it('guesses the finish from the session save, else start + 1 h, never after now', () => {
    expect(guessFinishTime(at(18, 0), at(18, 50), at(23, 0))).toBe(at(18, 50));
    expect(guessFinishTime(at(18, 0), undefined, at(23, 0))).toBe(at(19, 0));
    expect(guessFinishTime(at(18, 0), at(17, 0), at(23, 0))).toBe(at(19, 0)); // save before start ignored
    expect(guessFinishTime(at(18, 0), undefined, at(18, 30))).toBe(at(18, 30)); // capped at now
  });
  it('flags a timer as left running only after 3 hours', () => {
    expect(isLeftRunning(at(18, 0), at(21, 0))).toBe(false);
    expect(isLeftRunning(at(18, 0), at(21, 1))).toBe(true);
    expect(isLeftRunning(at(23, 40), at(0, 20, 25))).toBe(false); // crosses midnight, only 40 min
  });
});
