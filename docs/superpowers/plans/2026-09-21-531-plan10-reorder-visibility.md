# Plan 10 — Day Reorder, Persistent Sets & Polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Reorderable lifts/days (drag on the main screen + Settings, persisted), completed sets that stay visible, and three UI fixes (clear Home button, centered weights, select-on-focus TM inputs) — on the `plan7-cycle-overview` branch.

**Architecture:** React 19 + TS strict + Vite + Tailwind v3 + Dexie + Vitest. Additive; no Dexie version bump. Reorder is a persisted `settings.liftOrder` applied to DISPLAY only (no progression/math change). Self-contained pointer-based drag (no heavy DnD dep).

**Spec:** `docs/superpowers/specs/2026-09-21-531-plan10-reorder-visibility-design.md`

## Global Constraints
- TS strict + `verbatimModuleSyntax`: type-only imports use `import type`. `noUnusedLocals`/`noUnusedParameters` on.
- COACH theme tokens only; no hardcoded hex. Mobile-first; keep `max-w-md` column.
- UI tests render within `SettingsProvider`, await loaded; fake-indexeddb globally set up.
- `npx tsc -b` clean + full suite green (2–3×) before each commit. Baseline: 174 tests.
- Do NOT change 5/3/1 math, progression, cycle-end, Session shape, or Dexie versions. Reorder = display order only.

---

### Task 1: Persisted lift order + apply to Home display

**Files:** `src/settings/schema.ts` (add field), `src/domain/` (a helper + export), `src/ui/screens/Home.tsx`; tests alongside.

**Interfaces / behavior:**
- `SettingsState` gains `liftOrder: LiftKey[]`; `defaultSettings.liftOrder = ['press','bench','squat','deadlift']`.
- Pure helper (e.g. `src/domain/liftOrder.ts`, exported from domain index): `orderedLifts(liftOrder: LiftKey[] | undefined): LiftKey[]` → returns the 4 lifts each exactly once in the given order, sanitizing: drop unknowns/dupes, append any missing in `LIFT_ORDER` order, fall back to `LIFT_ORDER` when input is missing/empty (tolerates old saved settings without the field). Also `moveItem<T>(arr: T[], from: number, to: number): T[]` pure helper (returns a new array with the element moved), for the reorder UIs in Tasks 2–3.
- `Home`: replace uses of `LIFT_ORDER` for DISPLAY with `const order = orderedLifts(settings.liftOrder)`: the pager maps over `order`, `DayStrip` gets `order`, `dayNumber = index+1` within `order`, and the default `activeDay` = `Math.max(0, order.indexOf(nextUp(logged).liftKey))`. `doneKeys`, cycle-end routing, session pass-through, `handleLogged`/`handleTmChange` unchanged. (Do NOT change `nextUp` or progression.)

- [ ] Step 1: failing tests — `orderedLifts` sanitizes (dupes/unknown/missing → valid 4-perm; empty/undefined → default). `moveItem` moves correctly. Home renders cards/DayStrip in a custom `liftOrder` (seed settings with a reordered list; assert card/day order and `Day N`).
- [ ] Step 2: run → FAIL.
- [ ] Step 3: implement. Run → PASS.
- [ ] Step 4: `tsc -b` clean; suite green.
- [ ] Step 5: commit — `git commit -am "feat(data): persisted lift order applied to the day pager"`

---

### Task 2: Settings "Workout day order" — drag reorder

**Files:** `src/ui/screens/Settings.tsx` (new section), maybe `src/ui/components/SortableList.tsx` (new, reusable); tests.

**Behavior:** A new `<Section title="Workout day order">` (near Training maxes): a vertical list of the 4 lifts in `settings.liftOrder`, each row a drag-reorderable item with a visible grab handle. Implement a small **self-contained pointer-based sortable** (pointerdown on the handle → pointermove reorders using item positions / `moveItem` → pointerup persists) that works on touch and mouse; include an accessible **up/down** control per row as a keyboard/no-drag fallback. On any reorder, `updateSettings({ liftOrder: next })`. Use theme tokens; rows styled like other Settings rows. If you build `SortableList`, keep it generic (items + `onReorder(from,to)` + a render prop) so Task 3 can reuse it; otherwise keep the logic local and Task 3 mirrors it.

- [ ] Step 1: failing tests — the section renders the 4 lifts in order; using the up/down fallback (reliable in jsdom) reorders and persists `settings.liftOrder` (re-read settings / assert new order); the pure move is via `moveItem`. (Pointer-drag itself needs real layout — assert the reorder handler/state, not pixel drags.)
- [ ] Step 2: run → FAIL.
- [ ] Step 3: implement. Run → PASS.
- [ ] Step 4: `tsc -b` clean; suite green.
- [ ] Step 5: commit — `git commit -am "feat(ui): reorder workout days in Settings"`

---

### Task 3: DayStrip drag-to-reorder (main screen)

**Files:** `src/ui/components/DayStrip.tsx`, `src/ui/screens/Home.tsx` (pass an `onReorder`), tests.

**Behavior:** The `DayStrip` chips become drag-reorderable: press-and-drag a chip to move it (pointer-based, a small distance threshold ≥ ~6px distinguishes a drag from a tap so a plain tap still calls `onSelect`); on drop, call a new prop `onReorder(from, to)`. Home's `onReorder` persists `updateSettings({ liftOrder: moveItem(order, from, to) })` and keeps `activeDay` pointing at the same lift (remap by liftKey). The chip drag must not trigger the pager's horizontal swipe (DayStrip is its own element; stop propagation as needed). Keep `aria-current`, the ✓ done badge, and tap-to-switch intact.

