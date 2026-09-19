import { describe, it, expect } from 'vitest';
import { roundToIncrement } from './rounding';

describe('roundToIncrement', () => {
  it('rounds to nearest 2.5', () => {
    expect(roundToIncrement(101.2, 2.5)).toBe(100);
    expect(roundToIncrement(101.3, 2.5)).toBe(102.5);
  });
  it('rounds to nearest 5', () => {
    expect(roundToIncrement(97.4, 5)).toBe(95);
    expect(roundToIncrement(97.6, 5)).toBe(100);
  });
  it('returns 0 for 0', () => expect(roundToIncrement(0, 2.5)).toBe(0));
});
