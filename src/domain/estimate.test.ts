import { describe, it, expect } from 'vitest';
import { estimate1RM } from './estimate';

describe('estimate1RM (Epley)', () => {
  it('equals weight for a single', () => expect(estimate1RM(100, 1)).toBeCloseTo(103.33, 1));
  it('scales with reps', () => expect(estimate1RM(100, 5)).toBeCloseTo(116.67, 1)); // 100*(1+5/30)
  it('returns 0 for 0 reps guard', () => expect(estimate1RM(100, 0)).toBe(100));
});
