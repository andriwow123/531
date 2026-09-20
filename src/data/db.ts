import Dexie, { type Table } from 'dexie';
import type {
  Profile,
  Lift,
  Cycle,
  Session,
  StoredSettings,
  BodyweightEntry,
  AssistanceEntry,
  CustomExercise,
} from './repositories';

export class AppDB extends Dexie {
  profile!: Table<Profile, string>;
  lifts!: Table<Lift, string>;
  cycles!: Table<Cycle, number>;
  sessions!: Table<Session, number>;
  settings!: Table<StoredSettings, string>;
  bodyweight!: Table<BodyweightEntry, number>;
  assistance!: Table<AssistanceEntry, number>;
  customExercises!: Table<CustomExercise, number>;
  constructor() {
    super('fivethreeone');
    this.version(1).stores({
      profile: 'id',
      lifts: 'key',
      cycles: '++id, index, status',
      sessions: '++id, cycleId, week, liftKey',
    });
    this.version(2).stores({ settings: 'id' });
    this.version(3).stores({ bodyweight: '++id, date' });
    this.version(4).stores({ assistance: '++id, date', customExercises: '++id, category' });
  }
}
export const db = new AppDB();
