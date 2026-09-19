import { describe, it, expect } from 'vitest';
import { suggestProgression } from './progression';
const base = { currentTm: 100, increment: 5, roundingIncrement: 2.5 };

describe('suggestProgression', () => {
  it('bumps when completed and RPE easy', () => {
    expect(suggestProgression({ ...base, topSetCompleted: true, rpe: 8 }))
      .toEqual({ decision: 'bump', newTm: 105 });
  });
  it('holds when completed but very hard', () => {
    expect(suggestProgression({ ...base, topSetCompleted: true, rpe: 9.5 }))
      .toEqual({ decision: 'hold', newTm: 100 });
  });
  it('resets when top set failed', () => {
    expect(suggestProgression({ ...base, topSetCompleted: false, rpe: 10 }))
      .toEqual({ decision: 'reset', newTm: 90 });
  });
});
