import { describe, it, expect } from 'vitest';
import { aggregateSupportingHistory } from './supportingHistory';
import type { SupportingDone } from '../data/repositories';

const row = (date: string, name: string, weight: number | null, reps: number | null): SupportingDone =>
  ({ date, liftKey: 'press', category: 'push', name, weight, reps, done: true });

describe('aggregateSupportingHistory', () => {
  it('groups by category+name, entries most-recent-first, capped', () => {
    const out = aggregateSupportingHistory(
      [row('2026-03-01', 'Dips', 25, 10), row('2026-03-03', 'Dips', 30, 8), row('2026-03-02', 'Push-ups', null, 20)],
      2,
    );
    const dips = out.find((g) => g.name === 'Dips')!;
    expect(dips.entries.map((e) => e.date)).toEqual(['2026-03-03', '2026-03-01']);
    expect(dips.entries[0]).toEqual({ date: '2026-03-03', weight: 30, reps: 8 });
    // exercises ordered by most-recent entry first
    expect(out[0].name).toBe('Dips');
  });

  it('drops rows with no weight and no reps', () => {
    const out = aggregateSupportingHistory([row('2026-03-01', 'A', null, null)]);
    expect(out).toEqual([]);
  });

  it('respects the recentLimit cap on entries', () => {
    const rows = Array.from({ length: 10 }, (_, i) => row(`2026-03-${String(i + 1).padStart(2, '0')}`, 'Dips', i, 10));
    const out = aggregateSupportingHistory(rows, 8);
    expect(out[0].entries).toHaveLength(8);
  });
});
