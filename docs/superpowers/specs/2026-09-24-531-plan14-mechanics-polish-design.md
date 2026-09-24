# 5/3/1 App — Plan 14: Per-Lift Rounding, Workout Timer, Templates-Apply-Now, Bodyweight Editor — Design Spec

- **Date:** 2026-09-24
- **Status:** Shape approved by owner (the "mechanics + polish" half of the Plan 13/14 split); decisions confirmed in chat: timer = **whole workout day**, editable after; templates = **immediate, reversible, no data lost**; bodyweight edit = **tap row → editor opens below**.
- **Builds on:** Plans 1–13 merged to `main` (HEAD 02b51c3). Branch `plan14-mechanics-polish` off `main`; merges back (auto-deploys via GitHub Pages).

## 1. Purpose
1. **Per-lift rounding** — e.g. squat 5 kg, bench 2.5 kg.
2. **Workout timer** — Start / End the whole workout day; editable afterward.
3. **Templates apply immediately** to the current cycle; switching back loses nothing.
4. **Bodyweight edit redesign** — replace the cramped inline Edit/Delete.

Added to honor #3's "no data lost": **in-progress set checks are saved as you go** (today they live only in memory until every main set is done, so navigating to Settings mid-workout — or the app closing — loses them).

## 2. Per-lift rounding
- `Lift` gains **optional** `roundingIncrement?: number`. Absent ⇒ use `profile.roundingIncrement` — existing lifts keep today's rounding exactly (no silent weight changes); the owner sets each lift in Settings.
- Domain (`src/domain/rounding.ts`, exported via `src/domain/index.ts`):
  - Move `ROUNDING_STEPS` here from `Settings.tsx`: `{ kg: [1.25, 2.5, 5], lb: [2.5, 5, 10] }`.
  - `defaultRoundingFor(category: LiftCategory, unit: Unit): number` — upper: kg 2.5 / lb 5; lower: kg 5 / lb 10.
  - `effectiveRounding(perLift: number | undefined, profileRounding: number): number` — `perLift ?? profileRounding`.
  - `convertRoundingStep(value: number, from: Unit, to: Unit, category: LiftCategory): number` — the same-index step in `ROUNDING_STEPS[to]` (1.25 kg ↔ 2.5 lb, 2.5 ↔ 5, 5 ↔ 10); a value not in `ROUNDING_STEPS[from]` falls back to `defaultRoundingFor(category, to)`.
- **Home** loads lifts (`liftRepo.all()`) with cycle/profile and passes each `LiftCard` `roundingIncrement = effectiveRounding(lift?.roundingIncrement, profile.roundingIncrement)`. `LiftCard` and `SupportingLifts` (BBB) already take this prop — no change inside them.
- **CycleEnd** progression uses each lift's effective rounding (it already loads lifts).
- **Onboarding** creates each lift with `roundingIncrement: defaultRoundingFor(category, units)`. Entered-TM rounding is unchanged (still the profile increment), so an entered TM is never re-rounded to a coarser step.
- **Settings → Rounding**: replace the single global stepper with **one stepper per lift** (same lift order as the Training maxes section), each showing the effective value (`2.5kg`) and stepping within `ROUNDING_STEPS[units]`; writes `liftRepo.update(key, { roundingIncrement })`. Caption: "Each lift's working sets round to the nearest step you can load."
- **convertUnits**: a lift *with* its own `roundingIncrement` gets `convertRoundingStep(old, from, to, category)`; a lift without one stays without (follows the profile, which `convertUnits` already sets). Nothing else in `convertUnits` changes.
- `profile.roundingIncrement` remains stored as the fallback. No change to `Lift.increment` (progression bump).

## 3. Workout day record (new table) + backup full-replace
- New Dexie store via **`version(6)`** — additive; existing stores unchanged:
  `workoutDays: '++id, [cycleId+week+liftKey], cycleId'`.
- `WorkoutDay { id?: number; cycleId: number; week: WeekNumber; liftKey: LiftKey; startedAt: string | null; endedAt: string | null; progress: Record<string, { done: boolean; actualReps: number | null }>; notes: string }` (ISO timestamps).
- `workoutDayRepo` (upserts create the row with `startedAt/endedAt: null, progress: {}, notes: ''`):
  - `get(cycleId, week, liftKey)`, `forCycle(cycleId)`, `all()`
  - `setTimes(cycleId, week, liftKey, { startedAt, endedAt })`
  - `saveProgress(cycleId, week, liftKey, progress, notes)`
  - `clearProgress(cycleId, week, liftKey)` — empties `progress` + `notes`, keeps times.
- **Backup:** export is already generic (includes `workoutDays`). **Import becomes a true full replace** — clear *every* table, then restore the tables present in the file, in the same single rw transaction. (Otherwise restoring an older backup without `workoutDays` would leave current timers/drafts attached to restored cycles with the same ids.)
- `convertUnits` unaffected (a `WorkoutDay` holds reps and times, no weights).

