import type { WorkingSet, WeekNumber, TemplateKey } from './types';
import { generateWarmups, generateMainSets, generateSupplemental } from './sets';

export interface WorkoutParams {
  tm: number; week: WeekNumber; template: TemplateKey;
  fivesPro: boolean; warmups: boolean; roundingIncrement: number;
  supplementalOpts?: { bbbPct?: number; bbbSets?: number; bbbReps?: number; fslSets?: number; fslReps?: number };
}

export function buildWorkout(p: WorkoutParams): WorkingSet[] {
  const w = p.warmups ? generateWarmups(p.tm, p.roundingIncrement) : [];
  const main = generateMainSets(p.tm, p.week, { fivesPro: p.fivesPro, roundingIncrement: p.roundingIncrement });
  const supp = generateSupplemental(p.template, p.tm, p.week, { roundingIncrement: p.roundingIncrement, ...(p.supplementalOpts ?? {}) });
  return [...w, ...main, ...supp];
}
