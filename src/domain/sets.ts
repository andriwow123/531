import { roundToIncrement } from './rounding';
import type { WorkingSet, WeekNumber, TemplateKey } from './types';

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

const WARMUP = [{ pct: 0.4, reps: 5 }, { pct: 0.5, reps: 5 }, { pct: 0.6, reps: 3 }];
export function generateWarmups(tm: number, roundingIncrement: number): WorkingSet[] {
  return WARMUP.map((s) => ({
    kind: 'warmup', pct: s.pct, reps: s.reps, isAmrap: false,
    weight: roundToIncrement(tm * s.pct, roundingIncrement),
  }));
}

const FIRST_PCT: Record<WeekNumber, number> = { 1: 0.65, 2: 0.70, 3: 0.75, 4: 0 };

export function generateSupplemental(
  template: TemplateKey, tm: number, week: WeekNumber,
  opts: { roundingIncrement: number; bbbPct?: number; bbbSets?: number; bbbReps?: number; fslSets?: number; fslReps?: number },
): WorkingSet[] {
  if (week === 4 || template === 'base') return [];
  const mk = (pct: number, reps: number, n: number): WorkingSet[] =>
    Array.from({ length: n }, () => ({
      kind: 'supplemental' as const, pct, reps, isAmrap: false,
      weight: roundToIncrement(tm * pct, opts.roundingIncrement),
    }));
  if (template === 'bbb') return mk(opts.bbbPct ?? 0.5, opts.bbbReps ?? 10, opts.bbbSets ?? 5);
  return mk(FIRST_PCT[week], opts.fslReps ?? 5, opts.fslSets ?? 5); // fsl
}
