import type { LiftKey } from './types';
import { LIFT_ORDER } from './schedule';

/**
 * The 4 lifts each exactly once, in the given order — sanitized: unknown or
 * duplicate keys are dropped, and any lift missing from `liftOrder` is
 * appended in `LIFT_ORDER` order. An empty or undefined input (e.g. an old
 * saved settings record that predates this field) falls back to `LIFT_ORDER`.
 */
export function orderedLifts(liftOrder: LiftKey[] | undefined): LiftKey[] {
  const valid = new Set<LiftKey>(LIFT_ORDER);
  const seen = new Set<LiftKey>();
  const out: LiftKey[] = [];
  for (const k of liftOrder ?? []) {
    if (valid.has(k) && !seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  }
  for (const k of LIFT_ORDER) if (!seen.has(k)) out.push(k);
  return out;
}

/** New array with the element at `from` moved to `to` (both clamped to range). */
export function moveItem<T>(arr: T[], from: number, to: number): T[] {
  const next = arr.slice();
  if (from < 0 || from >= next.length) return next;
  const [item] = next.splice(from, 1);
  const dest = Math.max(0, Math.min(to, next.length));
  next.splice(dest, 0, item);
  return next;
}
