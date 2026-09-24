# Plan 14 — Per-Lift Rounding, Workout Timer, Templates-Apply-Now, Bodyweight Editor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per-lift rounding; a whole-workout-day timer (with "forgot to end it" recovery); template changes that apply to the current cycle immediately with in-progress set checks saved as you go; and a tap-row bodyweight editor.

**Architecture:** Pure helpers land in the domain first (rounding steps/defaults/mapping, workout-time math, row keys). Per-lift rounding is an optional `Lift.roundingIncrement` with the profile value as fallback. A new `workoutDays` Dexie table (the only schema change, `version(6)`) holds each workout day's timer and in-progress draft; backup restore becomes a full replace. UI tasks then wire Settings, Home, CycleEnd, LiftCard, History and BodyweightCard.

**Tech Stack:** React 19 + TS strict + Vite + Tailwind v3 + Dexie + Vitest (+ fake-indexeddb).

**Spec:** `docs/superpowers/specs/2026-09-24-531-plan14-mechanics-polish-design.md`

## Global Constraints
- TS strict + `verbatimModuleSyntax`: `import type` for type-only imports. `noUnusedLocals` / `noUnusedParameters` ON.
- COACH theme tokens only (`var(--…)`); no hardcoded hex. Mobile-first; keep `max-w-md`.
- Decimal weight inputs: `type="text" inputMode="decimal"` + comma-normalized parse (`Number(String(v).replace(',', '.'))`).
- UI tests render within `SettingsProvider` (when the component reads settings) and await `loaded`; fake-indexeddb is set up globally.
- Time fixtures in tests use **local-time** constructors (`new Date(2026, 8, 24, 18, 4).toISOString()`) so assertions don't depend on the machine's timezone.
- `npx tsc -b` clean + full suite green (**run twice**) before every commit. Baseline: **262 tests**.
- Exactly **one** schema change: additive Dexie `version(6)` adding `workoutDays` (Task 4). No other store changes.
- No change to 5/3/1 percentages, `Lift.increment` (progression bumps), or entered-TM precision.
- A template change must never modify a saved `Session`.
- Every commit ends with the trailer line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (pass it as a second `-m`).

## File Structure
| File | Responsibility | Tasks |
|---|---|---|
| `src/domain/rounding.ts` | `ROUNDING_STEPS`, `defaultRoundingFor`, `effectiveRounding`, `convertRoundingStep` (+ existing `roundToIncrement`) | 1 |
| `src/domain/workoutTime.ts` (new) | timer math/formatting: `formatElapsed`, `formatWorkoutDuration`, `toTimeInput`, `atTimeOnDay`, `resolveEndTime`, `guessFinishTime`, `isLeftRunning` | 1 |
| `src/domain/workoutRow.ts` (new) | `workoutRowKey` | 1 |
| `src/domain/index.ts` | exports | 1 |
| `src/data/repositories.ts` | `Lift.roundingIncrement?`; `cycleRepo.setTemplate`; `WorkoutDay` + `workoutDayRepo` | 2, 4, 7 |
| `src/data/db.ts` | `version(6)` `workoutDays` | 4 |
| `src/data/backup.ts` | import = full replace | 4 |
| `src/data/units.ts` | map per-lift rounding across units | 2 |
| `src/ui/screens/Home.tsx` | load lifts, pass per-lift rounding | 2 |
| `src/ui/screens/CycleEnd.tsx` | per-lift progression rounding | 2 |
| `src/ui/screens/Onboarding.tsx` | per-lift default rounding | 2 |
| `src/ui/screens/Settings.tsx` | per-lift rounding steppers; templates write-through | 1, 3, 7 |
| `src/ui/components/WorkoutTimer.tsx` (new) | the timer UI | 5 |
| `src/ui/components/LiftCard.tsx` | mount timer; template in `workoutKey`; in-progress drafts | 5, 7, 8 |
| `src/domain/history.ts`, `src/ui/screens/History.tsx` | `CycleLogEntry.cycleId`; duration in cycle log | 6 |
| `src/ui/components/BodyweightCard.tsx` | tap-row editor | 9 |

---

### Task 1: Domain helpers — rounding, workout time, row keys

**Files:**
- Modify: `src/domain/rounding.ts`, `src/domain/index.ts`, `src/ui/screens/Settings.tsx` (delete the local `ROUNDING_STEPS` const at ~line 53-57 and import it from `../../domain` instead — no behavior change)
- Create: `src/domain/workoutTime.ts`, `src/domain/workoutRow.ts`
- Test: `src/domain/rounding.test.ts` (extend), `src/domain/workoutTime.test.ts`, `src/domain/workoutRow.test.ts`

**Interfaces — Produces:**
- `ROUNDING_STEPS: Record<Unit, number[]>` = `{ kg: [1.25, 2.5, 5], lb: [2.5, 5, 10] }`
- `defaultRoundingFor(category: LiftCategory, unit: Unit): number`
- `effectiveRounding(perLift: number | undefined, profileRounding: number): number`
- `convertRoundingStep(value: number, from: Unit, to: Unit, category: LiftCategory): number`
- `formatElapsed(totalSeconds: number): string` · `formatWorkoutDuration(startedAt: string, endedAt: string): string` · `toTimeInput(iso: string): string` · `atTimeOnDay(anchorIso: string, hhmm: string): string` · `resolveEndTime(startIso: string, endHhmm: string): string` · `guessFinishTime(startIso: string, sessionSavedAt: string | undefined, nowIso: string): string` · `isLeftRunning(startIso: string, nowIso: string): boolean`
- `workoutRowKey(kind: SetKind, kindIndex: number, template: TemplateKey): string`

