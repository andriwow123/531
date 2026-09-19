import { estimate1RM } from './estimate';
import type { LiftKey } from './types';
import type { Session, Cycle } from '../data/repositories';

export interface OneRmPoint { date: string; weight: number; reps: number; est1RM: number; }
export interface TmPoint { cycleIndex: number; startedAt: string; tm: number; }
export interface PR { est1RM: number; date: string; }

export function estimatedOneRmSeries(sessions: Session[], liftKey: LiftKey): OneRmPoint[] {
  const points: OneRmPoint[] = [];
  for (const s of sessions) {
    if (s.liftKey !== liftKey || s.amrapReps == null) continue;
    const top = s.sets.find((x) => x.isAmrap);
    if (!top) continue;
    const est1RM = s.estimated1RM ?? estimate1RM(top.weight, s.amrapReps);
    points.push({ date: s.date, weight: top.weight, reps: s.amrapReps, est1RM });
  }
  return points.sort((a, b) => a.date.localeCompare(b.date));
}

export function trainingMaxSeries(cycles: Cycle[], liftKey: LiftKey): TmPoint[] {
  return cycles
    .map((c) => ({ cycleIndex: c.index, startedAt: c.startedAt, tm: c.tm[liftKey] }))
    .sort((a, b) => a.cycleIndex - b.cycleIndex);
}

export function personalRecord(sessions: Session[], liftKey: LiftKey): PR | null {
  const series = estimatedOneRmSeries(sessions, liftKey);
  if (series.length === 0) return null;
  return series.reduce<PR>((best, p) => (p.est1RM > best.est1RM ? { est1RM: p.est1RM, date: p.date } : best),
    { est1RM: series[0].est1RM, date: series[0].date });
}
