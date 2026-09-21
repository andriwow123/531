import { describe, it, expect } from 'vitest';
import { orderedLifts, moveItem } from './liftOrder';
import { LIFT_ORDER } from './schedule';
import type { LiftKey } from './types';

describe('orderedLifts', () => {
  it('passes through a valid custom order unchanged', () => {
    const custom: LiftKey[] = ['squat', 'deadlift', 'press', 'bench'];
    expect(orderedLifts(custom)).toEqual(custom);
  });

  it('drops dupes/unknowns and appends missing lifts in LIFT_ORDER order', () => {
    const messy = ['squat', 'squat', 'unknown', 'deadlift'] as LiftKey[];
    const result = orderedLifts(messy);
    // Valid 4-permutation: each of the 4 canonical lifts exactly once.
    expect(result).toHaveLength(4);
    expect(new Set(result)).toEqual(new Set(LIFT_ORDER));
    // Explicit valid entries (deduped) come first, in the order given.
    expect(result[0]).toBe('squat');
    expect(result[1]).toBe('deadlift');
    // Missing ones (press, bench) appended in LIFT_ORDER order.
    expect(result.slice(2)).toEqual(['press', 'bench']);
  });

  it('falls back to LIFT_ORDER for an empty array', () => {
    expect(orderedLifts([])).toEqual(LIFT_ORDER);
  });

  it('falls back to LIFT_ORDER for undefined (old saved settings without the field)', () => {
    expect(orderedLifts(undefined)).toEqual(LIFT_ORDER);
  });
});

describe('moveItem', () => {
  it('moves an element forward', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('moves an element backward', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c']);
  });

  it('returns an unchanged copy when `from` is out of range', () => {
    const arr = ['a', 'b', 'c'];
    const result = moveItem(arr, 5, 0);
    expect(result).toEqual(arr);
    expect(result).not.toBe(arr);
  });

  it('returns an unchanged copy when `from` is negative', () => {
    const arr = ['a', 'b', 'c'];
    const result = moveItem(arr, -1, 0);
    expect(result).toEqual(arr);
    expect(result).not.toBe(arr);
  });
});
