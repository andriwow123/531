# 5/3/1 App — Plan 11: Weight Alignment, Long-Press Drag & Header Declutter — Design Spec

- **Date:** 2026-09-21
- **Status:** Approved (owner reviewed on LAN; annotated `Images reference/image0.jpg` showing the weight misalignment + gave two more pointers)
- **Builds on:** Plans 7+8+9+10, on branch `plan7-cycle-overview` (HEAD f3643f2) — not yet merged; Plan 11 lands on the same branch and merges together.

## 1. Purpose
Three owner refinements:
1. **Weights genuinely centered/aligned** in the set table (they still drift row-to-row).
2. **Drag reorder** must not highlight/select the day text, and must only start on a **press-and-hold** (long-press), not any small move.
3. **Declutter the Home header:** drop the "Wendler strength cycle" subtitle and the `5×5/5/5+ · 65/75/85% · 0 of 4 done this week` line; keep just a header, a clearer Home button top-left, and History/Settings top-right.

## 2. Weight alignment (#1)
**Root cause (confirmed via image0.jpg):** each set row is `flex` with a fixed-width kind column, a `flex-1 justify-center` weight, and a **variable-width** reps/plate column (`empty bar` vs `5 · 2.5 · 1.25` vs `×5+`) plus the check button. The variable right column changes how much space `flex-1` has, so `justify-center` places the weight at a different x on each row — the numbers don't line up and don't read as centered.
**Fix:** give each set row a fixed column structure so the weight track is identical on every row. Use a CSS grid per row, e.g. `grid grid-cols-[3.25rem_1fr_6.5rem_1.5rem] items-center gap-2` → columns: [kind+%] [weight (`text-center`)] [reps+plates (`text-right`, fixed width)] [check]. The weight number is `text-center tabular-nums` in the `1fr` track (now identical width across rows), so all weights align vertically and read centered. Tune the reps/plate track width so `×5+` / `5 · 2.5 · 1.25` fit without wrapping (allow the plate line to shrink/truncate if an extreme case overflows). Apply the SAME structure to warm-up/work rows, the AMRAP hero row, and the read-only logged rows (Plan 10). Layout only — no number/plate/logic change. The AMRAP hero keeps its bigger type + orange treatment but uses the same aligned column structure.

## 3. Long-press drag, no text selection (#2)
On the `DayStrip` chips:
- **No text highlight:** add `user-select: none` (`select-none` + `-webkit-user-select:none`) to the chips (and keep `touch-action: none`), so dragging never selects the "Press"/"Bench"/… label text.
- **Long-press to activate:** replace the current move-distance threshold with a **press-and-hold** activation. On `pointerdown`, start a ~350–450 ms timer; if the pointer is released before it fires → it's a **tap** (`onSelect`); if the pointer moves beyond a small tolerance before it fires → it's NOT a drag (cancel; treat as a tap/scroll, no reorder); if the timer fires while still held (within tolerance) → enter **drag mode** (a subtle affordance, e.g. scale/lift the chip), and subsequent moves reorder via the existing `finalDropIndex`→`onReorder` path; `pointerup` in drag mode commits. Keyboard select still works. Clean up the timer on unmount / pointercancel (a pointercancel does NOT commit a select).
- Apply `select-none` to the Settings `OrderableList` rows too (its handle-based drag shouldn't select row text).

## 4. Home header declutter (#3)
On `Home`:
- **Remove** the "Wendler strength cycle" subtitle and the entire protocol/progress line (`{PROTOCOL[selectedWeek]} · {doneCount} of 4 done this week`). (The `PROTOCOL` map / `doneCount` may be dropped if now unused — keep `doneKeys` for the DayStrip ✓ badges.)
- The top bar keeps: a **clearer Home button** top-left, and the History + Settings icons top-right. Keep the `Cycle N` badge as the compact header (or fold it beside the wordmark). Week tabs follow directly under the top bar.
- **More apparent Home button** (all three screens): the top-left `<Link to="/" aria-label="Home">` becomes visibly a button — the `HomeIcon` at a slightly larger size inside a bordered/filled pill (`border border-[var(--line)]` or `bg-[var(--surface-2)]`, rounded, adequate padding, ≥40px height) so it clearly reads as "tap to go home," alongside the `5/3/1` wordmark. History/Settings screens keep their own titles ("Progress"/"Settings"); only the button styling gets more prominent there.

## 5. Testing
- LiftCard: the weight number carries the centered grid-track classes; render a row set and assert the grid structure (a snapshot/class check is enough — visual alignment is confirmed in visual QA). No change to weights/plates values or logging.
- DayStrip: a plain tap still `onSelect`s; a quick move without holding does NOT reorder; the drag path still reorders via `onReorder`/`finalDropIndex` once activated (test the activation logic / handlers, not real timers+pixels where infeasible — you may fake timers for the long-press). Chips carry `select-none`/`touch-action:none`.
- Home: the "Wendler strength cycle" subtitle and the protocol/`done this week` line are GONE; the Home button (link to `/`, `aria-label="Home"`) still present with its icon; History/Settings nav icons still present. Update the Plan 10 Home tests that asserted the protocol/doneCount text.
- Nav: the Home button is a single focusable `Link` to `/`, icon `aria-hidden`, accessible name "Home".
- All prior 206 tests kept green where still valid; `tsc -b` clean; suite run 2×.

## 6. Non-goals
- No change to 5/3/1 math, progression, cycle-end, reorder persistence semantics, or Dexie schema.
- Reorder still display-only; long-press only changes drag ACTIVATION, not the reorder math.
- No heavyweight drag/gesture library.
