import { db } from './db';
import type { Unit, LiftCategory } from '../domain';
import { roundToIncrement } from '../domain';

/** Per-category increment for a given target unit (upper: press/bench, lower: squat/deadlift). */
function liftIncrement(category: LiftCategory, to: Unit): number {
  if (category === 'upper') return to === 'kg' ? 2.5 : 5;
  return to === 'kg' ? 5 : 10;
}

/**
 * Converts every stored weight (profile rounding increment, lift TMs/1RMs,
 * cycle TMs, session set weights + estimated 1RMs, bodyweight entries) from
 * the profile's current unit to `to`. No-ops when there is no profile, or
 * the profile is already in `to`. Runs as a single Dexie transaction so a
 * failure partway through leaves nothing half-converted.
 */
export async function convertUnits(to: Unit): Promise<void> {
  const profile = await db.profile.get('me');
  if (!profile || profile.units === to) return;

  const factor = to === 'lb' ? 2.2046226218 : 1 / 2.2046226218;
  const target = to === 'kg' ? 2.5 : 5;

  await db.transaction('rw', db.profile, db.lifts, db.cycles, db.sessions, db.bodyweight, async () => {
    await db.profile.put({ ...profile, units: to, roundingIncrement: target });

    const lifts = await db.lifts.toArray();
    await db.lifts.bulkPut(
      lifts.map((l) => ({
        ...l,
        trainingMax: roundToIncrement(l.trainingMax * factor, target),
        oneRm: roundToIncrement(l.oneRm * factor, target),
        increment: liftIncrement(l.category, to),
      })),
    );

    const cycles = await db.cycles.toArray();
    for (const c of cycles) {
      const tm = { ...c.tm };
      for (const key of Object.keys(tm) as (keyof typeof tm)[]) {
        tm[key] = roundToIncrement(tm[key] * factor, target);
      }
      await db.cycles.put({ ...c, tm });
    }

    const sessions = await db.sessions.toArray();
    for (const s of sessions) {
      const sets = s.sets.map((set) => ({
        ...set,
        weight: roundToIncrement(set.weight * factor, target),
      }));
      const estimated1RM = s.estimated1RM == null ? s.estimated1RM : roundToIncrement(s.estimated1RM * factor, target);
      await db.sessions.put({ ...s, sets, estimated1RM });
    }

    const bodyweight = await db.bodyweight.toArray();
    await db.bodyweight.bulkPut(
      bodyweight.map((b) => ({ ...b, weight: Math.round(b.weight * factor * 10) / 10 })),
    );
  });
}
