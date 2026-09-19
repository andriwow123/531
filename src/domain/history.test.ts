import { describe, it, expect } from 'vitest';
import { estimatedOneRmSeries, trainingMaxSeries, personalRecord, cycleLog } from './history';
import { estimate1RM } from './estimate';
import type { Session, Cycle } from '../data/repositories';

const sess = (o: Partial<Session>): Session => ({
  cycleId: 1, week: 1, liftKey: 'press', date: '2026-01-01', status: 'done',
  sets: [], amrapReps: null, estimated1RM: null, rpe: null, notes: '', ...o,
});
const amrapSet = (weight: number) => ({ targetReps: 1, weight, actualReps: 5, done: true, isAmrap: true, kind: 'main' as const });

describe('estimatedOneRmSeries', () => {
  it('builds ordered points from a lift\'s AMRAP sessions', () => {
    const sessions = [
      sess({ date: '2026-02-01', liftKey: 'press', amrapReps: 5, estimated1RM: 120, sets: [amrapSet(100)] }),
      sess({ date: '2026-01-01', liftKey: 'press', amrapReps: 3, estimated1RM: 110, sets: [amrapSet(95)] }),
      sess({ date: '2026-01-15', liftKey: 'squat', amrapReps: 5, estimated1RM: 200, sets: [amrapSet(180)] }),
    ];
    const s = estimatedOneRmSeries(sessions, 'press');
    expect(s.map(p => p.date)).toEqual(['2026-01-01', '2026-02-01']);
    expect(s[1]).toMatchObject({ weight: 100, reps: 5, est1RM: 120 });
  });
  it('skips sessions with no AMRAP result', () => {
    const s = estimatedOneRmSeries([sess({ amrapReps: null, sets: [amrapSet(100)] })], 'press');
    expect(s).toEqual([]);
  });
  it('falls back to a computed est1RM when the session has none stored', () => {
    const s = estimatedOneRmSeries([sess({ amrapReps: 8, estimated1RM: null, sets: [amrapSet(90)] })], 'press');
    expect(s).toEqual([{ date: '2026-01-01', weight: 90, reps: 8, est1RM: estimate1RM(90, 8) }]);
  });
});

describe('trainingMaxSeries', () => {
  it('is one TM point per cycle, ascending', () => {
    const cycles = [
      { index: 2, startedAt: '2026-02-01', status: 'active', template: 'base', fivesPro: false, tm: { press: 52.5, bench: 72.5, squat: 105, deadlift: 125 } },
      { index: 1, startedAt: '2026-01-01', status: 'completed', template: 'base', fivesPro: false, tm: { press: 50, bench: 70, squat: 100, deadlift: 120 } },
    ] as Cycle[];
    expect(trainingMaxSeries(cycles, 'press')).toEqual([
      { cycleIndex: 1, startedAt: '2026-01-01', tm: 50 },
      { cycleIndex: 2, startedAt: '2026-02-01', tm: 52.5 },
    ]);
  });
});

describe('personalRecord', () => {
  it('returns the max est1RM with its date', () => {
    const sessions = [
      sess({ date: '2026-01-01', amrapReps: 3, estimated1RM: 110, sets: [amrapSet(95)] }),
      sess({ date: '2026-02-01', amrapReps: 5, estimated1RM: 125, sets: [amrapSet(100)] }),
    ];
    expect(personalRecord(sessions, 'press')).toEqual({ est1RM: 125, date: '2026-02-01' });
  });
  it('is null with no data', () => expect(personalRecord([], 'press')).toBeNull());
});

describe('cycleLog', () => {
  it('groups sessions by cycle, newest first, with a top-set summary', () => {
    const cycles = [
      { id: 1, index: 1, startedAt: '2026-01-01', status: 'completed', template: 'base', fivesPro: false, tm: {} },
      { id: 2, index: 2, startedAt: '2026-02-01', status: 'active', template: 'base', fivesPro: false, tm: {} },
    ] as unknown as Cycle[];
    const sessions = [
      sess({ cycleId: 1, date: '2026-01-02', liftKey: 'press', week: 1, amrapReps: 5, estimated1RM: 120, sets: [amrapSet(100)] }),
      sess({ cycleId: 2, date: '2026-02-02', liftKey: 'squat', week: 1, amrapReps: 6, estimated1RM: 210, sets: [amrapSet(180)] }),
    ];
    const groups = cycleLog(sessions, cycles);
    expect(groups.map(g => g.cycleIndex)).toEqual([2, 1]);
    expect(groups[0].entries[0]).toMatchObject({ liftKey: 'squat', topWeight: 180, topReps: 6, isAmrap: true, est1RM: 210 });
  });
});
