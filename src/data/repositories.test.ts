import { describe, it, expect, beforeEach } from 'vitest';
import { db } from './db';
import {
  profileRepo,
  liftRepo,
  cycleRepo,
  sessionRepo,
  settingsRepo,
  bodyweightRepo,
  assistanceRepo,
  customExerciseRepo,
  hiddenSupportingRepo,
  supportingDoneRepo,
} from './repositories';
import type { Cycle, Session } from './repositories';
import { defaultSettings } from '../settings/schema';

beforeEach(async () => { await db.delete(); await db.open(); });

describe('profileRepo', () => {
  it('saves and gets the singleton profile', async () => {
    await profileRepo.save({ id: 'me', units: 'kg', roundingIncrement: 2.5, tmPercent: 0.85 });
    const p = await profileRepo.get();
    expect(p?.tmPercent).toBe(0.85);
  });
});
describe('liftRepo', () => {
  it('bulk saves and reads lifts', async () => {
    await liftRepo.bulkSave([{ key: 'squat', name: 'Squat', category: 'lower', oneRm: 140, trainingMax: 119, increment: 5 }]);
    const lifts = await liftRepo.all();
    expect(lifts).toHaveLength(1);
    expect(lifts[0].trainingMax).toBe(119);
  });
});
describe('cycleRepo', () => {
  it('round-trips a cycle with a full tm map, then completes it', async () => {
    const cycle: Cycle = {
      index: 1,
      startedAt: '2026-01-01',
      status: 'active',
      template: 'base',
      fivesPro: false,
      tm: { press: 60, bench: 85, squat: 119, deadlift: 150 },
    };
    const id = await cycleRepo.add(cycle);

    const active = await cycleRepo.active();
    expect(active?.tm.squat).toBe(119);
    expect(active?.tm).toEqual({ press: 60, bench: 85, squat: 119, deadlift: 150 });

    await cycleRepo.complete(id);
    expect(await cycleRepo.active()).toBeUndefined();
  });
});
describe('cycleRepo.updateTrainingMax', () => {
  it("updates one lift's tm and leaves the others unchanged", async () => {
    const cycle: Cycle = {
      index: 1,
      startedAt: '2026-01-01',
      status: 'active',
      template: 'base',
      fivesPro: false,
      tm: { press: 60, bench: 85, squat: 119, deadlift: 150 },
    };
    const id = await cycleRepo.add(cycle);

    await cycleRepo.updateTrainingMax(id, 'press', 65);

    const active = await cycleRepo.active();
    expect(active?.tm).toEqual({ press: 65, bench: 85, squat: 119, deadlift: 150 });
  });

  it('no-ops when the cycle id does not exist', async () => {
    await expect(cycleRepo.updateTrainingMax(999, 'press', 65)).resolves.toBeUndefined();
  });
});
describe('sessionRepo', () => {
  it('round-trips a session with nested sets, then applies a patch', async () => {
    const session: Session = {
      cycleId: 1,
      week: 3,
      liftKey: 'bench',
      date: '2026-01-08',
      status: 'planned',
      sets: [
        { targetReps: 1, weight: 90, actualReps: null, done: false, isAmrap: true, kind: 'main' },
        { targetReps: 5, weight: 60, actualReps: 5, done: true, isAmrap: false, kind: 'warmup' },
      ],
      amrapReps: null,
      estimated1RM: null,
      rpe: null,
      notes: '',
    };
    const id = await sessionRepo.add(session);

    const sessions = await sessionRepo.forCycle(1);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].sets).toHaveLength(2);
    expect(sessions[0].sets[0].weight).toBe(90);
    expect(sessions[0].sets[0].isAmrap).toBe(true);

    await sessionRepo.update(id, { rpe: 9, notes: 'x' });
    const patched = await sessionRepo.forCycle(1);
    expect(patched[0].rpe).toBe(9);
    expect(patched[0].notes).toBe('x');
  });
});
describe('sessionRepo.all / cycleRepo.all', () => {
  it('returns all sessions across cycles', async () => {
    await sessionRepo.add({ cycleId: 1, week: 1, liftKey: 'press', date: '2026-01-01', status: 'done', sets: [], amrapReps: 5, estimated1RM: 100, rpe: null, notes: '' });
    await sessionRepo.add({ cycleId: 2, week: 1, liftKey: 'press', date: '2026-02-01', status: 'done', sets: [], amrapReps: 6, estimated1RM: 110, rpe: null, notes: '' });
    expect(await sessionRepo.all()).toHaveLength(2);
  });
  it('returns all cycles', async () => {
    await cycleRepo.add({ index: 1, startedAt: '2026-01-01', status: 'completed', template: 'base', fivesPro: false, tm: { press: 50, bench: 70, squat: 100, deadlift: 120 } });
    await cycleRepo.add({ index: 2, startedAt: '2026-02-01', status: 'active', template: 'base', fivesPro: false, tm: { press: 52.5, bench: 72.5, squat: 105, deadlift: 125 } });
    expect(await cycleRepo.all()).toHaveLength(2);
  });
});
describe('settingsRepo', () => {
  it('returns defaults when nothing saved', async () => {
    expect(await settingsRepo.get()).toEqual(defaultSettings);
  });
  it('saves and reloads settings, merged over defaults', async () => {
    await settingsRepo.save({ ...defaultSettings, theme: 'dark', displayPreset: 'detailed' });
    const s = await settingsRepo.get();
    expect(s.theme).toBe('dark');
    expect(s.displayPreset).toBe('detailed');
    expect(s.restTimer).toEqual(defaultSettings.restTimer); // untouched fields keep defaults
  });
});
describe('bodyweightRepo', () => {
  it('adds and lists bodyweight entries', async () => {
    await bodyweightRepo.add({ date: '2026-02-01', weight: 82.5 });
    await bodyweightRepo.add({ date: '2026-01-01', weight: 84 });
    expect(await bodyweightRepo.all()).toHaveLength(2);
  });

  it('updates an entry weight, then removes it (round-trip via all())', async () => {
    const id = await bodyweightRepo.add({ date: '2026-01-01', weight: 84 });

    await bodyweightRepo.update(id, { weight: 85.5 });
    let all = await bodyweightRepo.all();
    expect(all).toHaveLength(1);
    expect(all[0].weight).toBe(85.5);

    await bodyweightRepo.remove(id);
    all = await bodyweightRepo.all();
    expect(all).toHaveLength(0);
  });
});
describe('assistanceRepo', () => {
  it('adds entries for a date and lists them via forDate', async () => {
    await assistanceRepo.add({ date: '2026-02-01', category: 'push', name: 'Dips', sets: 3, reps: 10, weight: null });
    await assistanceRepo.add({ date: '2026-02-01', category: 'pull', name: 'Barbell Row', sets: 3, reps: 8, weight: 60 });
    await assistanceRepo.add({ date: '2026-02-02', category: 'legs', name: 'Leg Press', sets: 4, reps: 12, weight: 100 });

    const forDay = await assistanceRepo.forDate('2026-02-01');
    expect(forDay).toHaveLength(2);
    expect(forDay.map((e) => e.name).sort()).toEqual(['Barbell Row', 'Dips']);

    expect(await assistanceRepo.all()).toHaveLength(3);
  });
});
describe('customExerciseRepo', () => {
  it('adds a custom exercise and lists it via all', async () => {
    await customExerciseRepo.add({ category: 'push', name: 'JM Press' });
    const all = await customExerciseRepo.all();
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe('JM Press');
  });
  it('supports an optional scheme field', async () => {
    const id = await customExerciseRepo.add({ category: 'push', name: 'JM Press', scheme: '3 × 8' });
    const all = await customExerciseRepo.all();
    expect(all.find((c) => c.id === id)?.scheme).toBe('3 × 8');
  });
  it('removes a custom exercise', async () => {
    const id = await customExerciseRepo.add({ category: 'push', name: 'JM Press' });
    await customExerciseRepo.remove(id);
    expect(await customExerciseRepo.all()).toHaveLength(0);
  });
});
describe('hiddenSupportingRepo', () => {
  it('adds, lists, and removes hidden built-ins', async () => {
    const id = await hiddenSupportingRepo.add('push', 'Dips');
    const all = await hiddenSupportingRepo.all();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ category: 'push', name: 'Dips' });

    await hiddenSupportingRepo.remove(id);
    expect(await hiddenSupportingRepo.all()).toHaveLength(0);
  });
});
describe('supportingDoneRepo', () => {
  it('log upserts weight/reps, creating a done row and patching fields independently', async () => {
    await supportingDoneRepo.log('2026-09-21', 'press', 'pull', 'Chin-ups', { weight: 20, reps: 12 });
    let forDay = await supportingDoneRepo.forDate('2026-09-21');
    expect(forDay).toHaveLength(1);
    expect(forDay[0]).toMatchObject({ liftKey: 'press', category: 'pull', name: 'Chin-ups', weight: 20, reps: 12 });

    await supportingDoneRepo.log('2026-09-21', 'press', 'pull', 'Chin-ups', { reps: 10 });
    forDay = await supportingDoneRepo.forDate('2026-09-21');
    expect(forDay).toHaveLength(1);
    expect(forDay[0]).toMatchObject({ weight: 20, reps: 10 });
  });
});
describe('supportingDoneRepo select/setDone/deselect/lastLogged', () => {
  it('select adds a today row (done:false) and is idempotent, seeding weight/reps', async () => {
    await supportingDoneRepo.select('2026-03-02', 'press', 'push', 'Dips', { weight: 30, reps: 12 });
    await supportingDoneRepo.select('2026-03-02', 'press', 'push', 'Dips', { weight: 99, reps: 1 }); // no-op
    const rows = await supportingDoneRepo.forDate('2026-03-02');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: 'Dips', done: false, weight: 30, reps: 12 });
  });

  it('setDone flips the done flag without removing the row; deselect removes it', async () => {
    await supportingDoneRepo.select('2026-03-02', 'press', 'push', 'Dips', { weight: null, reps: null });
    await supportingDoneRepo.setDone('2026-03-02', 'press', 'push', 'Dips', true);
    let rows = await supportingDoneRepo.forDate('2026-03-02');
    expect(rows[0].done).toBe(true);
    await supportingDoneRepo.deselect('2026-03-02', 'press', 'push', 'Dips');
    rows = await supportingDoneRepo.forDate('2026-03-02');
    expect(rows).toHaveLength(0);
  });

  it('lastLogged returns the most recent prior non-null entry by category+name, else null', async () => {
    await supportingDoneRepo.select('2026-03-01', 'press', 'push', 'Dips', { weight: 25, reps: 10 });
    await supportingDoneRepo.select('2026-03-02', 'bench', 'push', 'Dips', { weight: 27.5, reps: 8 });
    const found = await supportingDoneRepo.lastLogged('push', 'Dips', '2026-03-03');
    expect(found).toEqual({ weight: 27.5, reps: 8 });
    // strictly before the given date:
    const earlier = await supportingDoneRepo.lastLogged('push', 'Dips', '2026-03-02');
    expect(earlier).toEqual({ weight: 25, reps: 10 });
    expect(await supportingDoneRepo.lastLogged('push', 'Nope', '2026-03-03')).toBeNull();
  });

  it('allLogged returns only rows with a non-null weight or reps', async () => {
    await supportingDoneRepo.select('2026-03-02', 'press', 'push', 'A', { weight: null, reps: null });
    await supportingDoneRepo.select('2026-03-02', 'press', 'push', 'B', { weight: 20, reps: null });
    const logged = await supportingDoneRepo.allLogged();
    expect(logged.map((r) => r.name)).toEqual(['B']);
  });
});