- [ ] **Step 1: Write failing tests.**

`src/domain/rounding.test.ts` — add:
```ts
import { ROUNDING_STEPS, defaultRoundingFor, effectiveRounding, convertRoundingStep } from './rounding';

describe('per-lift rounding helpers', () => {
  it('offers the standard steps per unit', () => {
    expect(ROUNDING_STEPS).toEqual({ kg: [1.25, 2.5, 5], lb: [2.5, 5, 10] });
  });
  it('defaults upper-body to 2.5 kg / 5 lb and lower-body to 5 kg / 10 lb', () => {
    expect(defaultRoundingFor('upper', 'kg')).toBe(2.5);
    expect(defaultRoundingFor('upper', 'lb')).toBe(5);
    expect(defaultRoundingFor('lower', 'kg')).toBe(5);
    expect(defaultRoundingFor('lower', 'lb')).toBe(10);
  });
  it('uses the lift value when set, else the profile fallback', () => {
    expect(effectiveRounding(5, 2.5)).toBe(5);
    expect(effectiveRounding(undefined, 2.5)).toBe(2.5);
  });
  it('maps a step across units by position, falling back to the category default', () => {
    expect(convertRoundingStep(1.25, 'kg', 'lb', 'upper')).toBe(2.5);
    expect(convertRoundingStep(5, 'kg', 'lb', 'lower')).toBe(10);
    expect(convertRoundingStep(10, 'lb', 'kg', 'lower')).toBe(5);
    expect(convertRoundingStep(3, 'kg', 'lb', 'upper')).toBe(5); // unknown -> default
  });
});
```

`src/domain/workoutTime.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import {
  formatElapsed, formatWorkoutDuration, toTimeInput, atTimeOnDay,
  resolveEndTime, guessFinishTime, isLeftRunning,
} from './workoutTime';

const at = (h: number, m: number, day = 24) => new Date(2026, 8, day, h, m).toISOString();

describe('workout time helpers', () => {
  it('formats elapsed as m:ss under an hour and h:mm:ss after', () => {
    expect(formatElapsed(0)).toBe('0:00');
    expect(formatElapsed(754)).toBe('12:34');
    expect(formatElapsed(3912)).toBe('1:05:12');
  });
  it('formats duration in whole minutes / hours', () => {
    expect(formatWorkoutDuration(at(18, 0), at(18, 52))).toBe('52 min');
    expect(formatWorkoutDuration(at(18, 0), at(19, 5))).toBe('1 h 5 min');
    expect(formatWorkoutDuration(at(18, 0), at(20, 0))).toBe('2 h');
  });
  it('round-trips a local time of day', () => {
    expect(toTimeInput(at(6, 4))).toBe('06:04');
    expect(atTimeOnDay(at(18, 0), '19:30')).toBe(at(19, 30));
  });
  it('puts an end at or before the start on the next day', () => {
    expect(resolveEndTime(at(18, 0), '19:10')).toBe(at(19, 10));
    expect(resolveEndTime(at(23, 30), '00:20')).toBe(at(0, 20, 25));
    expect(resolveEndTime(at(18, 0), '18:00')).toBe(at(18, 0, 25));
  });
  it('guesses the finish from the session save, else start + 1 h, never after now', () => {
    expect(guessFinishTime(at(18, 0), at(18, 50), at(23, 0))).toBe(at(18, 50));
    expect(guessFinishTime(at(18, 0), undefined, at(23, 0))).toBe(at(19, 0));
    expect(guessFinishTime(at(18, 0), at(17, 0), at(23, 0))).toBe(at(19, 0)); // save before start ignored
    expect(guessFinishTime(at(18, 0), undefined, at(18, 30))).toBe(at(18, 30)); // capped at now
  });
  it('flags a timer as left running only after 3 hours', () => {
    expect(isLeftRunning(at(18, 0), at(21, 0))).toBe(false);
    expect(isLeftRunning(at(18, 0), at(21, 1))).toBe(true);
    expect(isLeftRunning(at(23, 40), at(0, 20, 25))).toBe(false); // crosses midnight, only 40 min
  });
});
```

`src/domain/workoutRow.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { workoutRowKey } from './workoutRow';

describe('workoutRowKey', () => {
  it('keys warm-up and main sets independent of template', () => {
    expect(workoutRowKey('main', 2, 'bbb')).toBe('main:2');
    expect(workoutRowKey('main', 2, 'fsl')).toBe('main:2');
    expect(workoutRowKey('warmup', 1, 'base')).toBe('warmup:1');
  });
  it('keys supplemental sets per template', () => {
    expect(workoutRowKey('supplemental', 3, 'bbb')).toBe('bbb:supplemental:3');
    expect(workoutRowKey('supplemental', 3, 'fsl')).toBe('fsl:supplemental:3');
  });
});
```

- [ ] **Step 2: Run → FAIL** (`npx vitest run src/domain`).

- [ ] **Step 3: Implement.**

`src/domain/rounding.ts` (keep `roundToIncrement` as-is, add below it):
```ts
import type { LiftCategory, Unit } from './types';

/** Rounding increments offered per unit, ordered smallest -> largest. */
export const ROUNDING_STEPS: Record<Unit, number[]> = {
  kg: [1.25, 2.5, 5],
  lb: [2.5, 5, 10],
};

/** Standard per-lift rounding for a new setup: upper-body 2.5 kg / 5 lb, lower-body 5 kg / 10 lb. */
export function defaultRoundingFor(category: LiftCategory, unit: Unit): number {
  if (category === 'upper') return unit === 'kg' ? 2.5 : 5;
  return unit === 'kg' ? 5 : 10;
}

/** A lift's own rounding when set, else the profile-wide fallback. */
export function effectiveRounding(perLift: number | undefined, profileRounding: number): number {
  return perLift ?? profileRounding;
}

/** Maps a rounding step across units by its position in ROUNDING_STEPS
 *  (1.25 kg <-> 2.5 lb, 2.5 <-> 5, 5 <-> 10); an unknown value falls back to the category default. */
export function convertRoundingStep(value: number, from: Unit, to: Unit, category: LiftCategory): number {
  const index = ROUNDING_STEPS[from].indexOf(value);
  return index === -1 ? defaultRoundingFor(category, to) : ROUNDING_STEPS[to][index];
}
```

