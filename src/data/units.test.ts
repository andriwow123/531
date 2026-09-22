import { describe, it, expect, beforeEach } from 'vitest';
import { db } from './db';
import { convertUnits } from './units';
import { profileRepo, liftRepo, cycleRepo, sessionRepo, bodyweightRepo } from './repositories';
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
