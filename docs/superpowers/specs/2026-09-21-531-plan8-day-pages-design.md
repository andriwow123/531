# 5/3/1 App — Plan 8: Day-Pages, Supporting-Lift Logging & Clearer Nav — Design Spec

- **Date:** 2026-09-21
- **Status:** Approved (owner reviewed the Plan 7 build on LAN, approved this refinement design in chat)
- **Builds on:** Plan 7 (cycle-overview), on branch `plan7-cycle-overview` (HEAD 7caf199) — NOT yet merged; Plan 8 lands on the same branch and merges together.
- **Reference:** the live Plan 7 screens (`scratchpad/p7-*.png`).

## 1. Purpose
Refine the cycle-overview from owner feedback: show **one lift per swipeable day-page** (instead of a long stack of 4 cards), let supporting lifts be **logged with weight × reps** and remembered **per lift**, and make **History/Settings** reachable from a visible **top bar**. No change to the 5/3/1 math, main-lift logging, progression, or end-of-cycle flow.

## 2. Confirmed decisions (from owner)
- **Supporting-lift logging = weight × reps** per exercise (no set count).
- **Exercise list stays shared** across lifts (add-custom / remove still affect all lifts); only the **checkmarks and logged weight/reps are per-lift, per-day**.
- Each lift (day) is its **own swipeable page**; week tabs stay pinned on top.
- Settings + History move into a **top bar** (a history icon + a ⚙ settings cog).

## 3. Swipeable day-pages (Home rework)
`Home` keeps all current behavior — active-cycle/profile/session load, `WeekTabs`, per-week protocol line, the shared rest timer, cycle-end routing (all 4 week-4 sessions → `/cycle-end`), and the P7-R5 session pass-through into each `LiftCard`. Only the arrangement of the 4 cards changes.
- **Pager:** the 4 `LiftCard`s render inside a horizontal **CSS scroll-snap** strip (`overflow-x-auto snap-x snap-mandatory`, each card wrapped in a `w-full flex-none snap-center` page). Native left/right swipe on the phone moves between days; order is fixed press→bench→squat→deadlift. All 4 pages stay mounted (so each card keeps its own state); the strip's height follows the tallest page (fine — cards are similar height until a panel is expanded).
- **DayStrip:** a control between the week tabs and the pager — four buttons labelled Press · Bench · Squat · Deadlift. The active day uses accent styling; a lift already logged for the selected week shows a small ✓. Tapping a button smooth-scrolls the pager to that lift (`scrollIntoView({ inline: 'center' })`). Swiping the pager updates the active day (an `IntersectionObserver`, or a scroll handler, marks the centered page active). State: `activeDay` index 0–3.
- **Default day:** `activeDay` defaults to the index (in `LIFT_ORDER`) of `nextUp(logged).liftKey` on load, so the app opens on the lift you'd do next. Changing the week keeps the same active day.
- COACH orange theme, mobile-first, reachable at `/` (the Today tab).

## 4. Supporting lifts — per-lift logging with weight × reps
### Data (no Dexie version bump — additive non-indexed fields, same style as `CustomExercise.scheme`)
- Extend the `SupportingDone` record (`supportingDone` store, still `'++id, date'`) with: `liftKey: LiftKey`, `weight: number | null`, `reps: number | null`. A record's existence for `(date, liftKey, category, name)` = **done**; `weight`/`reps` are its optional log.
- `supportingDoneRepo`:
  - `forDate(date)` — unchanged (returns all rows that day; the component filters by `liftKey`).
  - `toggle(date, liftKey, category, name)` — delete the matching `(date, liftKey, category, name)` row if present, else add `{ date, liftKey, category, name, weight: null, reps: null }`.
  - **NEW** `log(date, liftKey, category, name, patch: { weight?: number | null; reps?: number | null })` — upsert: update the matching row's `weight`/`reps`, or create it (which also marks it done) if none exists.
- `hiddenSupporting` and `customExercises` repos are **UNCHANGED** (the list stays shared/global). Pre-existing done rows without `liftKey` simply stop matching per-lift queries (day-scoped ephemeral checks; no migration, no data loss).
### UI (`SupportingLifts`, already receives `liftKey`, `tm`, `unit`, `roundingIncrement`)
- On expand, load `forDate(today)` filtered to this `liftKey` → a `(category|name) → { done, weight, reps }` map for prefill.
- Each exercise row: **checkbox** (done) · name · suggested scheme · a compact **weight** input and **reps** input · remove **×** (removal still global, unchanged).
  - Checkbox toggles done (`toggle`). Editing weight or reps calls `log(...)` (which upserts and thereby marks the row done). Inputs prefill from the loaded map.
- **BBB row:** checkbox + prefilled **weight** (`round(TM×0.5)`, editable) + **reps** (prefill 10) inputs, logged per-lift under `(categories[0], 'Boring But Big')` — so Press's BBB is independent of Bench's (fixes the Plan 7 shared-BBB minor).
- Done/log state is scoped by `liftKey`, so ticks/weights under one lift never appear under another.

## 5. Navigation — top bar
- `Home` gains a **top bar**: left = title (`5/3/1`) + `Cycle N` badge; right = a **History** icon button (→ `/history`) and a **⚙ Settings** cog (→ `/settings`). Inline SVG icons, no new dependency. The faint bottom text nav (Today/History/Settings) is removed from Home (nav now lives up top).
- `History` and `Settings` screens get a matching compact top-right: a **Today/home** icon (→ `/`) plus the other section's icon, for consistent, visible navigation. Their existing content/bottom nav is otherwise untouched (bottom nav may be dropped once the top bar covers it).
- Icons: History = bar-chart; Settings = gear/cog; Today = home. Each is a real `<button>`/`<Link>` with an `aria-label`.

## 6. Testing
- `supportingDoneRepo`: `toggle` per-lift add/delete round-trip; `log` upsert of weight/reps; `forDate` returns rows for filtering; press vs bench independence (same date/category/name, different liftKey → separate rows). Dexie still opens at the existing version; v1–v5 untouched.
- `SupportingLifts`: renders weight/reps inputs; entering them persists via `log` and marks done; checkbox toggles; state is per-`liftKey`; BBB logs per-lift. Render within `SettingsProvider` where needed; await loaded state.
- `Home`: renders all 4 lift cards in the pager; `DayStrip` switches the active day (assert the tapped lift's card is active/scrolled); week tabs still switch weeks; the top-bar History/Settings controls link to `/history` and `/settings`; cycle-end routing preserved. Update Plan 7 Home tests for the new layout (still `getAllByRole`-based).
- All prior tests kept green; `npx tsc -b` clean; suite run 2–3× for the async-settings race.

## 7. Non-goals
- No supporting-lift **History** view yet (weight/reps are stored; surfacing them is later).
- No set-count logging (weight × reps only, per owner).
- No change to main-lift logging, progression, cycle-end, or the Dexie schema versions.
- No swipe library — native CSS scroll-snap only.
