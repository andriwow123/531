import { describe, it, expect, beforeEach } from 'vitest';
import { db } from './db';
import { convertUnits } from './units';
import {
  profileRepo,
  liftRepo,
  cycleRepo,
  sessionRepo,
  bodyweightRepo,
  assistanceRepo,
  supportingDoneRepo,
} from './repositories';
import type { Cycle, Session } from './repositories';
import { roundToIncrement } from '../domain';

const KG_TO_LB = 2.2046226218;

beforeEach(async () => {
  await db.delete();
  await db.open();
});

async function seedAll() {
  await profileRepo.save({ id: 'me', units: 'kg', roundingIncrement: 2.5, tmPercent: 0.85 });
  await liftRepo.bulkSave([
    { key: 'squat', name: 'Squat', category: 'lower', oneRm: 140, trainingMax: 140, increment: 5 },
  ]);
  const cycleId = await cycleRepo.add({
    index: 1,
    startedAt: '2026-01-01',
    status: 'active',
    template: 'base',
    fivesPro: false,
    tm: { press: 60, bench: 85, squat: 119, deadlift: 150 },
  });
  const sessionId = await sessionRepo.add({
    cycleId,
    week: 3,
    liftKey: 'squat',
    date: '2026-01-08',
    status: 'done',
    sets: [
      { targetReps: 1, weight: 119, actualReps: 3, done: true, isAmrap: true, kind: 'main' },
    ],
    amrapReps: 8,
    estimated1RM: 150,
    rpe: null,
    notes: '',
  });
  const bwId = await bodyweightRepo.add({ date: '2026-01-01', weight: 84 });
  return { cycleId, sessionId, bwId };
}

describe('convertUnits', () => {
  it('converts profile, lifts, cycles, sessions, and bodyweight from kg to lb', async () => {
    await seedAll();

    await convertUnits('lb');

    const profile = await profileRepo.get();
    expect(profile?.units).toBe('lb');
    expect(profile?.roundingIncrement).toBe(5);
    expect(profile?.tmPercent).toBe(0.85);

    const lifts = await liftRepo.all();
    const squat = lifts.find((l) => l.key === 'squat');
    expect(squat?.trainingMax).toBe(roundToIncrement(140 * KG_TO_LB, 5));
    expect(squat?.oneRm).toBe(roundToIncrement(140 * KG_TO_LB, 5));
    expect(squat?.increment).toBe(10); // lower, lb

    const cycle = (await cycleRepo.active()) as Cycle;
    expect(cycle.tm.press).toBe(roundToIncrement(60 * KG_TO_LB, 5));
    expect(cycle.tm.bench).toBe(roundToIncrement(85 * KG_TO_LB, 5));
    expect(cycle.tm.squat).toBe(roundToIncrement(119 * KG_TO_LB, 5));
    expect(cycle.tm.deadlift).toBe(roundToIncrement(150 * KG_TO_LB, 5));

    const sessions = (await sessionRepo.forCycle(cycle.id as number)) as Session[];
    expect(sessions).toHaveLength(1);
    expect(sessions[0].sets[0].weight).toBe(roundToIncrement(119 * KG_TO_LB, 5));
    expect(sessions[0].estimated1RM).toBe(roundToIncrement(150 * KG_TO_LB, 5));
    // reps / amrapReps unchanged
    expect(sessions[0].amrapReps).toBe(8);
    expect(sessions[0].sets[0].actualReps).toBe(3);
    expect(sessions[0].sets[0].targetReps).toBe(1);

    const bw = await bodyweightRepo.all();
    expect(bw[0].weight).toBe(Math.round(84 * KG_TO_LB * 10) / 10);
  });

  it('leaves a null estimated1RM null after conversion', async () => {
    await profileRepo.save({ id: 'me', units: 'kg', roundingIncrement: 2.5, tmPercent: 0.85 });
    const cycleId = await cycleRepo.add({
      index: 1,
      startedAt: '2026-01-01',
      status: 'active',
      template: 'base',
      fivesPro: false,
      tm: { press: 60, bench: 85, squat: 119, deadlift: 150 },
    });
    await sessionRepo.add({
      cycleId,
      week: 1,
      liftKey: 'squat',
      date: '2026-01-01',
      status: 'planned',
      sets: [{ targetReps: 5, weight: 100, actualReps: null, done: false, isAmrap: false, kind: 'main' }],
      amrapReps: null,
      estimated1RM: null,
      rpe: null,
      notes: '',
    });

    await convertUnits('lb');

    const sessions = await sessionRepo.forCycle(cycleId);
    expect(sessions[0].estimated1RM).toBeNull();
  });

  it('is a no-op when converting to the unit the profile is already in', async () => {
    await seedAll();
    await convertUnits('lb');
    const afterFirst = await liftRepo.all();

    await convertUnits('lb');
    const afterSecond = await liftRepo.all();

    expect(afterSecond).toEqual(afterFirst);
  });

  it('does not throw when there is no profile', async () => {
    await expect(convertUnits('lb')).resolves.toBeUndefined();
  });
});

