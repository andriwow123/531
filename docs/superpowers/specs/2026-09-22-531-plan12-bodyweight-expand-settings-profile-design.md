# 5/3/1 App — Plan 12: Bodyweight Table, Tap-to-Expand, Settings Clarity, Editable Profile — Design Spec

- **Date:** 2026-09-22
- **Status:** Approved (owner's 5 pointers; units-conversion behavior confirmed in chat = "convert everything")
- **Builds on:** Plans 1–11 + onboarding-TM + durability, all merged to `main` (HEAD 6acb426). Work on a fresh branch off `main`, merges back (auto-deploys via GitHub Pages).

## 1. Purpose
Five owner refinements:
1. **Bodyweight**: show entries in a **table** you can **edit/delete** (fix a mistyped weight); fix the graph's odd Y-axis increments.
2. **Tap-to-expand**: the "How to perform" / "Supporting lifts" / "+ Add note" bars expand when tapped **anywhere** on them, not just the small text.
3. **Templates in Settings**: add a plain-English description of what each template changes.
4. **Rest timer**: collapse the two overlapping controls into **one**.
5. **Profile**: make **Units** editable (switching kg↔lb **converts all stored weights**); **remove the now-unused "Training Max %"**.

## 2. Bodyweight table + edit/delete + Y-axis (`BodyweightCard.tsx`, `bodyweightRepo`)
- Add `bodyweightRepo.update(id, patch: Partial<BodyweightEntry>)` and `bodyweightRepo.remove(id)` (Dexie `update`/`delete`).
- Below the existing "Log today" input + chart, add a **table/list of all entries** (most recent first): each row shows the date and weight, with an **Edit** (inline: turn the weight into an editable input + Save/Cancel) and a **Delete** (with a small confirm, since it's destructive). Editing writes via `update`; delete via `remove`; both refresh the card (latest + chart + table). Keep it tight and readable; `type=text inputMode=decimal` + comma-normalized parse for the edit input (consistent with the rest of the app).
- **Y-axis fix:** the chart currently uses `domain={['auto','auto']}`, producing odd tick values. Compute a **sensible rounded domain + ticks**: e.g. pad the min/max by a small margin and round the domain ends to a round step (nearest 1/2/5 depending on the range), and pass explicit integer-ish `ticks` (or `allowDecimals={false}` with a rounded domain) so the axis shows clean numbers. Keep the line/marker/theme-color behavior unchanged.

## 3. Tap-to-expand (full-width collapsed toggles)
The collapsed toggles are currently small text `<button>`s. Make the entire collapsed **bar** the clickable control (full width, adequate padding, `aria-expanded`), so tapping anywhere on it expands/collapses:
- **`ExerciseDemo`** "How to perform" collapsed header → full-width button bar.
- **`SupportingLifts`** "Supporting lifts" / "Hide supporting lifts" toggle → full-width button bar.
- **`LiftCard`** "+ Add note" collapsed control → full-width button bar (the same card-styled bar as the others).
Keep the expanded content and all behavior; only the collapsed *trigger* becomes a big tap target. Theme tokens; consistent look across the three bars.

## 4. Settings — template descriptions + one rest-timer control (`Settings.tsx`)
- **Template descriptions:** under the Templates segmented control (Base/BBB/FSL) and the "5s PRO" / "Warm-up sets" toggles, add a short description each: Base = "Main 5/3/1 sets only."; BBB (Boring But Big) = "Adds 5×10 back-off sets at ~50% of your training max."; FSL (First Set Last) = "Adds back-off sets at your first work-set weight."; 5s PRO = "Every main set is 5 reps (no AMRAP) — steadier progress."; Warm-up sets = "Adds 40/50/60% warm-up sets before your work sets." (Wording can be tuned; keep concise + accurate.)
- **Single rest-timer control:** there are two overlapping controls — the "Rest timer widget" toggle in the Display-mode section AND the "Rest timer" section's "Enabled" toggle. **Remove the Display-mode "Rest timer widget" toggle** and make the **"Rest timer" section the single source of truth**. Update `Home` so the rest timer shows based only on `settings.restTimer.enabled` (drop the `display.restTimer &&` part of the gate). Leave the `restTimer` `DisplayElement` in the type/resolver (no churn) — just stop surfacing/depending on it.

## 5. Profile — editable Units (with conversion) + remove TM% (`Settings.tsx`, a conversion op)
- **Remove** the read-only "Training Max %" row from the Profile section (it's vestigial now that training maxes are entered directly). Keep `profile.tmPercent` stored (no schema change) — just don't display it. Remove the "coming soon" caption.
- **Units editable:** make the Profile "Units" a segmented control (kg / lb) like elsewhere. Switching to a different unit **converts all stored weights** (owner-confirmed). Implement a transactional conversion op (e.g. `convertUnits(to: Unit)` in a new `src/data/units.ts`, or on a repo), run inside one Dexie `rw` transaction:
  - factor: kg→lb `× 2.2046226218`, lb→kg `÷ 2.2046226218`.
  - target rounding increment: kg = 2.5, lb = 5; per-lift `increment`: upper 2.5kg/5lb, lower 5kg/10lb.
  - **profile**: `units = to`, `roundingIncrement = target`.
  - **lifts** (all): `trainingMax`, `oneRm` → convert then round to the target rounding increment; `increment` → the new unit's per-category increment.
  - **cycles** (all): each `tm[lift]` → convert + round to target increment.
  - **sessions** (all): each `sets[].weight` → convert + round to target increment; `estimated1RM` (if set) → convert (round to target increment). `amrapReps`/reps unchanged.
  - **bodyweight** (all): each `weight` → convert, rounded to 1 decimal.
  - Use a shared `roundToIncrement` helper (already in the domain — reuse it). Round-trip loss (kg→lb→kg) is acceptable.
  - **UI:** changing the unit shows a confirm ("Convert all your weights to lb?") before running; on confirm, run the conversion then reload/refresh so every screen reflects the new unit. Guard against a no-op (same unit).

## 6. Testing
- `bodyweightRepo.update`/`remove` round-trips; BodyweightCard renders the entries table, edits a weight (persists), deletes an entry (with confirm), and the chart's domain/ticks are the rounded values (assert the computed domain/ticks helper). 
- Tap-to-expand: the collapsed bar for demos/supporting/note is a single button that toggles `aria-expanded` and reveals content on click (the whole bar, not a nested small button).
- Settings: template descriptions render; the Display "Rest timer widget" toggle is GONE and Home shows the timer based only on `restTimer.enabled`; the Profile TM% row is gone; the Units control renders and switching it (confirm → `convertUnits`) converts data — a focused test: seed a cycle+lift+session+bodyweight in kg, switch to lb, assert TMs/sets/bodyweight are the converted+rounded values and `profile.units==='lb'`. `convertUnits` is unit-tested at the data layer (a couple of representative values + a no-op guard).
- Render within `SettingsProvider`, await loaded. All prior 228 tests kept green; `tsc -b` clean; suite 2×.

## 7. Non-goals
- No cloud/sync; no Dexie schema/version change; no change to the 5/3/1 progression math itself.
- Unit round-trip is lossy by rounding (acceptable). No historical audit of conversions.
