import { describe, it, expect } from 'vitest';
import { EXERCISE_DEMOS, getExerciseDemo } from './exercises';
import { LIFT_ORDER } from './index';

describe('EXERCISE_DEMOS', () => {
  it('covers all 4 lifts with name, instructions, and 2 image paths', () => {
    expect(Object.keys(EXERCISE_DEMOS)).toHaveLength(LIFT_ORDER.length);
    for (const key of LIFT_ORDER) {
      const d = getExerciseDemo(key);
      expect(d.name.length).toBeGreaterThan(0);
      expect(d.instructions.length).toBeGreaterThan(0);
      expect(d.images).toHaveLength(2);
      expect(d.images.every((p) => p.startsWith('/exercises/'))).toBe(true);
    }
  });
});
