import { describe, it, expect } from 'vitest';
import { computeTrainingMax } from './trainingMax';

describe('computeTrainingMax', () => {
  it('is 85% of 1RM rounded to increment', () => {
    // 100 * 0.85 = 85 -> 85
    expect(computeTrainingMax(100, 0.85, 2.5)).toBe(85);
    // 102 * 0.85 = 86.7 -> 87.5
    expect(computeTrainingMax(102, 0.85, 2.5)).toBe(87.5);
  });
  it('supports 90% and lb rounding', () => {
    // 200 * 0.9 = 180 -> 180 (increment 5)
    expect(computeTrainingMax(200, 0.9, 5)).toBe(180);
  });
});
