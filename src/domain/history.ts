import { estimate1RM } from './estimate';
import type { LiftKey, WeekNumber } from './types';
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

export interface CycleLogEntry { date: string; liftKey: LiftKey; week: WeekNumber; topWeight: number; topReps: number | null; isAmrap: boolean; est1RM: number | null; }
export interface CycleLogGroup { cycleIndex: number; startedAt: string; entries: CycleLogEntry[]; }

export function cycleLog(sessions: Session[], cycles: Cycle[]): CycleLogGroup[] {
  const byIndex = new Map<number, { startedAt: string; entries: CycleLogEntry[] }>();
  const cycleById = new Map<number, Cycle>();
  // Join key: cycle.id (the real FK sessions store as cycleId in production data
  // from the DB) with a fallback to cycle.index for cycle records that don't carry
  // an id (e.g. hand-built fixtures).
  for (const c of cycles) cycleById.set(c.id ?? c.index, c);

  for (const s of sessions) {
    if (s.status !== 'done') continue;
    const c = cycleById.get(s.cycleId);
    if (!c) continue;
    const top = s.sets.reduce<typeof s.sets[number] | undefined>(
      (hi, x) => (hi == null || x.weight > hi.weight ? x : hi), undefined);
    if (!top) continue;
    const entry: CycleLogEntry = {
      date: s.date, liftKey: s.liftKey, week: s.week,
      topWeight: top.weight, isAmrap: top.isAmrap,
      topReps: top.isAmrap ? s.amrapReps : top.targetReps,
      est1RM: s.estimated1RM,
    };
    const g = byIndex.get(c.index) ?? { startedAt: c.startedAt, entries: [] };
    g.entries.push(entry);
    byIndex.set(c.index, g);
  }

  return [...byIndex.entries()]
    .map(([cycleIndex, g]) => ({ cycleIndex, startedAt: g.startedAt, entries: g.entries.sort((a, b) => b.date.localeCompare(a.date)) }))
    .sort((a, b) => b.cycleIndex - a.cycleIndex);
}