`src/domain/workoutTime.ts`:
```ts
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** "12:34" under an hour, "1:05:12" from an hour on. */
export function formatElapsed(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/** Whole-minute length: "52 min", "1 h 5 min", "2 h". */
export function formatWorkoutDuration(startedAt: string, endedAt: string): string {
  const minutes = Math.max(0, Math.round((Date.parse(endedAt) - Date.parse(startedAt)) / MINUTE));
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** Local "HH:MM" of an ISO timestamp, for <input type="time">. */
export function toTimeInput(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** ISO for local "HH:MM" on the same local calendar day as `anchorIso`. */
export function atTimeOnDay(anchorIso: string, hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(anchorIso);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

/** An end "HH:MM" on the start's local day, or the next day when it isn't after
 *  the start (compared to the minute) — a workout that ran past midnight. */
export function resolveEndTime(startIso: string, endHhmm: string): string {
  const end = new Date(atTimeOnDay(startIso, endHhmm));
  const start = new Date(startIso);
  start.setSeconds(0, 0);
  if (end.getTime() <= start.getTime()) end.setDate(end.getDate() + 1);
  return end.toISOString();
}

/** Best-guess finish for a timer left running: when the lift's session
 *  auto-saved (if after the start), else an hour after the start — never after now. */
export function guessFinishTime(startIso: string, sessionSavedAt: string | undefined, nowIso: string): string {
  const start = Date.parse(startIso);
  const saved = sessionSavedAt ? Date.parse(sessionSavedAt) : Number.NaN;
  const guess = Number.isFinite(saved) && saved > start ? saved : start + HOUR;
  return new Date(Math.min(guess, Date.parse(nowIso))).toISOString();
}

/** A timer left on by mistake: running for more than 3 hours. */
export function isLeftRunning(startIso: string, nowIso: string): boolean {
  return Date.parse(nowIso) - Date.parse(startIso) > 3 * HOUR;
}
```

`src/domain/workoutRow.ts`:
```ts
import type { SetKind, TemplateKey } from './types';

/** Stable identity for an in-progress set row. Warm-up and main sets are the
 *  same under every template; supplemental sets are template-specific, so BBB
 *  and FSL back-off progress never bleed into each other. */
export function workoutRowKey(kind: SetKind, kindIndex: number, template: TemplateKey): string {
  return kind === 'supplemental' ? `${template}:supplemental:${kindIndex}` : `${kind}:${kindIndex}`;
}
```

`src/domain/index.ts` — replace `export { roundToIncrement } from './rounding';` with:
```ts
export { roundToIncrement, ROUNDING_STEPS, defaultRoundingFor, effectiveRounding, convertRoundingStep } from './rounding';
export {
  formatElapsed, formatWorkoutDuration, toTimeInput, atTimeOnDay, resolveEndTime, guessFinishTime, isLeftRunning,
} from './workoutTime';
export { workoutRowKey } from './workoutRow';
```

`src/ui/screens/Settings.tsx` — delete the local `ROUNDING_STEPS` const (and its doc comment) and add `ROUNDING_STEPS` to the existing value import from `'../../domain'`. Nothing else in Settings changes here.

- [ ] **Step 4: Run → PASS**, then `npx tsc -b` clean + full suite green (2×).
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(domain): per-lift rounding helpers, workout-time math, workout row keys" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

---

### Task 2: Per-lift rounding wiring (data, Home, CycleEnd, Onboarding, unit conversion)

**Files:**
- Modify: `src/data/repositories.ts` (`Lift`), `src/ui/screens/Home.tsx`, `src/ui/screens/CycleEnd.tsx`, `src/ui/screens/Onboarding.tsx`, `src/data/units.ts`
- Test: `Home.test.tsx`, `CycleEnd.test.tsx`, `Onboarding.test.tsx`, `src/data/units.test.ts`

**Interfaces:**
- Consumes (Task 1): `effectiveRounding`, `defaultRoundingFor`, `convertRoundingStep`.
- Produces: `Lift.roundingIncrement?: number` (absent ⇒ profile fallback).

