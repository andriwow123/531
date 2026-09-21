import { db } from './db';
import type { Unit, LiftKey, LiftCategory, TemplateKey, WeekNumber, SetKind } from '../domain/types';
import { defaultSettings } from '../settings/schema';
import type { SettingsState } from '../settings/schema';

export interface Profile { id: 'me'; units: Unit; roundingIncrement: number; tmPercent: number; }
export interface Lift { key: LiftKey; name: string; category: LiftCategory; oneRm: number; trainingMax: number; increment: number; }
export interface Cycle { id?: number; index: number; startedAt: string; status: 'active' | 'completed'; template: TemplateKey; fivesPro: boolean; tm: Record<LiftKey, number>; }
export interface LoggedSet { targetReps: number; weight: number; actualReps: number | null; done: boolean; isAmrap: boolean; kind: SetKind; }
export interface Session { id?: number; cycleId: number; week: WeekNumber; liftKey: LiftKey; date: string; status: 'planned' | 'done'; sets: LoggedSet[]; amrapReps: number | null; estimated1RM: number | null; rpe: number | null; notes: string; }
export type StoredSettings = SettingsState & { id: 'app' };
export interface BodyweightEntry { id?: number; date: string; weight: number; }
export type AssistanceCategory = 'push' | 'pull' | 'legs' | 'core';
export interface AssistanceEntry { id?: number; date: string; category: AssistanceCategory; name: string; sets: number; reps: number; weight: number | null; }
export interface CustomExercise { id?: number; category: AssistanceCategory; name: string; scheme?: string; }
export interface HiddenSupporting { id?: number; category: AssistanceCategory; name: string; }
export interface SupportingDone {
  id?: number;
  date: string;
  liftKey: LiftKey;
  category: AssistanceCategory;
  name: string;
  weight: number | null;
  reps: number | null;
}

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
  all: (): Promise<Cycle[]> => db.cycles.toArray(),
};
export const sessionRepo = {
  forCycle: (cycleId: number): Promise<Session[]> => db.sessions.where('cycleId').equals(cycleId).toArray(),
  add: (s: Session): Promise<number> => db.sessions.add(s),
  update: (id: number, patch: Partial<Session>): Promise<void> => db.sessions.update(id, patch).then(() => {}),
  all: (): Promise<Session[]> => db.sessions.toArray(),
};
export const settingsRepo = {
  get: async (): Promise<SettingsState> => {
    const row = await db.settings.get('app');
    if (!row) return defaultSettings;
    const { id: _id, ...rest } = row;
    return { ...defaultSettings, ...rest };
  },
  save: (s: SettingsState) => db.settings.put({ id: 'app', ...s }).then(() => {}),
};
export const bodyweightRepo = {
  add: (e: BodyweightEntry): Promise<number> => db.bodyweight.add(e),
  all: (): Promise<BodyweightEntry[]> => db.bodyweight.toArray(),
};
export const assistanceRepo = {
  add: (e: AssistanceEntry) => db.assistance.add(e),
  forDate: (date: string) => db.assistance.where('date').equals(date).toArray(),
  all: () => db.assistance.toArray(),
};
export const customExerciseRepo = {
  add: (c: CustomExercise) => db.customExercises.add(c),
  all: () => db.customExercises.toArray(),
  remove: (id: number): Promise<void> => db.customExercises.delete(id),
};
export const hiddenSupportingRepo = {
  add: (category: AssistanceCategory, name: string): Promise<number> => db.hiddenSupporting.add({ category, name }),
  all: (): Promise<HiddenSupporting[]> => db.hiddenSupporting.toArray(),
  remove: (id: number): Promise<void> => db.hiddenSupporting.delete(id),
};
function findMatch(date: string, liftKey: LiftKey, category: AssistanceCategory, name: string): Promise<SupportingDone | undefined> {
  return db.supportingDone
    .where('date')
    .equals(date)
    .filter((d) => d.liftKey === liftKey && d.category === category && d.name === name)
    .first();
}

export const supportingDoneRepo = {
  toggle: async (date: string, liftKey: LiftKey, category: AssistanceCategory, name: string): Promise<void> => {
    const existing = await findMatch(date, liftKey, category, name);
    if (existing?.id !== undefined) {
      await db.supportingDone.delete(existing.id);
    } else {
      await db.supportingDone.add({ date, liftKey, category, name, weight: null, reps: null });
    }
  },
  log: async (
    date: string,
    liftKey: LiftKey,
    category: AssistanceCategory,
    name: string,
    patch: { weight?: number | null; reps?: number | null },
  ): Promise<void> => {
    const existing = await findMatch(date, liftKey, category, name);
    if (existing?.id !== undefined) {
      await db.supportingDone.update(existing.id, patch);
    } else {
      await db.supportingDone.add({ date, liftKey, category, name, weight: patch.weight ?? null, reps: patch.reps ?? null });
    }
  },
  forDate: (date: string): Promise<SupportingDone[]> => db.supportingDone.where('date').equals(date).toArray(),
};
