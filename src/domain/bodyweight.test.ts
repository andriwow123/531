import { describe, it, expect } from 'vitest';
import { bodyweightSeries, latestWeight } from './bodyweight';
import type { BodyweightEntry } from '../data/repositories';

const e = (date: string, weight: number, id?: number): BodyweightEntry => ({ id, date, weight });

describe('bodyweightSeries', () => {
  it('sorts ascending by date', () => {
    expect(bodyweightSeries([e('2026-02-01', 82.5), e('2026-01-01', 84)]).map((p) => p.date))
      .toEqual(['2026-01-01', '2026-02-01']);
  });
});

describe('latestWeight', () => {
  it('returns the most recent weight', () => {
    expect(latestWeight([e('2026-01-01', 84, 1), e('2026-02-01', 82.5, 2)])).toBe(82.5);
  });
  it('is null when empty', () => expect(latestWeight([])).toBeNull());
});