describe('convertUnits — assistance & supporting-lift weights', () => {
  it('converts non-null assistance/supportingDone weights and leaves null weights null', async () => {
    await profileRepo.save({ id: 'me', units: 'kg', roundingIncrement: 2.5, tmPercent: 0.85 });

    await assistanceRepo.add({ date: '2026-02-01', category: 'push', name: 'Dips', sets: 3, reps: 10, weight: 60 });
    await assistanceRepo.add({ date: '2026-02-01', category: 'pull', name: 'Chin-ups', sets: 3, reps: 8, weight: null });

    await supportingDoneRepo.log('2026-02-01', 'press', 'pull', 'Chin-ups', { weight: 20, reps: 12 });
    await supportingDoneRepo.select('2026-02-01', 'bench', 'push', 'Dips'); // weight/reps left null

    await convertUnits('lb');

    const assistance = await assistanceRepo.all();
    const dips = assistance.find((a) => a.name === 'Dips');
    const chinups = assistance.find((a) => a.name === 'Chin-ups');
    expect(dips?.weight).toBe(roundToIncrement(60 * KG_TO_LB, 5));
    // reps/sets/category/name/date unchanged
    expect(dips).toMatchObject({ date: '2026-02-01', category: 'push', name: 'Dips', sets: 3, reps: 10 });
    expect(chinups?.weight).toBeNull();

    const supportingDone = await supportingDoneRepo.forDate('2026-02-01');
    const loggedChinups = supportingDone.find((s) => s.liftKey === 'press' && s.name === 'Chin-ups');
    const selectedDips = supportingDone.find((s) => s.liftKey === 'bench' && s.name === 'Dips');
    expect(loggedChinups?.weight).toBe(roundToIncrement(20 * KG_TO_LB, 5));
    expect(loggedChinups).toMatchObject({ reps: 12, category: 'pull', name: 'Chin-ups' });
    expect(selectedDips?.weight).toBeNull();
    expect(selectedDips?.reps).toBeNull();
  });
});

describe('convertUnits — per-lift roundingIncrement', () => {
  it('maps a set roundingIncrement to the same-index step in the target unit, and leaves a lift without one still without one', async () => {
    await profileRepo.save({ id: 'me', units: 'kg', roundingIncrement: 2.5, tmPercent: 0.85 });
    await liftRepo.bulkSave([
      {
        key: 'press',
        name: 'Overhead Press',
        category: 'upper',
        oneRm: 100,
        trainingMax: 100,
        increment: 2.5,
        roundingIncrement: 1.25,
      },
      { key: 'bench', name: 'Bench Press', category: 'upper', oneRm: 100, trainingMax: 100, increment: 2.5 },
      {
        key: 'squat',
        name: 'Squat',
        category: 'lower',
        oneRm: 140,
        trainingMax: 140,
        increment: 5,
        roundingIncrement: 5,
      },
      { key: 'deadlift', name: 'Deadlift', category: 'lower', oneRm: 140, trainingMax: 140, increment: 5 },
    ]);

    await convertUnits('lb');

    const lifts = await liftRepo.all();
    // kg [1.25, 2.5, 5] <-> lb [2.5, 5, 10] by position.
    expect(lifts.find((l) => l.key === 'squat')?.roundingIncrement).toBe(10);
    expect(lifts.find((l) => l.key === 'press')?.roundingIncrement).toBe(2.5);
    // No per-lift roundingIncrement before conversion -> still none after.
    expect(lifts.find((l) => l.key === 'bench')?.roundingIncrement).toBeUndefined();
    expect(lifts.find((l) => l.key === 'deadlift')?.roundingIncrement).toBeUndefined();
  });
});
