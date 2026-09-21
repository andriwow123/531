# 5/3/1 App — Plan 9: Polish + Editable Training Max — Design Spec

- **Date:** 2026-09-21
- **Status:** Approved (owner reviewed Plan 7+8 on LAN, gave these five pointers, said "fix these then continue")
- **Builds on:** Plan 7 + Plan 8, on branch `plan7-cycle-overview` (HEAD 9b44f80) — not yet merged; Plan 9 lands on the same branch and merges together.

## 1. Purpose
Five owner-requested refinements to the cycle-overview before merge:
1. Editable **training max** (per lift) — in the workout card AND in Settings.
2. Fix **weight-column misalignment** on the lift card (kg values shift row-to-row).
3. **Tighten** the supporting-lifts section (too much empty space) and **rework deletion** (the × is tiny + must confirm before removing).
4. A persistent **top-left "home"** anchor on every screen (standard back-to-home affordance).
5. (covered by 3) deletion confirmation.

## 2. Editable training max
- **Data:** add `cycleRepo.updateTrainingMax(cycleId: number, liftKey: LiftKey, tm: number): Promise<void>` — updates `cycle.tm[liftKey]` on the active cycle (merge-write the `tm` map). No schema change.
- **On the lift card (`LiftCard`):** the header "training max NN kg" becomes tappable → reveals a small number input (prefilled with the current TM) + a save affordance. Saving calls `updateTrainingMax`, then the card's set table recomputes from the new TM (via the existing `workoutKey`/`buildWorkout` path — include `cycle.tm[liftKey]` in the key so rows rebuild). `LiftCard` gets an `onTmChange?: () => void` callback so Home can refresh its loaded cycle. Editing is disabled/hidden for an already-logged lift (read-only state) — TM edits apply going forward, not to a logged session.
- **In Settings:** a new **"Training maxes"** section listing the 4 lifts (press/bench/squat/deadlift) each with the current TM and a stepper or number input to adjust it (rounded to the profile's increment), persisting via `updateTrainingMax` to the active cycle. Reads the active cycle on mount; shows a graceful empty state if no active cycle.
- TM edits change only the current cycle's `tm`; progression/end-of-cycle logic is unchanged (it already reads `cycle.tm`).

## 3. Lift-card weight alignment
- In `LiftCard`'s set-row layout, the big weight currently centers in its column (`justify-center`), so different-width numbers (20 vs 102.5) shift the unit and the ×reps/plate column. Fix: give the weight a consistent alignment — right-align the number within a fixed-width sub-column (`tabular-nums`, a fixed `min-width`/`w-*`), so the `kg` unit and the right-hand `×reps`/plate column line up identically on every row (warm-up, work, and the AMRAP hero). No number/plate logic changes — layout only.

## 4. Supporting lifts — compactness + delete rework
- **Compactness:** reduce the vertical padding/gaps so rows aren't mostly empty space. Put the weight/reps inputs inline with the name row where they fit (name + scheme on the left, compact `weight × reps` on the right), rather than a tall second block per row; tighten `gap`/`py`. Keep it readable at ~360px.
- **Delete rework:** replace the tiny `×` with a clearer, larger remove control (a labelled/트trash affordance with a ≥36px tap target) that requires **confirmation**: clicking it puts that row into a two-step inline confirm ("Remove <name>? " + **Remove** / **Cancel**) — only **Remove** deletes (built-in → hidden; custom → deleted, unchanged semantics). No accidental one-tap deletes.

## 5. Persistent top-left home
- On **every** screen (Home, History, Settings), the **top-left** holds the app/home anchor: the `5/3/1` wordmark as a `<Link to="/" aria-label="Home">` (on Home it links to itself/home). This is the always-available way back.
- Top-**right** keeps the section icons: **History** + **Settings** icons on every screen, the current screen's icon shown active (accent). The separate "Today" icon is removed (home now lives top-left). Each screen's own title/eyebrow (Home's Cycle badge, History's "Progress", Settings' "Settings") stays, arranged around the top bar.

## 6. Testing
- `cycleRepo.updateTrainingMax` round-trip (updates the one lift's tm, leaves others). `LiftCard`: editing TM saves + rebuilds the table to the new weights + calls `onTmChange`; read-only lift shows no TM editor. `Settings`: the Training-maxes section renders the 4 TMs and editing one persists to the active cycle. Weight alignment is layout-only (a render/snapshot check that the weight uses the fixed-width class is enough). `SupportingLifts`: delete now needs the confirm step (one tap → confirm prompt, Cancel aborts, Remove deletes); compact layout keeps existing add/log/toggle tests green. Nav: every screen has a top-left Home link to `/` and top-right History/Settings links. Render within `SettingsProvider`, await loaded; all prior 163 tests stay green (update any that asserted the old nav/TM-read-only text); `tsc -b` clean.

## 7. Non-goals
- No change to the 5/3/1 math, progression, cycle-end, or Dexie schema versions.
- No TM history/audit; editing simply sets the current cycle's TM.
- No new confirm-dialog library (inline confirm only).
