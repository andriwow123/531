import { describe, it, expect } from 'vitest';
import { buildWorkout } from './workout';

describe('buildWorkout', () => {
  it('orders warmups, main, supplemental', () => {
    const s = buildWorkout({ tm: 100, week: 1, template: 'bbb', fivesPro: false, warmups: true, roundingIncrement: 2.5 });
    const kinds = s.map(x => x.kind);
    expect(kinds.slice(0, 3)).toEqual(['warmup', 'warmup', 'warmup']);
    expect(kinds.filter(k => k === 'main')).toHaveLength(3);
    expect(kinds.filter(k => k === 'supplemental')).toHaveLength(5);
  });
  it('omits warmups when disabled', () => {
    const s = buildWorkout({ tm: 100, week: 1, template: 'base', fivesPro: false, warmups: false, roundingIncrement: 2.5 });
    expect(s.some(x => x.kind === 'warmup')).toBe(false);
  });
});
