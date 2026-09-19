import Dexie, { type Table } from 'dexie';
import type { Profile, Lift, Cycle, Session } from './repositories';

export class AppDB extends Dexie {
  profile!: Table<Profile, string>;
  lifts!: Table<Lift, string>;
  cycles!: Table<Cycle, number>;
  sessions!: Table<Session, number>;
  constructor() {
    super('fivethreeone');
    this.version(1).stores({
      profile: 'id',
      lifts: 'key',
      cycles: '++id, index, status',
      sessions: '++id, cycleId, week, liftKey',
    });
  }
}
export const db = new AppDB();
