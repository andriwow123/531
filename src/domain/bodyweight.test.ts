import { describe, it, expect } from 'vitest';
import { bodyweightSeries, latestWeight, bodyweightAxis } from './bodyweight';
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

describe('bodyweightAxis', () => {
  it('returns a benign default with no data', () => {
    expect(bodyweightAxis([])).toEqual({ domain: [0, 1], ticks: [0, 1] });
  });

  it('pads a small range to a round domain with clean ticks (step 2)', () => {
    expect(bodyweightAxis([80, 82.5, 85])).toEqual({
      domain: [78, 86],
      ticks: [78, 80, 82, 84, 86],
    });
  });

  it('pads a tighter range to a round domain with clean ticks', () => {
    expect(bodyweightAxis([178, 180])).toEqual({
      domain: [176, 182],
      ticks: [176, 178, 180, 182],
    });
  });

  it('domain always contains all the plotted data', () => {
    const weights = [61, 63.5, 70, 68];
    const { domain } = bodyweightAxis(weights);
    expect(domain[0]).toBeLessThanOrEqual(Math.min(...weights));
    expect(domain[1]).toBeGreaterThanOrEqual(Math.max(...weights));
  });
});