## 4. Workout timer
- New `src/ui/components/WorkoutTimer.tsx`, rendered near the top of each `LiftCard` (under the header), props `{ cycleId, week, liftKey }`; loads its own `WorkoutDay`.
- States:
  - **Not started:** full-width "Start workout" button.
  - **Running:** "Workout · 12:34" ticking every second from `startedAt` (survives reload — it's stored) + "End workout" + a secondary **"Forgot to end it?"** action.
  - **Left running (forgotten):** once the timer has run for **more than 3 hours**, the running display is replaced by an emphasized prompt — "Still running since 18:04 — forgot to end it?" (the start time in the device's own time format) — with **"Set finish time"** (primary) and "End now".
  - **Ended:** "Workout · 52 min" + "Edit".
- **Set finish time** (from "Forgot to end it?" or the forgotten prompt): an inline "When did you finish?" `<input type="time">` + Save / Cancel. Prefilled with a best guess: when this lift's session auto-saved (if it has, and that's after the start), otherwise one hour after the start — never later than now. Same date rule as Edit (on `startedAt`'s date; if ≤ start, the next day). Must land after the start and not in the future, else an inline error ("Pick a time between your start and now."). Save → `setTimes({ startedAt, endedAt })`. `WorkoutTimer` takes an optional `sessionSavedAt?: string` prop (the lift's saved session `date`) for the guess.
- **Edit** (inline, below): Start and End `<input type="time">` prefilled from the stored times; Save / Cancel / "Reset timer" (clears both). The date is `startedAt`'s local date (today if none). If End ≤ Start, End is the next day. Save → `setTimes`.
- Works whether or not the lift's session has auto-saved (supporting lifts come after the main sets).
- Duration format: under an hour "52 min"; otherwise "1 h 5 min".
- **History:** each Cycle-log entry appends " · 52 min" when its `WorkoutDay` has both times. `CycleLogEntry` gains `cycleId: number` (additive) for the match; History loads `workoutDayRepo.all()`.

## 5. Templates apply immediately — nothing lost
- **Settings → Templates:** changing Base/BBB/FSL or 5s PRO also writes it onto the **active cycle** (new `cycleRepo.setTemplate(cycleId, template, fivesPro)`), so the current cycle uses it right away. The Warm-up toggle already applies live (unchanged). CycleEnd's snapshot into the next cycle is unchanged. New caption under the selector: "Changes apply to your current cycle right away."
- **LiftCard:** add `cycle.template` and `cycle.fivesPro` to `workoutKey` so the set list rebuilds on a template change.
- **Saved sessions are never touched** — they render from their own saved sets (LiftCard.tsx ~415), so a template switch can't alter a completed workout.
- **In-progress draft:** `LiftCard` saves each unsaved row's `{ done, actualReps }` and the note text to the `WorkoutDay` (`saveProgress`) whenever they change, and restores them by row key whenever the set list is (re)built — mount, template / warm-up / TM / rounding change. When the session auto-saves (all main sets done) → `clearProgress` (times kept).
- Row key — pure domain helper `workoutRowKey(kind: SetKind, kindIndex: number, template: TemplateKey): string`: `"<kind>:<kindIndex>"` for warm-up and main; `"<template>:supplemental:<kindIndex>"` for supplemental — BBB and FSL back-off progress never bleed into each other, and switching back restores each.

## 6. Bodyweight edit redesign (`BodyweightCard.tsx`)
- Each entry row becomes **one full-width button**: date (left, muted), `84.0 kg ›` (right), `aria-expanded`. Tapping opens an **editor panel directly below** that row; one open at a time; tapping the row again or Cancel closes it.
- Editor: the date; a large weight input (`type=text inputMode=decimal`, comma-normalized, prefilled, select-all on focus) + unit; "Delete entry" (left, subtle) → inline confirm "Delete this entry?" Cancel / Delete; "Cancel" and "Save" (right; Save disabled unless the value is > 0). Save → `bodyweightRepo.update` → reload; Delete → `remove` → reload.
- Removes the per-row Edit/Delete text buttons. The chart and "Log today" are unchanged.

## 7. Testing
- Domain: `defaultRoundingFor`, `effectiveRounding`, `convertRoundingStep` (index mapping + fallback), `workoutRowKey`.
- Per-lift rounding: Home passes each card its lift's effective rounding (e.g. squat 5 → 5-rounded sets, bench falls back to profile 2.5); CycleEnd uses per-lift rounding; onboarding sets category defaults; Settings per-lift stepper persists; `convertUnits` maps per-lift rounding (and leaves absent ones absent).
- `workoutDayRepo` upserts / `clearProgress` keeps times; Dexie v6 opens with existing data; backup round-trip includes `workoutDays`; importing a backup *without* `workoutDays` clears it.
- WorkoutTimer: Start → running; End → duration; Edit times → saved (incl. past-midnight); Reset clears. "Forgot to end it?" → set a finish time → ended with that duration; prefill = session-saved time when available, else start + 1 h, capped at now; a future or before-start finish is rejected with the inline error; a timer running > 3 h shows the forgotten prompt (a 40-min workout that crosses midnight does not). History shows duration on a matching entry.
- Templates: switching template in Settings updates the active cycle; LiftCard rebuilds sets; a saved session still renders its saved sets; draft restore — check a main set, rebuild (remount) → still checked; BBB supplemental progress survives BBB→FSL→BBB; draft cleared on session save.
- Bodyweight: tapping a row opens the editor below; Save updates; Delete requires confirm; only one editor open.
- All prior tests green (baseline 262); `tsc -b` clean; suite 2×.

## 8. Non-goals
- No change to progression increments (`Lift.increment`), 5/3/1 percentages, or TM entry precision.
- No timer notifications/alarms; no multi-day workouts; no duration charts.
- No cloud/sync.
