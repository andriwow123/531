import { db } from './db';
import type { Unit, LiftKey, LiftCategory, TemplateKey, WeekNumber, SetKind } from '../domain/types';

export interface Profile { id: 'me'; units: Unit; roundingIncrement: number; tmPercent: number; }
export interface Lift { key: LiftKey; name: string; category: LiftCategory; oneRm: number; trainingMax: number; increment: number; }
export interface Cycle { id?: number; index: number; startedAt: string; status: 'active' | 'completed'; template: TemplateKey; fivesPro: boolean; tm: Record<LiftKey, number>; }
export interface LoggedSet { targetReps: number; weight: number; actualReps: number | null; done: boolean; isAmrap: boolean; kind: SetKind; }
export interface Session { id?: number; cycleId: number; week: WeekNumber; liftKey: LiftKey; date: string; status: 'planned' | 'done'; sets: LoggedSet[]; amrapReps: number | null; estimated1RM: number | null; rpe: number | null; notes: string; }

export const profileRepo = {
  get: (): Promise<Profile | undefined> => db.profile.get('me'),
  save: (p: Profile): Promise<void> => db.profile.put(p).then(() => {}),
};
export const liftRepo = {
  all: (): Promise<Lift[]> => db.lifts.toArray(),
  bulkSave: (l: Lift[]): Promise<void> => db.lifts.bulkPut(l).then(() => {}),
  update: (key: LiftKey, patch: Partial<Lift>): Promise<void> => db.lifts.update(key, patch).then(() => {}),
};
export const cycleRepo = {
  active: (): Promise<Cycle | undefined> => db.cycles.where('status').equals('active').first(),
  add: (c: Cycle): Promise<number> => db.cycles.add(c),
  complete: (id: number): Promise<void> => db.cycles.update(id, { status: 'completed' }).then(() => {}),
};
export const sessionRepo = {
  forCycle: (cycleId: number): Promise<Session[]> => db.sessions.where('cycleId').equals(cycleId).toArray(),
  add: (s: Session): Promise<number> => db.sessions.add(s),
  update: (id: number, patch: Partial<Session>): Promise<void> => db.sessions.update(id, patch).then(() => {}),
};