- [ ] Step 1: failing tests — `DayStrip` still switches day on tap (unchanged); calling its `onReorder` (or simulating the drop handler) reorders; Home wires `onReorder` to persist `liftOrder` and preserve the active lift. (Assert via the handler + state, not pixel dragging.)
- [ ] Step 2: run → FAIL.
- [ ] Step 3: implement. Run → PASS.
- [ ] Step 4: `tsc -b` clean; suite green.
- [ ] Step 5: commit — `git commit -am "feat(ui): drag-to-reorder days on the DayStrip"`

---

### Task 4: Completed sets stay visible in LiftCard

**Files:** `src/ui/components/LiftCard.tsx`, `src/ui/screens/Settings.tsx` (remove the hide-warmups toggle), tests.

**Behavior:**
- **Retire hide-on-done:** remove the `settings.hideCompletedWarmups` row-filtering from `LiftCard` (completed warm-ups stay visible with a checkmark). Remove the "Hide completed warm-ups" toggle from Settings (leave the `SettingsState` field defined-but-unused, or drop it — no migration/behavior elsewhere).
- **Logged lift keeps its sets visible:** when `existingSession != null`, render the session's logged sets as a **read-only checklist** (rebuild rows from `existingSession.sets`: each shows weight + per-side plates + a checkmark; the AMRAP set shows the logged reps), under a compact "✓ Logged this week" header (the est-1RM line may stay in that header). Do NOT collapse to the bare summary box. Reuse the existing row markup where practical; keep the weight-column layout consistent with the interactive rows.
- In-progress rows already stay visible on done (dimmed + ✓) — keep that, but ensure the dim isn't so strong the row/checkmark is unreadable.
- Auto-save/logging/progression/cycle-end unchanged — only the post-logged RENDERING changes.

- [ ] Step 1: failing tests — a lift with a done session renders its completed sets (weights + checkmarks) read-only and visible (not just a summary); completed warm-ups are NOT hidden (render a warm-up done and assert it's still present); Settings no longer shows the "Hide completed warm-ups" toggle. Keep logging/auto-save tests green.
- [ ] Step 2: run → FAIL.
- [ ] Step 3: implement. Run → PASS.
- [ ] Step 4: `tsc -b` clean; suite green.
- [ ] Step 5: commit — `git commit -am "feat(ui): keep completed sets visible; retire hide-completed-warmups"`

---

### Task 5: Polish — Home button, centered weights, TM select-on-focus

**Files:** `src/ui/components/NavIcons.tsx` (reuse `HomeIcon`), `src/ui/screens/{Home,History,Settings}.tsx`, `src/ui/components/LiftCard.tsx`, tests.

**Behavior:**
- **Home affordance (#1):** on all three screens, the top-left `<Link to="/" aria-label="Home">` renders a **home icon + `5/3/1`**, styled to read as a tappable button (subtle `bg-[var(--surface-2)]`/rounded/padding + hover), so it's obviously the way back. (`HomeIcon` already exists in NavIcons.)
- **Centered weights (#2):** in `LiftCard`, change the fixed-width weight number span from right-aligned to **center-aligned** (`text-center` + keep the fixed width + `tabular-nums`), with the unit immediately after the fixed-width block, for warm-up/work rows and the AMRAP hero — numbers look balanced and units still line up. Layout only.
- **TM select-on-focus (#3):** the `LiftCard` TM editor input and the Settings "Training maxes" inputs get `onFocus={(e) => e.currentTarget.select()}`; the card editor also autofocuses on open so the value is selected and typing overwrites.

- [ ] Step 1: failing/adjusted tests — top-left Home control still links to `/` and now contains the home icon; the weight number carries the centered fixed-width class; the TM inputs select on focus (assert `onFocus` selects, or that the input has the handler — a jsdom `.select()` spy or focus + selectionStart/End check).
- [ ] Step 2: run → FAIL.
- [ ] Step 3: implement. Run → PASS.
- [ ] Step 4: `tsc -b` clean; suite green.
- [ ] Step 5: commit — `git commit -am "feat(ui): clearer Home button, centered weights, select-on-focus TM inputs"`

---

## Self-Review
- **Spec coverage:** §2 liftOrder data+apply (T1) ✓; §3 reorder UIs (T2 settings, T3 daystrip) ✓; §4 completed-sets-visible + retire hide-warmups (T4) ✓; §5 polish trio (T5) ✓.
- **Placeholder scan:** none — concrete interfaces + behaviors + test intents.
- **Type consistency:** `orderedLifts`/`moveItem` (T1) reused by T2/T3/Home; `SettingsState.liftOrder` added T1, edited T2/T3; `DayStrip` gains `onReorder` (T3); `LiftCard` logged-render (T4). No `nextUp`/progression signature change.
- **Notes for executor:** No Dexie bump. Reorder = display only; do NOT touch progression/cycle-end. jsdom can't drag — test reorder via handlers/state + the up/down fallback, not pixels. Preserve all Plan 7/8/9 behavior (session pass-through, logging machinery, TM edit, nav, cycle-end). Owner reviews the look before merge — NO auto-merge.
