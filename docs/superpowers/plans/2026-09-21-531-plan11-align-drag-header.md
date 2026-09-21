# Plan 11 — Weight Alignment, Long-Press Drag & Header Declutter — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Truly center/align the set weights, make day-drag a long-press with no text selection, and declutter the Home header with a clearer Home button — on the `plan7-cycle-overview` branch.

**Architecture:** React 19 + TS strict + Vite + Tailwind v3 + Vitest. Presentation/interaction only; no data/math/schema change.

**Spec:** `docs/superpowers/specs/2026-09-21-531-plan11-align-drag-header-design.md`

## Global Constraints
- TS strict + `verbatimModuleSyntax`: type-only imports use `import type`. `noUnusedLocals`/`noUnusedParameters` on.
- COACH theme tokens only; no hardcoded hex. Mobile-first; keep `max-w-md`.
- UI tests render within `SettingsProvider`, await loaded; fake-indexeddb globally set up.
- `npx tsc -b` clean + full suite green (2×) before each commit. Baseline: 206 tests.
- Do NOT change 5/3/1 math, progression, cycle-end, reorder persistence/`finalDropIndex`/`moveItem`, or Dexie.

---

### Task 1: Center/align the set-row weights (LiftCard grid layout)

**Files:** `src/ui/components/LiftCard.tsx`; `LiftCard.test.tsx`.

**Behavior:** Each set row currently is `flex` with a `flex-1 justify-center` weight and a VARIABLE-width reps/plate column, so the centered weight drifts row-to-row. Restructure each row to a fixed grid so the weight track is identical on every row:
- Use `grid grid-cols-[3.25rem_1fr_6.5rem_1.5rem] items-center gap-2` (tune widths): [kind+%] · [weight] · [reps+plates] · [check]. The weight cell is `text-center tabular-nums` in the `1fr` track; the reps/plate cell is a FIXED-width (`6.5rem`) `text-right` block; the check button sits in the last fixed track.
- Apply the SAME grid to: the interactive warm-up/work row, the interactive AMRAP hero row (keep its `text-[40px]` + orange bg + "as many reps as possible" + Reps-done/Done controls, but align the weight in the same track), and the read-only logged rows (Plan 10). Remove the old `inline-block w-[5rem]/w-[7.5rem] text-center` fixed-width spans in favor of the grid track (or keep a width but the point is the ROW columns are fixed).
- Keep all weight/plate values, `formatPlates`, checkmarks, AMRAP inputs, and logging wiring exactly as-is. Layout only. Ensure `×5+`, `empty bar`, and `5 · 2.5 · 1.25` still render legibly in the fixed reps/plate track (allow the plate sub-line to shrink text or wrap if an extreme case overflows).

- [ ] Step 1: failing/updated tests — a set row renders with the grid structure (assert the weight element and the reps/plate element are in the fixed-column layout, e.g. the weight span has `text-center` and the row uses the grid class); existing LiftCard tests (weights, AMRAP, plates, logged read-only) stay green (update any that asserted the old flex/`w-[5rem]` classes).
- [ ] Step 2: run → FAIL.
- [ ] Step 3: implement. Run → PASS.
- [ ] Step 4: `tsc -b` clean; suite green.
- [ ] Step 5: commit — `git commit -am "fix(ui): align/center set weights with a fixed row grid"`

---

### Task 2: Long-press drag + no text selection

**Files:** `src/ui/components/DayStrip.tsx`; `src/ui/components/OrderableList.tsx`; their tests.

