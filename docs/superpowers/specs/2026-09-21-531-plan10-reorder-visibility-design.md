# 5/3/1 App — Plan 10: Day Reorder, Persistent Sets, & Polish — Design Spec

- **Date:** 2026-09-21
- **Status:** Approved (owner reviewed Plan 7+8+9 on LAN; gave 5 pointers; item-5 clarified in chat)
- **Builds on:** Plans 7+8+9, on branch `plan7-cycle-overview` (HEAD aeb02d4) — not yet merged; Plan 10 lands on the same branch and merges together.

## 1. Purpose
Five owner-requested refinements:
1. Make the **top-left Home** anchor obviously tappable (a home icon, not just text).
2. **Center** the set weights (they read off-center after the right-align fix) while keeping units aligned.
3. **Select-all on focus** for the training-max inputs (so typing replaces the value instead of inserting at the front).
4. **Reorder the lifts/days** — drag on the main-screen day strip AND reorder in Settings; the order is saved and applied to the day pager, the `Day N` labels, and which lift opens by default.
5. **Completed sets stay visible** — checking a set (or finishing a lift) must not remove it from view; keep the sets on screen with checkmarks, and retire the "hide completed warm-ups" behavior.

## 2. Persisted lift order (feature for #4)
- Add `liftOrder: LiftKey[]` to `SettingsState` (persisted via the existing `settingsRepo`), default `['press','bench','squat','deadlift']`. A pure helper `orderedLifts(liftOrder): LiftKey[]` returns a sanitized order (all 4 lifts exactly once; falls back to the default if malformed/missing, tolerating older saved settings without the field).
- **Applied to display only** (no change to 5/3/1 math/progression): the Home day pager renders cards in `liftOrder`; the `DayStrip` shows chips in `liftOrder`; `Day N` = 1-based index within `liftOrder`; the default `activeDay` = the position of `nextUp(logged).liftKey` within `liftOrder`. `nextUp`/cycle-end/progression are unchanged (they're order-independent for completion). The Settings "Training maxes" list also renders in `liftOrder` for consistency. History/CycleEnd may stay on the fixed `LIFT_ORDER` for now (out of scope).

## 3. Reorder interactions (#4)
- **Settings — "Workout day order" section:** a vertical list of the 4 lifts, each a drag-reorderable row (a clear drag handle / grab affordance). Dragging reorders and persists `settings.liftOrder`. Touch + mouse supported; a keyboard/no-drag fallback (e.g. up/down controls) keeps it accessible.
- **Main screen — `DayStrip`:** the day chips become drag-reorderable in place — press-and-drag a chip to move it; a plain tap still switches to that day. Reordering persists `settings.liftOrder` (so the pager/labels re-flow). A small drag threshold distinguishes a tap (switch day) from a drag (reorder); the drag must not fight the pager's horizontal swipe (the strip is its own element above the pager).
- Implementation: a small self-contained pointer-based sortable (no heavy DnD dependency), or a vetted lightweight sortable lib if it's React-19 compatible; either way it must work on touch and degrade gracefully.

## 4. Completed sets stay visible (#5)
- **Retire hide-on-done:** remove the `hideCompletedWarmups` row-hiding from `LiftCard` (completed warm-ups stay visible with a checkmark) and remove that toggle from Settings (leave the `SettingsState` field harmless/unused, or drop it — no migration).
- **A logged lift keeps its sets on screen:** when a lift already has a done session (`existingSession != null`), render its sets as a **read-only checklist** rebuilt from the session's logged sets — each set shown with its weight/plates and a checkmark, the AMRAP set showing the logged reps — under a "✓ Logged this week" header, instead of collapsing to the small summary box. The est-1RM/summary line may remain as a compact header; the point is the completed sets remain visible.
- In-progress: checking a set marks it done (checkmark) and it stays visible (no vanish); the existing dim-on-done styling stays subtle enough that the row and its checkmark remain clearly readable.
- The logging/auto-save/progression/cycle-end model is otherwise unchanged (a lift is still "logged" the same way; only its rendering after logging changes).

## 5. Polish (#1–#3)
- **Home affordance (#1):** the top-left becomes a clearly tappable home control — a home (house) icon alongside the `5/3/1` wordmark, wrapped in the existing `<Link to="/" aria-label="Home">`, styled to read as a button (subtle surface/rounded), on all three screens.
- **Weight centering (#2):** in `LiftCard`, the set weight number keeps its fixed-width column but is **center-aligned** (`text-center`, `tabular-nums`) with the unit immediately after the fixed-width block — so numbers look balanced/consistent AND the units still line up. Apply to warm-up/work rows and the AMRAP hero. Layout only.
- **TM select-on-focus (#3):** the training-max inputs (the `LiftCard` header editor and the Settings "Training maxes" inputs) select their full contents on focus (`onFocus={e => e.target.select()}`), and the card editor autofocuses + selects on open, so typing overwrites the current value.

## 6. Testing
- `orderedLifts` (sanitizes/falls back). Settings persists `liftOrder`; reordering (via the reorder control) updates it and re-renders. Home renders cards/DayStrip/`Day N` in `liftOrder`; default active day maps `nextUp` into `liftOrder`. `LiftCard`: a logged lift shows its completed sets read-only with checkmarks (not a bare summary) and completed warm-ups are NOT hidden; weight number carries the centered fixed-width class; TM input selects on focus. Settings TM inputs select on focus. Nav: top-left Home control still links to `/` with a visible icon. Reorder logic is unit-tested at the state level (drag interactions that need real layout are asserted via the reorder handler / order state, not pixel dragging, given jsdom). All prior 174 tests kept green where valid; `tsc -b` clean.

## 7. Non-goals
- No change to the 5/3/1 math, progression, cycle-end, or Dexie schema versions.
- Reorder affects display order only (not the underlying rotation/progression math).
- History/CycleEnd lift ordering unchanged for now.
- No heavyweight drag-and-drop framework if avoidable.
