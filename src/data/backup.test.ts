import { describe, it, expect, beforeEach } from 'vitest';
import { db } from './db';
import { profileRepo, bodyweightRepo, cycleRepo } from './repositories';
import type { Cycle } from './repositories';
import { exportBackup, parseBackup, importBackup } from './backup';
import type { BackupFile } from './backup';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

async function seed() {
  await profileRepo.save({ id: 'me', units: 'kg', roundingIncrement: 2.5, tmPercent: 0.85 });
  await bodyweightRepo.add({ date: '2026-02-01', weight: 82.5 });
  const cycle: Cycle = {
    index: 1,
    startedAt: '2026-01-01',
    status: 'active',
    template: 'base',
    fivesPro: false,
    tm: { press: 60, bench: 85, squat: 119, deadlift: 150 },
  };
  await cycleRepo.add(cycle);
}

describe('exportBackup', () => {
  it('captures app/version metadata and rows from every table', async () => {
    await seed();

    const backup = await exportBackup();

    expect(backup.app).toBe('531');
    expect(backup.version).toBe(1);
    expect(typeof backup.exportedAt).toBe('string');
    expect(new Date(backup.exportedAt).toString()).not.toBe('Invalid Date');

    expect(backup.data.profile).toHaveLength(1);
    expect(backup.data.profile[0]).toMatchObject({ id: 'me', tmPercent: 0.85 });

    expect(backup.data.bodyweight).toHaveLength(1);
    expect(backup.data.bodyweight[0]).toMatchObject({ date: '2026-02-01', weight: 82.5 });

    expect(backup.data.cycles).toHaveLength(1);
    expect(backup.data.cycles[0]).toMatchObject({ index: 1, status: 'active' });

    // Every Dexie table on the db instance is captured, even empty ones.
    for (const table of db.tables) {
      expect(Array.isArray(backup.data[table.name])).toBe(true);
    }
  });
});

describe('parseBackup', () => {
  it('throws on invalid JSON', () => {
    expect(() => parseBackup('{not json')).toThrow();
  });

  it('throws on wrong shape (missing app/version/data)', () => {
    expect(() => parseBackup(JSON.stringify({ foo: 'bar' }))).toThrow();
  });

  it('throws when app is not "531"', () => {
    expect(() =>
      parseBackup(JSON.stringify({ app: 'other', version: 1, data: {} })),
    ).toThrow();
  });

  it('throws when version is not 1', () => {
    expect(() =>
      parseBackup(JSON.stringify({ app: '531', version: 2, data: {} })),
    ).toThrow();
  });

  it('throws when data is an array rather than an object', () => {
    expect(() =>
      parseBackup(JSON.stringify({ app: '531', version: 1, data: [] })),
    ).toThrow();
  });

  it('parses a valid backup', () => {
    const valid = JSON.stringify({ app: '531', version: 1, exportedAt: 'x', data: { profile: [] } });
    const parsed = parseBackup(valid);
    expect(parsed.app).toBe('531');
    expect(parsed.data.profile).toEqual([]);
  });
});

describe('importBackup', () => {
  it('rejects a wrong app', async () => {
    const bad = { app: 'other', version: 1, exportedAt: 'x', data: {} } as unknown as BackupFile;
    await expect(importBackup(bad)).rejects.toThrow();
  });

  it('rejects a wrong version', async () => {
    const bad = { app: '531', version: 2, exportedAt: 'x', data: {} } as unknown as BackupFile;
    await expect(importBackup(bad)).rejects.toThrow();
  });

  it('does a full round trip: export, clear db, import, and restore rows via repos', async () => {
    await seed();
    const backup = await exportBackup();

    await db.delete();
    await db.open();

    expect(await profileRepo.get()).toBeUndefined();
    expect(await bodyweightRepo.all()).toHaveLength(0);
    expect(await cycleRepo.all()).toHaveLength(0);

    await importBackup(backup);

    const restoredProfile = await profileRepo.get();
    expect(restoredProfile).toMatchObject({ id: 'me', tmPercent: 0.85 });

    const restoredBodyweight = await bodyweightRepo.all();
    expect(restoredBodyweight).toHaveLength(1);
    expect(restoredBodyweight[0]).toMatchObject({ date: '2026-02-01', weight: 82.5 });

    const restoredCycles = await cycleRepo.all();
    expect(restoredCycles).toHaveLength(1);
    expect(restoredCycles[0]).toMatchObject({ index: 1, status: 'active' });
  });

  it('replaces existing data rather than merging (full restore)', async () => {
    await bodyweightRepo.add({ date: '2026-03-01', weight: 90 });
    const backup: BackupFile = {
      app: '531',
      version: 1,
      exportedAt: new Date().toISOString(),
      data: { bodyweight: [{ id: 1, date: '2026-02-01', weight: 82.5 }] },
    };

    await importBackup(backup);

    const all = await bodyweightRepo.all();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ date: '2026-02-01', weight: 82.5 });
  });
});
