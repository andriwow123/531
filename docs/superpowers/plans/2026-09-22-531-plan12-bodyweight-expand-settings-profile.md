# Plan 12 — Bodyweight Table, Tap-to-Expand, Settings Clarity, Editable Profile — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Editable bodyweight table + cleaner chart axis; full-bar tap-to-expand; template explanations + single rest-timer control; editable Units (with weight conversion) and removed vestigial TM%.

**Architecture:** React 19 + TS strict + Vite + Tailwind v3 + Dexie + Vitest + Recharts. Additive; no Dexie schema/version change.

**Spec:** `docs/superpowers/specs/2026-09-22-531-plan12-bodyweight-expand-settings-profile-design.md`

## Global Constraints
- TS strict + `verbatimModuleSyntax`: `import type`. `noUnusedLocals`/`noUnusedParameters` on.
- COACH theme tokens only; no hardcoded hex. Mobile-first; keep `max-w-md`.
- UI tests render within `SettingsProvider`, await loaded; fake-indexeddb globally set up.
- `npx tsc -b` clean + full suite green (2×) before each commit. Baseline: 228 tests.
- Do NOT change the 5/3/1 progression math, cycle-end logic, or Dexie schema/versions.
- Decimal inputs use `type=text inputMode=decimal` + comma-normalized parse (`Number(String(v).replace(',', '.'))`), consistent with the rest of the app.

---

### Task 1: Bodyweight — editable table + delete + Y-axis fix

**Files:** `src/data/repositories.ts` (bodyweightRepo), `src/ui/components/BodyweightCard.tsx`, tests.

- Add `bodyweightRepo.update(id: number, patch: Partial<BodyweightEntry>): Promise<void>` (`db.bodyweight.update(id, patch)`) and `bodyweightRepo.remove(id: number): Promise<void>` (`db.bodyweight.delete(id)`).
- In `BodyweightCard`, below the chart, render a **table of all entries** (most-recent-first): each row = date + weight + Edit + Delete. Edit turns the weight into an inline `type=text inputMode=decimal` input with Save/Cancel → `update(id, { weight })` (comma-normalized, `> 0` valid). Delete → a small inline confirm → `remove(id)`. Both refresh the card state (re-`load()`).
- **Y-axis:** replace `domain={['auto','auto']}` with a computed rounded domain + explicit `ticks`. Add a pure helper (e.g. `bodyweightAxis(values: number[]): { domain: [number, number]; ticks: number[] }`) that pads min/max slightly and rounds the ends + picks ~4–6 clean ticks at a round step (1/2.5/5/10 by range). Feed it to `<YAxis domain={...} ticks={...} allowDecimals={false} />` (or keep decimals if the step needs them, but ticks must be clean round numbers).

- [ ] Step 1: failing tests — `bodyweightRepo.update`/`remove` round-trips; `bodyweightAxis` returns rounded domain/ticks for sample data; BodyweightCard renders the entries table, edits an entry's weight (persists via repo), deletes one (confirm). Within `SettingsProvider` not needed (card takes no context) — follow existing BodyweightCard.test.tsx setup.
- [ ] Step 2: run → FAIL. Step 3: implement → PASS. Step 4: `tsc -b` + suite green.
- [ ] Step 5: commit — `git commit -am "feat(ui): editable bodyweight table + delete; cleaner chart y-axis"`

---

### Task 2: Tap-to-expand collapsed bars

**Files:** `src/ui/components/ExerciseDemo.tsx`, `src/ui/components/SupportingLifts.tsx`, `src/ui/components/LiftCard.tsx` (the note bar), tests.

- Make each collapsed toggle a **full-width button bar** (the whole bar is the tap target), keeping `aria-expanded` and the expand/collapse behavior:
  - `ExerciseDemo`: the "How to perform" collapsed header → `<button type="button" className="w-full ... text-left ...">` spanning the bar.
  - `SupportingLifts`: the "Supporting lifts" / "Hide supporting lifts" toggle → full-width bar button.
  - `LiftCard`: the "+ Add note" collapsed control → full-width bar button (same card-styled bar).
- Consistent styling across the three (card-styled bar, padding, hover). Do not change the expanded content or the note/demo/supporting logic.

- [ ] Step 1: failing/adjusted tests — the collapsed demo/supporting/note trigger is a single `button` (role) spanning the bar that toggles `aria-expanded` and reveals content on click; existing tests that clicked the old small text still pass (same accessible name) or are re-pointed.
- [ ] Step 2: FAIL → Step 3: implement → PASS → Step 4: green.
- [ ] Step 5: commit — `git commit -am "feat(ui): full-bar tap targets for how-to-perform / supporting-lifts / add-note"`

---

### Task 3: Settings — template descriptions + single rest-timer + remove Profile TM%

