# Plan 9 — Polish + Editable Training Max — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Five owner refinements on the `plan7-cycle-overview` branch: editable training max (card + settings), fix lift-card weight alignment, tighten + confirm-guard supporting-lift deletion, and a persistent top-left Home anchor.

**Architecture:** React 19 + TS strict + Vite + Tailwind v3 + Dexie + Vitest. Additive; no Dexie version bump.

**Spec:** `docs/superpowers/specs/2026-09-21-531-plan9-polish-tm-edit-design.md`

## Global Constraints
- TS strict + `verbatimModuleSyntax`: type-only imports use `import type`. `noUnusedLocals`/`noUnusedParameters` on.
- COACH theme tokens only; no hardcoded hex. Mobile-first; keep `max-w-md` column.
- UI tests render within `SettingsProvider`, await loaded state; fake-indexeddb globally set up.
- `npx tsc -b` clean + full suite green (2–3×) before each commit. Baseline: 163 tests.
- Do NOT change the 5/3/1 math, progression, cycle-end, main-lift Session shape, or Dexie versions.

---

### Task 1: Editable training max on the lift card + weight-column alignment

**Files:** Modify `src/data/repositories.ts` (`cycleRepo`), `src/ui/components/LiftCard.tsx`, `src/ui/screens/Home.tsx` (+ tests `repositories.test.ts`, `LiftCard.test.tsx`).

**Interfaces / behavior:**
- `cycleRepo.updateTrainingMax(cycleId: number, liftKey: LiftKey, tm: number): Promise<void>` — read-modify-write: `const c = await db.cycles.get(cycleId); if (!c) return; await db.cycles.update(cycleId, { tm: { ...c.tm, [liftKey]: tm } });`
- `LiftCard`: add optional prop `onTmChange?: () => void`. The header "training max NN {unit}" becomes an edit affordance: a button/tap that reveals a small numeric input (prefilled `cycle.tm[liftKey]`, `type="number"` `min={0}`, `id`/aria-label namespaced by liftKey) + Save/Cancel. Save → `cycleRepo.updateTrainingMax(cycle.id, liftKey, value)`, close the editor, call `onTmChange?.()`. The set table already keys on `cycle.tm[liftKey]` in `workoutKey`, so when Home re-loads the cycle and passes a new `cycle` prop, rows rebuild. Hide the TM editor when the lift is already logged (read-only state).
- `LiftCard` weight alignment: the set-row weight is currently centered (`justify-center`), so different-width numbers shift the `unit`/`×reps`/plate column. Change the weight to a fixed-width, right-aligned, `tabular-nums` sub-column so `kg` and the right column align identically across warm-up/work/AMRAP rows. Layout only — no number/plate logic change.
- `Home`: pass `onTmChange={handleTmChange}` to each `LiftCard`; `handleTmChange` re-loads the active cycle (or re-runs the load) so `data.cycle.tm` refreshes and cards rebuild. Guard with `mountedRef` like `handleLogged`.

- [ ] Step 1: failing tests — `updateTrainingMax` updates one lift's tm and leaves others; `LiftCard` TM edit: open editor, change value, save → `cycleRepo` updated + `onTmChange` called; an already-logged lift shows no TM editor. `LiftCard` renders the weight with the fixed-width alignment class.
- [ ] Step 2: run → FAIL.
- [ ] Step 3: implement. Run → PASS.
- [ ] Step 4: `tsc -b` clean; full suite green.
- [ ] Step 5: commit — `git commit -am "feat(ui): editable training max on lift card + fix weight-column alignment"`

---

### Task 2: Training-maxes section in Settings

**Files:** Modify `src/ui/screens/Settings.tsx` (+ `Settings.test.tsx`).

**Behavior:** Add a **"Training maxes"** `Section` (place near Profile). On mount, read `cycleRepo.active()`. If an active cycle exists, list the 4 lifts (press/bench/squat/deadlift) with their current `cycle.tm[key]` and a control to adjust each (reuse the existing `Stepper` by the profile rounding increment, or a small number input) → on change, `cycleRepo.updateTrainingMax(cycle.id, key, next)` and update local state. If no active cycle, show a muted "No active cycle" line. Lift display names via a local `LIFT_NAMES` map or the existing one. Does not touch the read-only "Training Max %" line (leave it, or relabel to avoid confusion — keep behavior).

