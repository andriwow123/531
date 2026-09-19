import { describe, it, expect } from 'vitest';
import { nextUp } from './schedule';
import type { LiftKey, WeekNumber } from './types';

describe('nextUp', () => {
  it('starts at press, week 1 when nothing has been logged', () => {
    expect(nextUp([])).toEqual({ liftKey: 'press', week: 1 });
  });

  it('advances to the next lift in the fixed order within the same week', () => {
    const logged: { liftKey: LiftKey; week: WeekNumber }[] = [{ liftKey: 'press', week: 1 }];
    expect(nextUp(logged)).toEqual({ liftKey: 'bench', week: 1 });
  });

  it('rolls over to press, week 2 once all four lifts are logged in week 1', () => {
    const logged: { liftKey: LiftKey; week: WeekNumber }[] = [
      { liftKey: 'press', week: 1 },
      { liftKey: 'bench', week: 1 },
      { liftKey: 'squat', week: 1 },
      { liftKey: 'deadlift', week: 1 },
    ];
    expect(nextUp(logged)).toEqual({ liftKey: 'press', week: 2 });
  });
});
