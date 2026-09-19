import { describe, it, expect, beforeEach } from 'vitest';
import { db } from './db';
import { profileRepo, liftRepo } from './repositories';

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