- [ ] Step 1: failing test — Settings renders a "Training maxes" section with the 4 lifts' current values (seed an active cycle); adjusting one persists via `cycleRepo` (re-read `active()` shows the new tm). Within `SettingsProvider`, await loaded.
- [ ] Step 2: run → FAIL.
- [ ] Step 3: implement. Run → PASS.
- [ ] Step 4: `tsc -b` clean; full suite green.
- [ ] Step 5: commit — `git commit -am "feat(ui): editable training maxes in Settings"`

---

### Task 3: Supporting lifts — compact layout + confirm-guarded delete

**Files:** Modify `src/ui/components/SupportingLifts.tsx` (+ `SupportingLifts.test.tsx`).

**Behavior:**
- **Compact:** reduce per-row vertical padding/gaps and place the `weight × reps` inputs inline on the name row (name + scheme left; compact weight/reps right) instead of a tall second block; keep readable at ~360px. Trim the section's overall empty space.
- **Delete rework:** replace the tiny `×` with a clearer remove control (larger tap target, ≥36px — e.g. a small trash/"Remove" affordance). Clicking it enters a two-step **inline confirm** for that row: show "Remove <name>?" with **Remove** and **Cancel** buttons; only **Remove** performs the deletion (built-in → `hiddenSupportingRepo.add`; custom → `customExerciseRepo.remove` — unchanged semantics), **Cancel** dismisses. Track a `pendingRemove` key in state so only one row is in confirm mode at a time.

- [ ] Step 1: failing tests — clicking remove on a row shows a confirm ("Remove" + "Cancel") and does NOT delete yet; clicking Cancel restores the row (still present); clicking Remove deletes it (built-in → hidden, gone from list; custom → removed) and persists. Existing add/log/toggle/per-lift tests stay green (update any that clicked the old `×` label).
- [ ] Step 2: run → FAIL.
- [ ] Step 3: implement (also apply the compact layout). Run → PASS.
- [ ] Step 4: `tsc -b` clean; full suite green.
- [ ] Step 5: commit — `git commit -am "feat(ui): compact supporting lifts + confirm-guarded delete"`

---

### Task 4: Persistent top-left Home + consistent top nav

**Files:** Modify `src/ui/components/NavIcons.tsx` (if needed), `src/ui/screens/Home.tsx`, `src/ui/screens/History.tsx`, `src/ui/screens/Settings.tsx` (+ their tests).

**Behavior:** Every screen's top bar gets a **top-left Home anchor**: the `5/3/1` wordmark as `<Link to="/" aria-label="Home">` (on Home it links to itself). The **top-right** shows the section icons — **History** + **Settings** — on every screen, with the current screen's icon marked active (accent color + `aria-current="page"`). Remove the separate "Today" icon (home now lives top-left). Keep each screen's own title/eyebrow (Home's Cycle badge + subtitle, History's "Progress", Settings' "Settings") arranged around the bar. Consistent across all three.

- [ ] Step 1: failing/adjusted tests — each of Home/History/Settings has a top-left link `aria-label="Home"` to `/`; each has top-right `History` (→`/history`) and `Settings` (→`/settings`) links; the current screen's nav icon carries `aria-current="page"`. Update prior nav assertions.
- [ ] Step 2: run → FAIL.
- [ ] Step 3: implement (a small shared TopBar/header helper is fine). Run → PASS.
- [ ] Step 4: `tsc -b` clean; full suite green.
- [ ] Step 5: commit — `git commit -am "feat(ui): persistent top-left Home + consistent top nav"`

---

## Self-Review
- **Spec coverage:** §2 TM edit (T1 card+data, T2 settings) ✓; §3 weight alignment (T1) ✓; §4 supporting compact + delete confirm (T3) ✓; §5 top-left Home (T4) ✓.
- **Placeholder scan:** none — concrete interfaces + behaviors + test intents per task.
- **Type consistency:** `cycleRepo.updateTrainingMax(cycleId, liftKey, tm)` defined T1, reused T2; `LiftCard` gains `onTmChange?`; `Cycle.tm` is `Record<LiftKey, number>` (unchanged). Nav links by `aria-label`/`aria-current` consistent across T4.
- **Notes for executor:** No Dexie version bump. Preserve all Plan 7/8 behavior (day-pager, session pass-through, cycle-end, supporting-lift logging). TM edits write only the active cycle's `tm`. Owner reviews the look before merge — NO auto-merge.