**Behavior (DayStrip):**
- Add `select-none` (Tailwind) + inline `WebkitUserSelect:'none'` and keep `touchAction:'none'` on the chips so dragging never highlights the label text.
- Replace the move-distance activation with **press-and-hold**: on `pointerDown`, start a `setTimeout` (~400 ms) and record the start position. If `pointerUp` fires before the timer → clear timer → it's a TAP → `onSelect(index)`. If `pointerMove` exceeds a small tolerance (~8px) before the timer fires → clear timer, mark this gesture non-drag (a tap/scroll; no reorder). If the timer fires while still held within tolerance → enter DRAG mode (set a `dragging` state; add a subtle lift/scale affordance), and from then on `pointerMove` computes the target and `pointerUp` commits via the existing `finalDropIndex`→`onReorder` path. `pointerCancel` clears the timer and does NOT commit a select. Clear the timer on unmount. Keyboard Enter/Space still selects. Ensure a tap never also reorders and a drag never also selects.
**Behavior (OrderableList):** add `select-none` to its rows so handle-dragging doesn't select row text. (Its handle-based activation can stay; only add `select-none`.)

- [ ] Step 1: failing/updated tests — DayStrip: a plain tap (pointerdown+up, no hold) still calls `onSelect`; a move beyond tolerance without holding does NOT call `onReorder`; with fake timers, holding past the delay then moving+releasing DOES call `onReorder` (or at least the activation state flips) — test the activation logic with `vi.useFakeTimers()`; chips carry `select-none`/`touch-action:none`. Keep prior DayStrip tests green (adjust the ones that relied on the old immediate-threshold drag).
- [ ] Step 2: run → FAIL.
- [ ] Step 3: implement. Run → PASS.
- [ ] Step 4: `tsc -b` clean; suite green.
- [ ] Step 5: commit — `git commit -am "feat(ui): long-press to reorder days, no text selection"`

---

### Task 3: Declutter Home header + clearer Home button

**Files:** `src/ui/screens/Home.tsx`; `src/ui/screens/{History,Settings}.tsx` (Home-button styling); `src/ui/components/NavIcons.tsx` (if the button style is factored there); their tests.

**Behavior:**
- **Home:** remove the "Wendler strength cycle" subtitle and the entire protocol/progress line (`{PROTOCOL[selectedWeek]} · {doneCount} of 4 done this week`). Drop `PROTOCOL`/`doneCount` if now unused (keep `doneKeys` for the DayStrip ✓ badges). The top bar keeps the Home button (top-left), the `Cycle N` badge (compact header), and History+Settings icons (top-right); the WeekTabs follow directly below.
- **Clearer Home button (all three screens):** the top-left `<Link to="/" aria-label="Home">` renders the `HomeIcon` (slightly larger, ~20-22px) inside a button-like affordance — a bordered/filled pill (`border border-[var(--line)] bg-[var(--surface-2)]` or similar, rounded, padding, ≥40px tap height) next to/around the `5/3/1` wordmark — so it clearly reads as a home button. Keep `to="/"`, `aria-label="Home"`, icon `aria-hidden`, single focusable control. History/Settings keep their titles; just the button styling gets more prominent.

- [ ] Step 1: failing/updated tests — Home no longer renders the "Wendler strength cycle" text or the `done this week`/protocol text (assert absent); the Home link (`aria-label="Home"` → `/`) with its icon is present; History/Settings nav intact. Update Plan 10 Home tests that asserted the protocol/doneCount.
- [ ] Step 2: run → FAIL.
- [ ] Step 3: implement. Run → PASS.
- [ ] Step 4: `tsc -b` clean; suite green.
- [ ] Step 5: commit — `git commit -am "feat(ui): declutter Home header, clearer Home button"`

---

## Self-Review
- **Spec coverage:** §2 weight grid (T1) ✓; §3 long-press + no-select (T2) ✓; §4 header declutter + Home button (T3) ✓.
- **Placeholder scan:** none.
- **Type consistency:** T1 pure LiftCard layout; T2 DayStrip activation + OrderableList select-none (reuses `finalDropIndex`); T3 Home/History/Settings header + NavIcons. No shared new interfaces.
- **Notes for executor:** presentation/interaction only — no math/reorder-persistence/logging change. jsdom: use fake timers for the long-press; assert handlers/state, not pixels. Preserve all Plan 7/8/9/10 behavior. Owner reviews the look before merge — NO auto-merge; this merges together with 7+8+9+10.
