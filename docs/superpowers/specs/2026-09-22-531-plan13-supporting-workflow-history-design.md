# 5/3/1 App — Plan 13: Supporting-Lift Workflow + History — Design Spec

- **Date:** 2026-09-22
- **Status:** Approved shape (owner confirmed the two-plan split + this feature set; interaction confirmed via chat)
- **Builds on:** Plans 1–12, all merged to `main` (HEAD 8ae2090). Work on branch `plan13-supporting-workflow-history` off `main`; merges back (auto-deploys via GitHub Pages).
- **Sibling plan (later):** Plan 14 — per-lift rounding, workout timer, templates-apply-immediately, bodyweight-edit redesign. Out of scope here.

## 1. Purpose
Rework the supporting-lift ("Supporting lifts") experience so it is fast to use mid-workout, remembers what you did, and shows progress:
1. **Today's supporting work section** — you pick exercises from the catalog and they rise into a focused "Today" list (with weight×reps + a done checkmark), so you never scroll the whole catalog between sets.
2. **Pre-fill from last time** — when an exercise enters Today, its inputs pre-fill with the most recent weight & reps you logged for it.
3. **Supporting-lift history** — the History screen shows each supporting exercise's logged weight×reps over time.
4. **"Scheme" → plain language** — the add-exercise field is relabeled "Sets × reps (optional)".

Owner-confirmed interactions (chat): checkmark = **done**; picking from the catalog = **add to Today** (not "done"); suggestion = **pre-fill last weight & reps**.

## 2. Data model (`SupportingDone`, `supportingDoneRepo`) — no Dexie version bump
Today a `SupportingDone` row conflates two ideas (a row exists if the item was toggled-on *or* logged, and the checkbox is "a row exists"). Plan 13 separates **selected-for-today** from **done**.

- **Add one field:** `SupportingDone.done: boolean`.
  - A row now means **"on today's list for this lift+date"** (selected). `done` means **"completed"** (the checkmark).
  - Adding a field needs **no Dexie version bump** (schema/index unchanged; store stays `supportingDone: '++id, date'`, still `version(5)`).
  - **Legacy rows** (written before this field): treat a missing `done` as `true` on read (they represent completed/logged work). New code always writes `done` explicitly. (Optional one-time backfill is unnecessary given the read-time coercion; do NOT bump the Dexie version for it.)
