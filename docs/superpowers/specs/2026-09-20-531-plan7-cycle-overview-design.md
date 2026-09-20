# 5/3/1 App — Plan 7: Cycle-Overview Redesign — Design Spec

- **Date:** 2026-09-20
- **Status:** Approved (owner supplied reference images; forks confirmed in chat)
- **Builds on:** Plans 1–6 (merged + pushed, HEAD da82818).
- **Reference:** `Images reference/IMG_0228.png`, `IMG_0229.png` (a prior artifact layout the owner likes).

## 1. Purpose
Replace the one-lift-at-a-time workout screen with an **interactive cycle overview** matching the reference layout (week tabs → all lifts as cards with full set tables → expandable supporting lifts), in the existing **orange** theme, preserving all logging/progression/data.

## 2. Confirmed decisions
- **Replace** the current Home (pick-your-workout selector + dropdown assistance) with the cycle-overview; it is the interactive workout screen (log inline).
- Supporting lifts: a **checklist of ideas** (not a dropdown); the owner can **add custom** exercises AND **remove any** item — built-in or custom — with removals persisted.
- Keep: History (charts, PRs, cycle log, bodyweight), Settings, exercise demos, progression, PWA. Orange theme (AMRAP highlight is orange, not the reference's red).

## 3. Layout (new Home)
- **Title row:** "5/3/1 · Wendler strength cycle" + a `Cycle N` badge.
- **Week tabs:** Week 1 · 5s / Week 2 · 3s / Week 3 · 5/3/1 / Deload · easy — segmented, defaulting to the current cycle week; a one-line protocol description for the selected week.
- **One card per lift** (all 4, fixed order press→bench→squat→deadlift), each:
  - Header: lift name · `Day N` · `training max NN`.
  - **Set table** for the selected week (warm-ups + work sets from `buildWorkout`): each row = `warm-up/work` + `%`, big weight + unit, `×reps`, and the **per-side plate breakdown** (`computePlates`; "empty bar" when no plates). The top work set (AMRAP weeks) shows `×N+` and is **highlighted orange** with "as many reps as possible".
  - **Inline logging:** tap work sets to mark done; enter reps on the AMRAP set. When the lift's work sets are marked done it saves that lift's `Session` (same shape as today) → the existing progression/cycle-end flow is unchanged. A lift already logged for the current week shows a done state.
  - Expandable **"How to perform"** demo (existing `ExerciseDemo`) on the card, when `exerciseDemos`.
  - Expandable **"Supporting lifts"** (see §4).
- Deload week: work sets 40/50/60 with no AMRAP (no orange highlight), no supporting lifts needed (still available).
- COACH orange theme tokens, Manrope, mobile-first. Reachable via the existing "Today" bottom-nav tab.

## 4. Supporting lifts (per lift, expandable)
- A **"Boring But Big"** row: "same lift, for size — 5 × 10 @ <round(TM×0.5)> <unit>", with a checkbox.
- Suggested exercises grouped by the lift's relevant **categories** (`categoriesForLift`: upper = push/pull/core; lower = legs/pull/core), each item = name + a rep-scheme (e.g. "3 × 8–12") + a checkbox.
- **"＋ Add exercise"** (per category): a name + optional scheme input → persisted as a custom exercise; appears in that category.
- **Remove** control on every item: removing a built-in hides it (persisted); removing a custom deletes it. Both persist across sessions.
- A **checkbox** marks a supporting lift done **for the current day** (persisted), so checks survive reload that day.

## 5. Data (Dexie v5, additive)
- Keep v1–v4 untouched. Add `this.version(5).stores({ supportingDone: '++id, date', hiddenSupporting: '++id, category' });`.
- **Built-in catalog** (`src/domain/supportingCatalog.ts`): `AssistanceCategory` reused; `SUPPORTING_CATALOG: Record<AssistanceCategory, { name: string; scheme: string }[]>`; `categoriesForLift(liftKey): AssistanceCategory[]`; `bbbFor(tm, unit): { text: string }` (5×10 @ 50% TM). Pure `supportingList(category, customs, hidden)` = catalog minus hidden names + this category's customs (each `{ name, scheme, custom }`).
- **Custom exercises:** reuse the v4 `customExercises` store; extend `CustomExercise` with an optional `scheme?: string` (no migration — Dexie stores arbitrary object fields). Add `customExerciseRepo.remove(id)`.
- **Hidden built-ins:** `hiddenSupportingRepo { add(category, name), all(), remove(id) }` over `hiddenSupporting` (`{ id?, category, name }`).
- **Done markers:** `supportingDoneRepo { toggle(date, category, name), forDate(date) }` over `supportingDone` (`{ id?, date, category, name }`).
- Sessions/TM/cycles/settings/etc. unchanged.

## 6. Settings impact
- The old **assistance dropdown** (Plan 6 `AssistanceSection`) and the **pick-your-workout selector** are removed; the `assistanceTracking` toggle now shows/hides the **Supporting lifts** sections. Display-mode toggles that still apply (notes, warm-ups, rest timer, exercise demos) keep working; **plate breakdown is always shown** in the new table (its display toggle is retired/ignored). Rest timer stays as a compact control; a per-lift note stays available (collapsed). Bodyweight/History/theme/rounding/templates untouched.

## 7. Testing
- Pure: `supportingList` (catalog − hidden + customs), `categoriesForLift`, `bbbFor`. Repos round-trips (v5 additive — v1–v4 untouched; custom remove; hidden add/remove; done toggle/forDate). 
- Components: LiftCard renders the set table + plates + AMRAP highlight, and logging a lift saves a Session; SupportingLifts renders BBB + categorized ideas, add-custom persists + appears, remove (built-in → hidden; custom → deleted) persists, checkbox toggles + persists. Week tabs switch the shown week. New Home shows all 4 lift cards for the current week, replaces the old selector, and preserves cycle-end routing when week-4 is complete.
- Render within `SettingsProvider`, awaiting loaded state (async-settings race). All prior 138 tests updated/kept green where still valid; `tsc -b` clean.

## 8. Non-goals
- No new History views for supporting lifts; no supporting-lift weight logging (just done-markers + BBB weight display); no demo images for supporting lifts; the old AssistanceEntry (Plan 6 numeric log) is superseded by the done-marker model (the `assistance` store may remain unused/removed later — do not migrate).
