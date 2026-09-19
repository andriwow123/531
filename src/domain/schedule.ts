import type { LiftKey, WeekNumber } from './types';

/** Fixed rotation of lifts within a training week. */
export const LIFT_ORDER: LiftKey[] = ['press', 'bench', 'squat', 'deadlift'];

export interface LoggedSession {
  liftKey: LiftKey;
  week: WeekNumber;
}

/**
 * Determines the next lift/week to train, given the sessions already logged
 * for the active cycle. Lifts rotate press -> bench -> squat -> deadlift
 * within a week; once all four have been logged in the current week, the
 * schedule advances to the next week (starting again at press).
 */
export function nextUp(logged: LoggedSession[]): { liftKey: LiftKey; week: WeekNumber } {
  if (logged.length === 0) return { liftKey: 'press', week: 1 };

  const currentWeek = logged.reduce<WeekNumber>((max, s) => (s.week > max ? s.week : max), 1);
  const loggedThisWeek = new Set(logged.filter((s) => s.week === currentWeek).map((s) => s.liftKey));
  const nextLift = LIFT_ORDER.find((k) => !loggedThisWeek.has(k));

  if (nextLift) return { liftKey: nextLift, week: currentWeek };

  const nextWeek = (currentWeek < 4 ? currentWeek + 1 : 4) as WeekNumber;
  return { liftKey: 'press', week: nextWeek };
}