**Files:** `src/ui/screens/Settings.tsx`, `src/ui/screens/Home.tsx` (rest-timer gate), tests.

- **Template descriptions:** add a concise description line under each of Base/BBB/FSL and the 5s-PRO / Warm-up-sets toggles (wording from spec §4). Use a muted caption style.
- **Single rest-timer control:** remove the **"Rest timer widget"** `ToggleRow` from the Display-mode section. In `Home`, change the rest-timer render gate from `display.restTimer && settings.restTimer.enabled` to just `settings.restTimer.enabled`. Leave `restTimer` in `DisplayElement`/resolver (no churn).
- **Remove Profile TM%:** delete the read-only "Training Max %" row (and its "coming soon" caption) from the Profile section. Keep `profile.tmPercent` in the schema/stored profile (do not touch it), just stop displaying it.

- [ ] Step 1: failing/adjusted tests — Settings shows template descriptions; the "Rest timer widget" toggle is GONE; Home renders the rest timer when `restTimer.enabled` regardless of the (removed) display flag; the Profile "Training Max %" row is gone. Update Plan-3-era tests that asserted those.
- [ ] Step 2: FAIL → Step 3: implement → PASS → Step 4: green.
- [ ] Step 5: commit — `git commit -am "feat(ui): explain templates, single rest-timer control, drop vestigial TM%"`

---

### Task 4: Editable Units with full weight conversion

**Files:** `src/data/units.ts` (new conversion op), `src/ui/screens/Settings.tsx` (Profile Units control), tests.

- New `src/data/units.ts`: `export async function convertUnits(to: Unit): Promise<void>` — reads the current `profile.units`; if already `to`, no-op. Otherwise, in ONE `db.transaction('rw', [db.profile, db.lifts, db.cycles, db.sessions, db.bodyweight], async () => {...})`:
  - factor: `to==='lb' ? 2.2046226218 : 1/2.2046226218`.
  - target rounding increment: `to==='kg' ? 2.5 : 5`; per-lift `increment`: upper (press/bench) `to==='kg'?2.5:5`, lower (squat/deadlift) `to==='kg'?5:10`.
  - Reuse `roundToIncrement(value, inc)` from the domain (import it).
  - profile: `units=to`, `roundingIncrement=target` (keep tmPercent).
  - each lift: `trainingMax`, `oneRm` → `roundToIncrement(v*factor, target)`; `increment` → new per-category increment.
  - each cycle: every `tm[key]` → `roundToIncrement(*factor, target)`.
  - each session: every `sets[i].weight` → `roundToIncrement(*factor, target)`; `estimated1RM` (if not null) → `roundToIncrement(*factor, target)`.
  - each bodyweight entry: `weight` → round(`*factor`, to 1 decimal).
  - Persist each modified row (`table.put`/`update`).
- `Settings.tsx` Profile: replace the read-only Units text with a segmented control (kg/lb) bound to the loaded profile's unit. On selecting a DIFFERENT unit, show an inline confirm ("Convert all your weights to {unit}?" + Cancel/Convert); on Convert → `await convertUnits(unit)` then reload (`window.location.reload()`) so every screen re-reads the converted data.

- [ ] Step 1: failing tests — `convertUnits`: seed profile(kg)+a lift(tm 140, oneRm 140, increment 5)+a cycle(tm all)+a session(a set weight)+a bodyweight entry; call `convertUnits('lb')`; assert profile.units==='lb', roundingIncrement===5, the lift/cycle/session weights are `roundToIncrement(v*2.2046, 5)`, bodyweight converted, and a no-op when converting to the same unit. Settings: the Units control renders; selecting the other unit shows a confirm; confirming triggers the conversion (assert via the repo after) — you can call the handler/`convertUnits` directly in the test rather than driving `window.location.reload`.
- [ ] Step 2: FAIL → Step 3: implement → PASS → Step 4: green (2×).
- [ ] Step 5: commit — `git commit -am "feat(data): editable units with full weight conversion"`

---

## Self-Review
- **Spec coverage:** §2 bodyweight (T1) ✓; §3 tap-expand (T2) ✓; §4 templates+rest-timer (T3) ✓; §5 profile units+TM% (T3 removes TM%, T4 units) ✓.
- **Placeholder scan:** none.
- **Type consistency:** `bodyweightRepo.update/remove` (T1); collapsed-bar buttons (T2); `convertUnits(to)` (T4) reuses `roundToIncrement`; Home rest-timer gate simplified (T3). No progression/schema change.
- **Notes for executor:** No Dexie bump. Conversion is transactional + reuses `roundToIncrement`. Owner reviews the look before merge — NO auto-merge; merge to `main` (auto-deploys to GitHub Pages).
