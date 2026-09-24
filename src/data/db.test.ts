import { describe, it, expect } from 'vitest';
import Dexie from 'dexie';
import { db } from './db';
import { workoutDayRepo } from './repositories';

describe('db version 6', () => {
  it('upgrades an existing v5 database without losing data', async () => {
    db.close();
    await Dexie.delete('fivethreeone');
    const legacy = new Dexie('fivethreeone');
    legacy.version(1).stores({ profile: 'id', lifts: 'key', cycles: '++id, index, status', sessions: '++id, cycleId, week, liftKey' });
    legacy.version(2).stores({ settings: 'id' });
    legacy.version(3).stores({ bodyweight: '++id, date' });
    legacy.version(4).stores({ assistance: '++id, date', customExercises: '++id, category' });
    legacy.version(5).stores({ supportingDone: '++id, date', hiddenSupporting: '++id, category' });
    await legacy.open();
    await legacy.table('bodyweight').add({ date: '2026-09-01', weight: 84 });
    legacy.close();

    await db.open();
    expect(await db.bodyweight.count()).toBe(1);
    await workoutDayRepo.setTimes(1, 1, 'press', { startedAt: 'S', endedAt: null });
    expect(await workoutDayRepo.get(1, 1, 'press')).toMatchObject({ startedAt: 'S' });
  });
});