- [ ] **Step 1: Write failing tests.**
  - `Home.test.tsx`: seed profile `{ units:'kg', roundingIncrement: 2.5 }`, lifts where squat has `roundingIncrement: 5` and the others have none, an active week-1 cycle with `tm.squat = 142.5`, `tm.bench = 103`. The squat card's first work set (65%) shows **95** (5 kg rounding of 92.625), and the bench card's first work set shows **67.5** (fallback 2.5 of 66.95). Use the existing Home test harness/selectors.
  - `CycleEnd.test.tsx`: squat lift `{ increment: 5, roundingIncrement: 5 }`, `tm.squat = 142.5`, a week-3 top set completed with a bump-level RPE → suggested new TM **150** (`round(147.5, 5)`; the 2.5 fallback would give 147.5).
  - `Onboarding.test.tsx`: after submitting (kg), `liftRepo.all()` has press/bench `roundingIncrement: 2.5` and squat/deadlift `roundingIncrement: 5`; entered TMs unchanged from today (still rounded to the profile's 2.5).
  - `units.test.ts`: kg→lb maps a squat with `roundingIncrement: 5` to **10** and a press with `1.25` to **2.5**; a lift with no `roundingIncrement` still has none afterward.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement.**
  - `repositories.ts` — in `Lift`, add after `increment: number;`:
    ```ts
    /** Per-lift rounding for working sets; absent = use profile.roundingIncrement. */
    roundingIncrement?: number;
    ```
  - `Home.tsx` — import `liftRepo` and `effectiveRounding` (+ `import type { Lift }`); add `lifts: Lift[]` to `LoadedData`; in `load()` use `const [cycle, profile, lifts] = await Promise.all([cycleRepo.active(), profileRepo.get(), liftRepo.all()]);` and `setData({ cycle, profile, sessions, lifts })`; pass each card
    ```tsx
    roundingIncrement={effectiveRounding(
      data.lifts.find((l) => l.key === key)?.roundingIncrement,
      data.profile.roundingIncrement,
    )}
    ```
    (`handleLogged` / `handleTmChange` already spread `prev`, so `lifts` is kept.)
  - `CycleEnd.tsx` — add `roundingIncrement: number` to the per-lift row type; compute `const roundingIncrement = effectiveRounding(lift?.roundingIncrement, profile.roundingIncrement);` per lift, pass it to `suggestFor(…)`, store it on the row, and have the RPE-change re-suggestion (currently `suggestFor(row, rpe, prev.roundingIncrement)`) use `row.roundingIncrement`. Drop the now-unused top-level `roundingIncrement` from the loaded state if nothing else reads it.
  - `Onboarding.tsx` — import `defaultRoundingFor`; the lift object becomes `{ key, name: meta.name, category: meta.category, oneRm: trainingMax, trainingMax, increment, roundingIncrement: defaultRoundingFor(meta.category, units) }`. Leave the TM computation (profile increment) unchanged.
  - `units.ts` — import `convertRoundingStep`; in the lifts `map`, spread
    `...(l.roundingIncrement !== undefined ? { roundingIncrement: convertRoundingStep(l.roundingIncrement, profile.units, to, l.category) } : {})`.
- [ ] **Step 4: Run → PASS**, `npx tsc -b` clean + suite (2×).
- [ ] **Step 5: Commit** — `git commit -am "feat: per-lift rounding for working sets, progression, onboarding and unit conversion" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

---

### Task 3: Settings — one rounding stepper per lift

**Files:** Modify `src/ui/screens/Settings.tsx`; Test `src/ui/screens/Settings.test.tsx`.

**Interfaces:** Consumes `ROUNDING_STEPS`, `effectiveRounding` (Task 1), `Lift.roundingIncrement` (Task 2), `liftRepo.update(key, patch)` (exists).

- [ ] **Step 1: Write failing tests** (within `SettingsProvider`, await loaded): seed profile kg / 2.5 and lifts with squat `roundingIncrement: 5`, others unset.
  - The Rounding section shows a stepper per lift labelled by lift name with values **2.5kg** (press, bench, deadlift) and **5kg** (squat); the old "Round loads to" label is gone.
  - Clicking "Increase Overhead Press rounding" persists press `roundingIncrement` **5** (`liftRepo.all()`); clicking "Decrease Squat rounding" persists squat **2.5**.
  - The caption "Each lift's working sets round to the nearest step you can load." renders.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement.**
  - Import `liftRepo`, `effectiveRounding` and `import type { Lift }`. Add `const [lifts, setLifts] = useState<Lift[] | null>(null);` loaded by a `liftRepo.all()` effect (same cancel pattern as the profile effect).
  - Replace `changeRounding` with:
    ```ts
    async function changeLiftRounding(key: LiftKey, dir: 1 | -1) {
      if (!profile || !lifts) return;
      const lift = lifts.find((l) => l.key === key);
      if (!lift) return;
      const current = effectiveRounding(lift.roundingIncrement, profile.roundingIncrement);
      const next = stepWithin(ROUNDING_STEPS[profile.units], current, dir);
      if (next === current) return;
      await liftRepo.update(key, { roundingIncrement: next });
      setLifts(lifts.map((l) => (l.key === key ? { ...l, roundingIncrement: next } : l)));
    }
    ```
    and delete the now-unused `roundingSteps` / `roundingIndex` values.
  - Replace the Rounding section body with:
    ```tsx
    {profile && lifts ? (
      <>
        {orderedLifts(settings.liftOrder).map((key) => {
          const steps = ROUNDING_STEPS[profile.units];
          const value = effectiveRounding(lifts.find((l) => l.key === key)?.roundingIncrement, profile.roundingIncrement);
          const index = steps.indexOf(value);
          return (
            <Stepper
              key={key}
              label={LIFT_NAMES[key]}
              valueLabel={`${value}${profile.units}`}
              onDecrease={() => changeLiftRounding(key, -1)}
              onIncrease={() => changeLiftRounding(key, 1)}
              decreaseLabel={`Decrease ${LIFT_NAMES[key]} rounding`}
              increaseLabel={`Increase ${LIFT_NAMES[key]} rounding`}
              disableDecrease={index === 0}
              disableIncrease={index === steps.length - 1}
            />
          );
        })}
        <p className="text-[12px] text-[var(--muted)]">Each lift's working sets round to the nearest step you can load.</p>
      </>
    ) : (
      <p className="text-sm text-[var(--muted)]">Loading…</p>
    )}
    ```
  - Re-point any existing Settings test that asserted the single "Round loads to" stepper.
- [ ] **Step 4: Run → PASS**, `npx tsc -b` clean + suite (2×).
- [ ] **Step 5: Commit** — `git commit -am "feat(ui): per-lift rounding steppers in Settings" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

---

### Task 4: `workoutDays` table + repo + backup full-replace

**Files:** Modify `src/data/repositories.ts`, `src/data/db.ts`, `src/data/backup.ts`; Test `src/data/repositories.test.ts`, `src/data/backup.test.ts`, new `src/data/db.test.ts`.

**Interfaces — Produces:**
```ts
export interface WorkoutDay {
  id?: number;
  cycleId: number;
  week: WeekNumber;
  liftKey: LiftKey;
  startedAt: string | null;
  endedAt: string | null;
  progress: Record<string, { done: boolean; actualReps: number | null }>;
  notes: string;
}
workoutDayRepo.get(cycleId, week, liftKey): Promise<WorkoutDay | undefined>
workoutDayRepo.forCycle(cycleId): Promise<WorkoutDay[]>
workoutDayRepo.all(): Promise<WorkoutDay[]>
workoutDayRepo.setTimes(cycleId, week, liftKey, times: { startedAt: string | null; endedAt: string | null }): Promise<void>
workoutDayRepo.saveProgress(cycleId, week, liftKey, progress: WorkoutDay['progress'], notes: string): Promise<void>
workoutDayRepo.clearProgress(cycleId, week, liftKey): Promise<void>
```

- [ ] **Step 1: Write failing tests.**

`repositories.test.ts`:
```ts
describe('workoutDayRepo', () => {
  it('upserts times and progress on one row per cycle/week/lift', async () => {
    await workoutDayRepo.setTimes(1, 2, 'press', { startedAt: 'S', endedAt: null });
    await workoutDayRepo.saveProgress(1, 2, 'press', { 'main:1': { done: true, actualReps: 5 } }, 'felt good');
    const rows = await workoutDayRepo.forCycle(1);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ week: 2, liftKey: 'press', startedAt: 'S', endedAt: null, notes: 'felt good' });
    expect(rows[0].progress['main:1']).toEqual({ done: true, actualReps: 5 });
  });
  it('clearProgress empties progress and notes but keeps times, and never creates a row', async () => {
    await workoutDayRepo.setTimes(1, 1, 'squat', { startedAt: 'S', endedAt: 'E' });
    await workoutDayRepo.saveProgress(1, 1, 'squat', { 'main:1': { done: true, actualReps: 5 } }, 'n');
    await workoutDayRepo.clearProgress(1, 1, 'squat');
    expect(await workoutDayRepo.get(1, 1, 'squat')).toMatchObject({ startedAt: 'S', endedAt: 'E', progress: {}, notes: '' });
    await workoutDayRepo.clearProgress(9, 1, 'bench');
    expect(await workoutDayRepo.get(9, 1, 'bench')).toBeUndefined();
  });
});
```

`backup.test.ts`:
```ts
it('exports workoutDays', async () => {
  await workoutDayRepo.setTimes(1, 1, 'press', { startedAt: 'S', endedAt: null });
  const file = await exportBackup();
  expect(file.data.workoutDays).toHaveLength(1);
});
it('restore is a full replace: a backup without workoutDays clears them', async () => {
  await workoutDayRepo.setTimes(1, 1, 'press', { startedAt: 'S', endedAt: null });
  await importBackup({ app: '531', version: 1, exportedAt: 'x', data: { bodyweight: [] } });
  expect(await workoutDayRepo.all()).toEqual([]);
});
```

`src/data/db.test.ts` (new):
```ts
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
```
(Follow the existing test files' per-test DB reset so this test leaves the shared `db` open for the next file.)

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement.**

`repositories.ts` — add the `WorkoutDay` interface above and:
```ts
function findDay(cycleId: number, week: WeekNumber, liftKey: LiftKey): Promise<WorkoutDay | undefined> {
  return db.workoutDays.where('[cycleId+week+liftKey]').equals([cycleId, week, liftKey]).first();
}

async function upsertDay(cycleId: number, week: WeekNumber, liftKey: LiftKey, patch: Partial<WorkoutDay>): Promise<void> {
  const existing = await findDay(cycleId, week, liftKey);
  if (existing?.id !== undefined) {
    await db.workoutDays.update(existing.id, patch);
  } else {
    await db.workoutDays.add({ cycleId, week, liftKey, startedAt: null, endedAt: null, progress: {}, notes: '', ...patch });
  }
}

export const workoutDayRepo = {
  get: (cycleId: number, week: WeekNumber, liftKey: LiftKey) => findDay(cycleId, week, liftKey),
  forCycle: (cycleId: number): Promise<WorkoutDay[]> => db.workoutDays.where('cycleId').equals(cycleId).toArray(),
  all: (): Promise<WorkoutDay[]> => db.workoutDays.toArray(),
  setTimes: (cycleId: number, week: WeekNumber, liftKey: LiftKey, times: { startedAt: string | null; endedAt: string | null }) =>
    upsertDay(cycleId, week, liftKey, times),
  saveProgress: (cycleId: number, week: WeekNumber, liftKey: LiftKey, progress: WorkoutDay['progress'], notes: string) =>
    upsertDay(cycleId, week, liftKey, { progress, notes }),
  clearProgress: async (cycleId: number, week: WeekNumber, liftKey: LiftKey): Promise<void> => {
    const existing = await findDay(cycleId, week, liftKey);
    if (existing?.id !== undefined) await db.workoutDays.update(existing.id, { progress: {}, notes: '' });
  },
};
```

`db.ts` — import `WorkoutDay` (type) with the others, declare `workoutDays!: Table<WorkoutDay, number>;`, and add after `version(5)`:
```ts
this.version(6).stores({ workoutDays: '++id, [cycleId+week+liftKey], cycleId' });
```

`backup.ts` — `importBackup`'s transaction body becomes (and update its doc comment to "Full restore: every table is cleared, then each table present in the backup is restored"):
```ts
for (const table of db.tables) {
  await table.clear();
  const rows = file.data[table.name];
  if (Array.isArray(rows)) await table.bulkPut(rows as unknown[]);
}
```

- [ ] **Step 4: Run → PASS**, `npx tsc -b` clean + suite (2×).
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(data): workoutDays table (timer + in-progress drafts), full-replace restore" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

---

### Task 5: `WorkoutTimer` component (incl. "forgot to end it") + LiftCard mount

**Files:** Create `src/ui/components/WorkoutTimer.tsx`, `src/ui/components/WorkoutTimer.test.tsx`; Modify `src/ui/components/LiftCard.tsx`.

**Interfaces:**
- Consumes: `workoutDayRepo.get/setTimes` (Task 4); `formatElapsed`, `formatWorkoutDuration`, `toTimeInput`, `atTimeOnDay`, `resolveEndTime`, `guessFinishTime`, `isLeftRunning` (Task 1).
- Produces: `export default function WorkoutTimer(props: { cycleId: number; week: WeekNumber; liftKey: LiftKey; sessionSavedAt?: string; now?: () => Date })` — `now` is injectable for tests (defaults to `() => new Date()`).

**Behavior (spec §4):**
- Loads its `WorkoutDay` on mount and when `cycleId/week/liftKey` change; renders nothing until loaded.
- **Not started** (no `startedAt`): full-width button **"Start workout"** → `setTimes({ startedAt: now, endedAt: null })`.
- **Running** (`startedAt`, no `endedAt`), ticking via a 1 s `setInterval` (cleared on stop/unmount):
  - normal: text `Workout · {formatElapsed(seconds)}` + **"End workout"** (→ `setTimes({ startedAt, endedAt: now })`) + a secondary text button **"Forgot to end it?"** (opens *finish mode*).
  - when `isLeftRunning(startedAt, now)`: an emphasized box (accent-soft background) `Still running since {h:mm AM/PM} — forgot to end it?` with **"Set finish time"** (primary → finish mode) and **"End now"**.
- **Finish mode:** label "When did you finish?", `<input type="time">` (`aria-label="Finish time"`) prefilled with `toTimeInput(guessFinishTime(startedAt, sessionSavedAt, now))`; **Save** → `end = resolveEndTime(startedAt, value)`; if `end <= startedAt` or `end > now` show `Pick a time between your start and now.` (role="alert"), else `setTimes({ startedAt, endedAt: end })`; **Cancel** closes.
- **Ended:** `Workout · {formatWorkoutDuration(startedAt, endedAt)}` + **"Edit"** → *edit mode*: Start/End time inputs (`aria-label="Start time"` / `"End time"`) prefilled via `toTimeInput`; **Save** → `start = atTimeOnDay(startedAt, startValue)`, `end = resolveEndTime(start, endValue)`; reject `end > now` with `End time can't be in the future.`; else `setTimes`. **Reset timer** → `setTimes({ startedAt: null, endedAt: null })`. **Cancel** closes.
- Theme tokens only; buttons ≥ 36 px tall; the time is `tabular-nums`.
- **LiftCard:** import `WorkoutTimer` and render, directly after the closing `</header>`:
  ```tsx
  {cycle.id != null && (
    <div className="mb-3">
      <WorkoutTimer cycleId={cycle.id} week={week} liftKey={liftKey} sessionSavedAt={existingSession?.date} />
    </div>
  )}
  ```

- [ ] **Step 1: Write failing tests** in `WorkoutTimer.test.tsx` (fresh DB per test, as other data-backed component tests do). Let `at = (h, m, day = 24) => new Date(2026, 8, day, h, m)` and pass `now={() => clock}` with a mutable `let clock`:
  1. Not started → click "Start workout" → "End workout" visible and `workoutDayRepo.get(1,1,'press')` has `startedAt` = the clock's ISO.
  2. Seed `startedAt: at(18,0)`, clock `at(18,52)` → click "End workout" → shows "52 min"; stored `endedAt` = `at(18,52)`.
  3. Seed start `at(18,0)`, clock `at(22,30)` → shows "forgot to end it?"; click "Set finish time" → "Finish time" input value `"19:00"` → Save → shows "1 h"; stored `endedAt` = `at(19,0)`.
  4. Same setup with `sessionSavedAt={at(18,50).toISOString()}` → prefilled `"18:50"`.
  5. Clock `at(18,30)` (not left running), click "Forgot to end it?", enter `"19:30"` → Save → error "Pick a time between your start and now." and nothing stored.
  6. Ended workout → "Edit" → change "End time" to `"19:10"` → Save → "1 h 10 min"; "Edit" → "Reset timer" → "Start workout" visible, times null.
  7. Clock `at(20,0)` after a `at(18,0)` start → the normal running view (no "forgot" prompt) shows `2:00:00`.
- [ ] **Step 2: Run → FAIL.** **Step 3: Implement** the component + LiftCard mount. **Step 4: Run → PASS**, `npx tsc -b` + suite (2×). Keep existing LiftCard tests green (the timer adds only a "Start workout" button above the set list).
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(ui): workout timer with forgot-to-end recovery on each workout day" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

---

### Task 6: Workout duration in the History cycle log

**Files:** Modify `src/domain/history.ts`, `src/ui/screens/History.tsx`; Test `src/domain/history.test.ts`, `src/ui/screens/History.test.tsx`.

**Interfaces:** Consumes `workoutDayRepo.all()` (Task 4), `formatWorkoutDuration` (Task 1). Produces `CycleLogEntry.cycleId: number`.

- [ ] **Step 1: Write failing tests.**
  - `history.test.ts`: `cycleLog(...)` entries carry `cycleId` equal to the session's `cycleId`.
  - `History.test.tsx`: with a done session (cycle 1, week 1, press) and `workoutDayRepo.setTimes(1, 1, 'press', { startedAt: at(18,0), endedAt: at(18,52) })`, the cycle-log entry text includes `52 min`; an entry without a timed day shows no duration.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement.**
  - `history.ts`: add `cycleId: number;` to `CycleLogEntry` and `cycleId: s.cycleId,` to the entry literal in `cycleLog`.
  - `History.tsx`: import `workoutDayRepo` (+ `import type { WorkoutDay }`) and `formatWorkoutDuration`; add `workoutDays: WorkoutDay[]` to `LoadedData`, load it in the `Promise.all`, and in the cycle-log entry's left span append the duration:
    ```tsx
    const day = data.workoutDays.find(
      (d) => d.cycleId === entry.cycleId && d.week === entry.week && d.liftKey === entry.liftKey,
    );
    const duration = day?.startedAt && day.endedAt ? formatWorkoutDuration(day.startedAt, day.endedAt) : null;
    // …{formatDate(entry.date)} · {liftName(entry.liftKey)} · Week {entry.week}{duration && ` · ${duration}`}
    ```
- [ ] **Step 4: Run → PASS**, `npx tsc -b` + suite (2×).
- [ ] **Step 5: Commit** — `git commit -am "feat(ui): show workout duration in the History cycle log" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

---

### Task 7: Templates apply to the active cycle immediately

**Files:** Modify `src/data/repositories.ts` (`cycleRepo`), `src/ui/screens/Settings.tsx` (Templates section), `src/ui/components/LiftCard.tsx` (`workoutKey`); Test `repositories.test.ts`, `Settings.test.tsx`, `LiftCard.test.tsx`.

**Interfaces — Produces:** `cycleRepo.setTemplate(cycleId: number, template: TemplateKey, fivesPro: boolean): Promise<void>`.

- [ ] **Step 1: Write failing tests.**
  - `repositories.test.ts`: `setTemplate(id, 'fsl', true)` → `cycleRepo.active()` has `template: 'fsl', fivesPro: true`, TMs unchanged.
  - `Settings.test.tsx` (with an active `base` cycle): selecting **BBB** → the active cycle's `template` is `'bbb'` and `settings.template.selected` is `'bbb'`; toggling **5s PRO** → the cycle's `fivesPro` is `true`; the caption "Changes apply to your current cycle right away." renders.
  - `LiftCard.test.tsx`: render a card with a `base` cycle (no supplemental rows), then `rerender` with the same cycle object but `template: 'bbb'` → five supplemental rows appear.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement.**
  - `cycleRepo.setTemplate = (cycleId, template, fivesPro) => db.cycles.update(cycleId, { template, fivesPro }).then(() => {})`.
  - Settings — add:
    ```ts
    async function changeTemplate(patch: Partial<Pick<SettingsState['template'], 'selected' | 'fivesPro'>>) {
      const next = { ...settings.template, ...patch };
      updateSettings({ template: next });
      if (cycle && cycle.id != null) {
        await cycleRepo.setTemplate(cycle.id, next.selected, next.fivesPro);
        setCycle({ ...cycle, template: next.selected, fivesPro: next.fivesPro });
      }
    }
    ```
    (import `type { SettingsState }` from `'../../settings/schema'`), wire the Templates `Segmented` to `changeTemplate({ selected: v })` and the 5s PRO toggle to `changeTemplate({ fivesPro: !settings.template.fivesPro })`; leave Warm-up sets as-is. Under the template description add `<p className="text-[12px] text-[var(--muted)]">Changes apply to your current cycle right away.</p>`.
  - LiftCard — extend `workoutKey` with the cycle's template and 5s PRO flag:
    ``const workoutKey = `${liftKey}:${week}:${cycle.id ?? 'x'}:${cycle.tm[liftKey]}:${showWarmups}:${cycle.template}:${cycle.fivesPro}:${roundingIncrement}`;``
    (rounding is included too so a per-lift rounding change rebuilds the list).
- [ ] **Step 4: Run → PASS**, `npx tsc -b` + suite (2×).
- [ ] **Step 5: Commit** — `git commit -am "feat: template changes apply to the active cycle immediately" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

---

### Task 8: Save in-progress set checks as you go (LiftCard drafts)

**Files:** Modify `src/ui/components/LiftCard.tsx`; Test `src/ui/components/LiftCard.test.tsx`.

**Interfaces:** Consumes `workoutDayRepo.get/saveProgress/clearProgress` (Task 4), `workoutRowKey` (Task 1), the rebuilding `workoutKey` (Task 7).

**Behavior (spec §5):**
- A **draft** = `{ dayKey, progress, notes }` for this card's `(cycle.id, week, liftKey)`, loaded via `workoutDayRepo.get` in an effect keyed on those three (store `dayKey = \`${cycle.id}:${week}:${liftKey}\`` with it so a stale draft is never applied to another day).
- **Restore:** include `draftReady` (`draft?.dayKey === currentDayKey`) in `workoutKey`, so once the draft arrives the rebuild block reruns. In that block, after `withKindIndex(buildWorkout(…))`, apply the draft when ready: for each row, `const saved = draft.progress[workoutRowKey(row.set.kind, row.kindIndex, cycle.template)]`; if present, set `done = saved.done` and `actualReps = saved.actualReps ?? row.set.reps`. Also `setNotes(draftReady ? draft.notes : '')` instead of `setNotes('')`.
- **Persist:** in `toggleDone`, `changeReps` and the notes `onChange`, compute the next rows/notes from the current state, then (only when `draftReady`, `cycle.id != null` and no saved session) save
  `progress = { ...draft.progress, ...currentRowsProgress }` — the spread keeps entries for rows not currently rendered (e.g. BBB back-off rows while on FSL) — via `workoutDayRepo.saveProgress(cycle.id, week, liftKey, progress, notes)`, and keep `draft` in sync locally.
- **Clear:** after a successful auto-save of the session (inside `save()` after `sessionRepo.add`), call `workoutDayRepo.clearProgress(cycle.id, week, liftKey)` and reset the local draft progress to `{}` (the timer's times are untouched).
- A saved session still renders from its own saved sets (unchanged).

- [ ] **Step 1: Write failing tests** (existing LiftCard harness; fresh DB per test):
  1. Check warm-up set 1 → `unmount()` → render the same card again → warm-up set 1 is still checked.
  2. Type 8 reps into the AMRAP input and a note → remount → reps `8` and the note restored.
  3. With a `bbb` cycle, check supplemental set 1 → rerender with the cycle's `template: 'fsl'` → FSL supplemental set 1 unchecked → rerender with `'bbb'` → BBB supplemental set 1 checked again.
  4. Seed `setTimes(cycleId, 1, 'press', { startedAt: 'S', endedAt: null })`, mark every main set done (session auto-saves) → `workoutDayRepo.get(...)` has `progress: {}` and `startedAt: 'S'`.
  5. A card whose `session` prop is a saved session keeps rendering that session's logged rows after `rerender` with a different template.
- [ ] **Step 2: Run → FAIL.** **Step 3: Implement.** **Step 4: Run → PASS**, `npx tsc -b` + suite (2×).
- [ ] **Step 5: Commit** — `git commit -am "feat(ui): save in-progress set checks as you go (survive navigation, reloads and template switches)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

---

### Task 9: Bodyweight — tap a row to edit it below

**Files:** Modify `src/ui/components/BodyweightCard.tsx`; Test `src/ui/components/BodyweightCard.test.tsx`.

**Behavior (spec §6):** reuse the existing state and handlers (`editingId`, `editValue`, `confirmingDeleteId`, `startEdit`, `cancelEdit`, `saveEdit`, `startDeleteConfirm`, `confirmDelete`, `parseWeightInput`); only the entries-list markup changes.
- Each `<li>` holds one full-width `<button type="button" aria-expanded={isOpen} onClick={() => (isOpen ? cancelEdit() : startEdit(entry.id, entry.weight))}>`: date on the left (muted), `{entry.weight} {unit}` + the shared `Chevron` (open = rotated) on the right.
- When open, an editor panel directly below (inside the same `<li>`, `bg-[var(--surface)]`, rounded, padded):
  - the full date; a large weight input `aria-label={`Weight for ${dateLabel}`}` (`type="text" inputMode="decimal"`, value `editValue`, `onFocus={(e) => e.currentTarget.select()}`, `autoFocus`) + unit;
  - bottom row — left: **"Delete entry"** (subtle text button → `startDeleteConfirm`), which swaps to `Delete this entry?` + **Cancel** + **Delete** (`aria-label={`Confirm delete ${entry.date} entry`}` → `confirmDelete`); right: **Cancel** (`cancelEdit`) and **Save** (`saveEdit`; `disabled` when `parseWeightInput(editValue) == null`).
- Opening another row closes the first (`startEdit` already replaces `editingId`). Remove the old per-row Edit/Delete buttons.

- [ ] **Step 1: Write/re-point failing tests:** tapping an entry row sets `aria-expanded="true"` and shows the "Weight for …" input prefilled; editing to `83,5` + Save persists `83.5` and closes the editor; Save is disabled for `0`/empty; "Delete entry" → "Delete this entry?" → Delete removes it; opening a second row closes the first. Replace the old tests that used the `Edit {date} weight` / `Delete {date} entry` buttons.
- [ ] **Step 2: Run → FAIL.** **Step 3: Implement.** **Step 4: Run → PASS**, `npx tsc -b` + suite (2×).
- [ ] **Step 5: Commit** — `git commit -am "feat(ui): tap a bodyweight entry to edit it in a roomy editor below" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

---

## Self-Review
- **Spec coverage:** §2 per-lift rounding → T1 (helpers) + T2 (wiring) + T3 (Settings); §3 workoutDays + full-replace restore → T4; §4 timer incl. forgot-to-end + left-running prompt → T5, History duration → T6; §5 templates immediate → T7, in-progress drafts + row keys → T1 + T8; §6 bodyweight editor → T9; §7 testing spread across T1–T9.
- **Placeholder scan:** none — domain/data tasks carry full code; UI tasks carry exact markup, labels, handlers and test cases.
- **Type consistency:** `effectiveRounding / defaultRoundingFor / convertRoundingStep / ROUNDING_STEPS` (T1) used by T2, T3; `WorkoutDay` + `workoutDayRepo` (T4) used by T5, T6, T8; time helpers (T1) used by T5, T6; `workoutRowKey` (T1) used by T8; `cycleRepo.setTemplate` (T7); `CycleLogEntry.cycleId` (T6); `workoutKey` extended in T7 (template, 5s PRO, rounding) and again in T8 (`draftReady`).
- **Notes for executor:** T8 is the judgment-heavy task (LiftCard's synchronous rebuild pattern + async draft) — use the most capable model. The only schema change is T4's `version(6)`. Owner reviews the look before merge — NO auto-merge; merge to `main` auto-deploys.
