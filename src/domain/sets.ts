import { roundToIncrement } from './rounding';
import type { WorkingSet, WeekNumber } from './types';

const MAIN: Record<WeekNumber, { pct: number; reps: number; amrap?: boolean }[]> = {
  1: [{ pct: 0.65, reps: 5 }, { pct: 0.75, reps: 5 }, { pct: 0.85, reps: 5, amrap: true }],
  2: [{ pct: 0.70, reps: 3 }, { pct: 0.80, reps: 3 }, { pct: 0.90, reps: 3, amrap: true }],
  3: [{ pct: 0.75, reps: 5 }, { pct: 0.85, reps: 3 }, { pct: 0.95, reps: 1, amrap: true }],
  4: [{ pct: 0.40, reps: 5 }, { pct: 0.50, reps: 5 }, { pct: 0.60, reps: 5 }],
};

export function generateMainSets(
  tm: number, week: WeekNumber, opts: { fivesPro: boolean; roundingIncrement: number },
): WorkingSet[] {
  return MAIN[week].map((s) => {
    const fivesPro = opts.fivesPro && week !== 4;
    return {
      kind: 'main',
      pct: s.pct,
      reps: fivesPro ? 5 : s.reps,
      isAmrap: fivesPro ? false : !!s.amrap,
      weight: roundToIncrement(tm * s.pct, opts.roundingIncrement),
    };
  });
}
