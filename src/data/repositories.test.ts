import { describe, it, expect, beforeEach } from 'vitest';
import { db } from './db';
import { profileRepo, liftRepo, cycleRepo, sessionRepo } from './repositories';
import type { Cycle, Session } from './repositories';

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
