import { db } from './db';

export interface BackupFile {
  app: '531';
  version: 1;
  exportedAt: string;
  data: Record<string, unknown[]>;
}

/** Generic full export: every Dexie table on `db` is captured by name, so a
 *  new table added later is included automatically without touching this file. */
export async function exportBackup(): Promise<BackupFile> {
  const data: Record<string, unknown[]> = {};
  for (const table of db.tables) {
    data[table.name] = await table.toArray();
  }
  return {
    app: '531',
    version: 1,
    exportedAt: new Date().toISOString(),
    data,
  };
}

/** Parses and shape-checks a backup file's raw JSON text. Throws a clear
 *  Error rather than returning something malformed, so callers can surface
 *  a friendly message. */
export function parseBackup(text: string): BackupFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON.');
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('That file is not a valid 5/3/1 backup.');
  }
  const candidate = parsed as Record<string, unknown>;
  if (candidate.app !== '531') {
    throw new Error('That file is not a valid 5/3/1 backup.');
  }
  if (candidate.version !== 1) {
    throw new Error('That backup is from an unsupported version.');
  }
  if (typeof candidate.data !== 'object' || candidate.data === null) {
    throw new Error('That file is not a valid 5/3/1 backup.');
  }

  return candidate as unknown as BackupFile;
}

/** Full restore/replace: every table present in the backup replaces the
 *  current table's contents (clear + bulkPut, preserving explicit ids). Runs
 *  in a single read-write transaction across all tables so it's all-or-nothing. */
export async function importBackup(file: BackupFile): Promise<void> {
  if (file.app !== '531' || file.version !== 1) {
    throw new Error('That file is not a valid 5/3/1 backup.');
  }

  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) {
      const rows = file.data[table.name];
      if (Array.isArray(rows)) {
        await table.clear();
        await table.bulkPut(rows as unknown[]);
      }
    }
  });
}
