# 5/3/1 App — Plan 2: History & Progress — Design Spec

- **Date:** 2026-09-19
- **Status:** Approved (design confirmed in chat, incl. metric toggle)
- **Builds on:** Plan 1 (merged to `main`, commit 56cee11). Spec: `2026-09-19-531-app-design.md` §9, §13.
- **Owner context:** non-developer / vibecoding — Claude does the engineering.

## 1. Purpose

A **History** tab that shows the user's strength progress over time, so training feels rewarding and the AMRAP work has a visible payoff. It reads the sessions already saved by the workout screen; it adds no new logging.

## 2. Scope

- Replaces the `History` stub route (`/history`), reachable from the existing bottom nav (Today / History / Settings).
- Three parts: per-lift progress cards, a cycle log, and PR highlights, plus an empty state.
- **Non-goals (later plans):** editing/deleting past workouts, date/lift filtering, data export (Plan 3), the Settings screen.

## 3. Screens & components

### 3.1 Per-lift progress card (one per lift: press, bench, squat, deadlift)
- A **line chart** with a **toggle** choosing the headline series: **Estimated 1RM** or **Training Max**.
  - **Estimated 1RM** series: one point per AMRAP top set (Epley from the logged weight × reps), ordered by date — the user's real performance trend.
  - **Training Max** series: the TM in effect per cycle (from each cycle's `tm` snapshot) — a clean stepped line of what the program prescribed.
  - Whichever is the headline is drawn prominent; the other is drawn as a faint reference line on the same axis.
- The lift's current **PR** (best estimated 1RM to date) shown with its date.
- The toggle is a per-viewer UI preference (component state; may persist in `localStorage`), NOT a training setting.

### 3.2 Cycle log
- Reverse-chronological list of logged workouts, grouped by cycle (newest first). Each entry: date, lift, week label, and the top set (e.g. `102.5 kg × 5`, est 1RM 120). Deload-week entries show no AMRAP.

### 3.3 PR highlights
- A workout whose AMRAP top set set a new best estimated 1RM for that lift is marked with a PR badge (in the card and/or the log).

### 3.4 Empty / sparse state
- With no logged AMRAP sets yet: a friendly prompt ("Log a few workouts and your progress shows up here"). Charts appear once there is ≥1 data point; a single point renders as a dot with its value.

## 4. Data & aggregation (pure, tested)

New pure functions (domain layer, unit-tested), fed by the repositories:
- `estimatedOneRmSeries(sessions, liftKey) → { date, weight, reps, est1RM }[]` — from sessions of that lift that have an AMRAP result (`amrapReps != null`), ordered by date. Uses existing `estimate1RM`.
- `trainingMaxSeries(cycles, liftKey) → { cycleIndex, startedAt, tm }[]` — from each cycle's `tm[liftKey]` snapshot, ordered by cycle index.
- `personalRecord(sessions, liftKey) → { est1RM, date } | null` — max estimated 1RM and when.
- `cycleLog(sessions, cycles) → CycleLogGroup[]` — sessions grouped by cycle, newest first, with a computed top-set summary per entry.

**Repository additions (small):**
- `sessionRepo.all(): Promise<Session[]>` — all sessions (for cross-cycle history).
- `cycleRepo.all(): Promise<Cycle[]>` — all cycles (for the TM series).
Both are thin Dexie `toArray()` reads behind the existing repository interfaces; no schema/version change.

## 5. Design / visuals

- Charts via **Recharts** (already a dependency), authored per the `dataviz` skill: one consistent scale, labeled ticks, an emphasized endpoint, area/line styled from the COACH theme tokens (`--accent`, `--muted`, `--line`, `--surface`), legible in light and dark, mobile-first (~400px, no horizontal page scroll).
- Reuses the COACH visual system (rounded cards, Manrope, warm orange). The toggle is a small segmented control in the card header.
- Honors the display settings: the `charts` and `amrapPrBadges` display elements gate the chart and the PR badges respectively (consistent with "everything configurable, defaults sensible"; there is still no Settings screen in this plan, so defaults apply).

## 6. Testing

- TDD on the aggregation functions (series ordering, Epley values, PR selection, empty inputs, cycle grouping).
- Component smoke/integration tests for the History screen: renders per-lift cards, toggles metric, shows the cycle log, and shows the empty state with no data.
- All existing tests stay green.

## 7. Assumptions

- History grows as the user trains; a fresh user sees the empty state. Example/seeded data is used in tests, not shown to the user as real.
- Estimated-1RM PR is defined as the max Epley estimate across the lift's AMRAP sets.
