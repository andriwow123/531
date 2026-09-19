import { describe, it, expect } from 'vitest';
import { generateMainSets, generateWarmups, generateSupplemental } from './sets';

const base = { fivesPro: false, roundingIncrement: 2.5 };

describe('generateMainSets', () => {
  it('week 1 base: 65/75/85 with AMRAP on top', () => {
    const s = generateMainSets(100, 1, base);
    expect(s.map(x => x.weight)).toEqual([65, 75, 85]);
    expect(s.map(x => x.reps)).toEqual([5, 5, 5]);
    expect(s.map(x => x.isAmrap)).toEqual([false, false, true]);
    expect(s.every(x => x.kind === 'main')).toBe(true);
  });
  it('week 3 base: 75/85/95, reps 5/3/1, AMRAP on top', () => {
    const s = generateMainSets(100, 3, base);
    expect(s.map(x => x.weight)).toEqual([75, 85, 95]);
    expect(s.map(x => x.reps)).toEqual([5, 3, 1]);
    expect(s[2].isAmrap).toBe(true);
  });
  it('week 4 deload: no AMRAP', () => {
    const s = generateMainSets(100, 4, base);
    expect(s.map(x => x.weight)).toEqual([40, 50, 60]);
    expect(s.some(x => x.isAmrap)).toBe(false);
  });
  it('5s PRO: all working sets are 5 reps, no AMRAP', () => {
    const s = generateMainSets(100, 3, { ...base, fivesPro: true });
    expect(s.map(x => x.reps)).toEqual([5, 5, 5]);
    expect(s.some(x => x.isAmrap)).toBe(false);
  });
  it('rounds weights to increment', () => {
    // 102.5 * 0.65 = 66.625 -> 67.5
    expect(generateMainSets(102.5, 1, base)[0].weight).toBe(67.5);
  });
});

describe('generateWarmups', () => {
  it('is 40/50/60 with reps 5/5/3', () => {
    const w = generateWarmups(100, 2.5);
    expect(w.map(x => x.weight)).toEqual([40, 50, 60]);
    expect(w.map(x => x.reps)).toEqual([5, 5, 3]);
    expect(w.every(x => x.kind === 'warmup' && !x.isAmrap)).toBe(true);
  });
});

describe('generateSupplemental', () => {
  it('base has no supplemental', () => {
    expect(generateSupplemental('base', 100, 1, { roundingIncrement: 2.5 })).toEqual([]);
  });
  it('BBB is 5x10 at 50% by default', () => {
    const s = generateSupplemental('bbb', 100, 1, { roundingIncrement: 2.5 });
    expect(s).toHaveLength(5);
    expect(s.every(x => x.reps === 10 && x.weight === 50 && x.kind === 'supplemental')).toBe(true);
  });
  it('FSL is 5x5 at the week first-working pct', () => {
    const s = generateSupplemental('fsl', 100, 2, { roundingIncrement: 2.5 }); // wk2 first pct 0.70
    expect(s).toHaveLength(5);
    expect(s.every(x => x.reps === 5 && x.weight === 70)).toBe(true);
  });
  it('no supplemental on deload week', () => {
    expect(generateSupplemental('bbb', 100, 4, { roundingIncrement: 2.5 })).toEqual([]);
    expect(generateSupplemental('fsl', 100, 4, { roundingIncrement: 2.5 })).toEqual([]);
  });
});