- **`supportingDoneRepo` new/changed methods** (keep `forDate`, `log` as-is; replace the existence-as-done `toggle`):
  - `select(date, liftKey, category, name, seed?: { weight: number | null; reps: number | null }): Promise<void>` — if no row exists for (date, liftKey, category, name), add `{ date, liftKey, category, name, weight: seed?.weight ?? null, reps: seed?.reps ?? null, done: false }`. If a row already exists, no-op (idempotent).
  - `setDone(date, liftKey, category, name, done: boolean): Promise<void>` — set `done` on the existing row (creates the row `done:false→done` only if it somehow doesn't exist, mirroring `log`'s upsert; normally the row exists because it's in Today).
  - `deselect(date, liftKey, category, name): Promise<void>` — delete the row (remove from Today; discards its unsaved-for-history log for today, which is the intended "I'm not doing this today" action).
  - `log(...)` — unchanged (upsert weight/reps on the existing/absent row; when it must create, set `done: false`).
  - `forDate(date)` — unchanged (returns rows incl. the new `done`).
  - `lastLogged(category, name, beforeDate: string): Promise<{ weight: number | null; reps: number | null } | null>` — the most recent row (by `date`, strictly `< beforeDate`) matching `category`+`name` with a **non-null weight OR non-null reps**; returns its `{ weight, reps }`, else `null`. Exercise identity for suggestions/history is **category + name** (across all lift days), per "next time that same exercise is performed".
  - `allLogged(): Promise<SupportingDone[]>` — all rows with a non-null weight or reps (feeds History). (`db.supportingDone.toArray()` filtered.)
- `read-time coercion` helper: wherever rows are read for UI logic, treat `d.done ?? true`.

## 3. `SupportingLifts.tsx` redesign (per-lift-card panel)
The panel still lives inside each `LiftCard` (per lift-day) and is keyed by `liftKey` + today's date. When expanded it has **two zones**:

### 3a. Today's supporting work (top)
- **Boring But Big** stays **pinned at the top** of Today (it's main work; unchanged 5×10 @ 50% TM behavior, weight×reps inputs, its own done checkmark).
- Then every **selected** exercise (rows with a row for today, i.e. `forDate(today)` filtered to this `liftKey`), each showing:
  - a **done checkmark** (`done` flag; `setDone`),
  - the exercise name + its scheme line,
  - **weight×reps inputs** (same comma-normalized `type=text inputMode=decimal` weight + numeric reps as today; commit-on-blur via `log`),
  - a **"remove from today"** control (small ✕ / "remove") → `deselect` (distinct from catalog hide/delete).
- Empty state when nothing selected: a short muted line ("Pick exercises below to build today's list.").

### 3b. Add exercises (below, the catalog)
- The Push/Pull/Core (per `categoriesForLift`) catalog + customs, EXCLUDING exercises already in Today (selected ones move up, so the catalog shows only not-yet-picked items).
- Each catalog row: name + scheme + a **"+ Add"** affordance (tap the row/button) → `select(today, liftKey, category, name, seed)` where `seed = await lastLogged(category, name, today)` (pre-fill). Then it appears in Today.
- Keep the existing **hide built-in / delete custom** control (the trash) here — this removes the exercise from the **catalog** entirely (hide via `hiddenSupportingRepo`, delete via `customExerciseRepo`), separate from "remove from today".
- Keep **"+ Add exercise"** (custom) per category.

### 3c. Interaction notes
- Picking an exercise pre-fills its Today inputs from `lastLogged`; the value is stored on `select` (seed) so it survives reload, and the user edits/commits as usual.
- The checkmark in Today toggles `done` (visual completed state) without removing the row (fixes the old "checking hid my set" conflation).
- Local-input-vs-DB discipline from the current component (the `committedRef`/`seededRef` no-clobber pattern) is preserved for the Today inputs.

## 4. Supporting-lift history (History screen)
- New section on the History screen (`/history`), gated on `settings.assistanceTracking` (same gate that shows the panel), placed after the per-lift progress cards / near the Cycle log.
- A small aggregation (new `src/domain/supportingHistory.ts`, pure + unit-tested): from `supportingDoneRepo.allLogged()`, group by **category + name**; for each exercise produce `{ category, name, entries: { date, weight, reps }[] }` sorted most-recent-first, entries limited to a readable recent window (e.g. last ~8).
- New component `src/ui/components/SupportingHistory.tsx`: for each exercise, the name + a compact list/row of recent `date — weight × reps` (theme tokens, tabular-nums, mobile-first). No chart required (keep it tight; a chart is a possible later polish). Empty state when nothing logged.

## 5. "Scheme" relabel (`SupportingLifts.tsx` add form)
- The add-exercise field label + `aria-label` change from **"Scheme (optional)"** to **"Sets × reps (optional)"**, with a placeholder hint like `e.g. 3 × 8–12`. The stored `CustomExercise.scheme` field name is unchanged (data untouched); the per-item scheme display line is unchanged.

## 6. Testing
- `supportingDoneRepo`: `select` idempotent + seeds weight/reps + `done:false`; `setDone` flips done; `deselect` removes; `log` upsert still works; `lastLogged` returns the most-recent prior non-null entry by category+name (and `null` when none); legacy row (no `done`) reads as done.
- `SupportingLifts`: picking a catalog exercise moves it into Today and pre-fills from a prior logged entry; the catalog no longer lists a selected exercise; the Today checkmark toggles done without removing the row; "remove from today" deselects; BBB stays pinned; hide/delete still prunes the catalog. Render within `SettingsProvider`, await `loaded`; fake-indexeddb.
- `supportingHistory` aggregation: groups by category+name, most-recent-first, respects the recent-window cap.
- `SupportingHistory` component: renders logged exercises with their recent weight×reps; empty state.
- Relabel: the add form shows "Sets × reps (optional)".
- All prior tests stay green (baseline 250); `tsc -b` clean; suite 2×.

## 7. Non-goals
- Per-lift rounding, workout timer, templates-apply-immediately, bodyweight-edit redesign → **Plan 14**.
- No Dexie schema/version bump; no change to 5/3/1 progression math or the main-set generation.
- No cloud/sync. Supporting history is a list (chart deferred). Cross-day "same exercise" identity is category+name (a custom exercise renamed becomes a new identity — acceptable).
