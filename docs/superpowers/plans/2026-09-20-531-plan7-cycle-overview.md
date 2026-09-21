# 5/3/1 App — Plan 7: Cycle-Overview Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Replace the workout screen with an interactive cycle overview: week tabs → all 4 lifts as cards (full set table + per-set plates + AMRAP highlight + inline logging) → expandable supporting-lifts checklist (add custom / remove any). Orange theme; all existing features preserved.

**Architecture:** Pure supporting-lifts data/resolvers + Dexie v5 stores/repos; a `LiftCard` (set table + logging), a `SupportingLifts` (checklist), and a rebuilt `Home` (week tabs + 4 cards) replacing the pick-your-workout selector.

**Tech Stack:** React 19 + TS, Dexie, Vitest. COACH orange theme tokens.

**Spec:** `docs/superpowers/specs/2026-09-20-531-plan7-cycle-overview-design.md`.

## Global Constraints
- COACH theme tokens only; Manrope; mobile-first; dark + light. `import type`; `tsc -b` clean; `npm test` green (update tests the redesign changes; keep the rest green).
- Dexie ADDITIVE at `version(5)` — keep v1–v4 untouched.
- Preserve the Session/progression/cycle-end model exactly (logging just moves inline-per-lift). Settings/History/demos/bodyweight/theme unchanged except as §6 of the spec states.
- Settings/Home tests await the loaded settings state (async-load race).
- Reuse `buildWorkout`, `computePlates`, `estimate1RM`, `nextUp`, `suggestProgression`, repos.

## File Structure
```
src/data/db.ts / repositories.ts   # v5 stores + supportingDoneRepo, hiddenSupportingRepo, customExerciseRepo.remove; CustomExercise.scheme?
src/domain/supportingCatalog.ts     # SUPPORTING_CATALOG, categoriesForLift, bbbFor, supportingList (+ .test)
src/ui/components/LiftCard.tsx       # set table + plates + AMRAP + inline logging (+ .test)
src/ui/components/SupportingLifts.tsx# BBB + categorized checklist + add/remove/done (+ .test)
src/ui/components/WeekTabs.tsx        # week selector
src/ui/screens/Home.tsx              # rebuilt: title + week tabs + 4 LiftCards
src/ui/screens/Settings.tsx          # retire plate-breakdown toggle; assistanceTracking → supporting lifts
```

---

### Task 1: Supporting-lifts data + Dexie v5 repos

**Files:** Modify `src/data/db.ts`, `src/data/repositories.ts`, `src/data/repositories.test.ts`, `src/domain/index.ts`; Create `src/domain/supportingCatalog.ts`, `src/domain/supportingCatalog.test.ts`.

**Interfaces:**
```ts
// supportingCatalog.ts
export interface SupportingItem { name: string; scheme: string; custom?: boolean; }
export const SUPPORTING_CATALOG: Record<AssistanceCategory, { name: string; scheme: string }[]>;
export function categoriesForLift(liftKey: LiftKey): AssistanceCategory[]; // upper(press,bench)=['push','pull','core']; lower(squat,deadlift)=['legs','pull','core']
export function bbbFor(tm: number, roundingIncrement: number): number; // round(tm*0.5, inc) — the BBB weight
export function supportingList(category: AssistanceCategory, customs: CustomExercise[], hidden: HiddenSupporting[]): SupportingItem[]; // catalog[category] minus hidden names (ci) + this category's customs, catalog-first
// repositories.ts (Dexie v5)
export interface HiddenSupporting { id?: number; category: AssistanceCategory; name: string; }
export interface SupportingDone { id?: number; date: string; category: AssistanceCategory; name: string; }
// CustomExercise gains optional scheme?: string
export const hiddenSupportingRepo = { add(category, name): Promise<number>; all(): Promise<HiddenSupporting[]>; remove(id): Promise<void>; };
export const supportingDoneRepo = { toggle(date, category, name): Promise<void>; forDate(date): Promise<SupportingDone[]>; };
export const customExerciseRepo = { /* existing add/all + */ remove(id: number): Promise<void>; };
```
Catalog contents (with schemes) — copy verbatim:
- **push:** Dips 3 × 8–12; Close-grip bench press 3 × 8–10; Incline dumbbell press 3 × 10–12; Triceps pushdown 3 × 12–15; Push-ups 3 × max; Overhead dumbbell press 3 × 8–12; Lateral raise 3 × 12–15
- **pull:** Chin-ups 3 × max; Lat pulldown 3 × 10–12; Face pulls 3 × 15–20; Dumbbell curl 3 × 10–12; Barbell row 3 × 8–10; Dumbbell row 3 × 10–12; Hammer curl 3 × 10–12
- **legs:** Romanian deadlift 3 × 8–10; Bulgarian split squat 3 × 8–12; Walking lunge 3 × 10–12; Leg press 3 × 10–15; Leg curl 3 × 10–15; Leg extension 3 × 12–15; Calf raise 3 × 15–20
- **core:** Hanging leg raise 3 × 10–15; Ab wheel rollout 3 × 8–12; Plank 3 × max; Cable crunch 3 × 12–15; Back extension 3 × 12–15; Russian twist 3 × 15–20

- [ ] **Step 1: Failing tests** — `supportingCatalog.test.ts`: `categoriesForLift('press')` = `['push','pull','core']`, `categoriesForLift('squat')` = `['legs','pull','core']`; `bbbFor(100,2.5)===50`; `supportingList('push', [{category:'push',name:'JM Press',scheme:'3 × 8'},{category:'pull',name:'x'}], [{category:'push',name:'Dips'}])` → catalog push minus "Dips" + "JM Press", excludes the pull custom. `repositories.test.ts`: `hiddenSupportingRepo` add/all/remove; `supportingDoneRepo` toggle twice (on then off) + forDate; `customExerciseRepo.remove`. Dexie v5 additive.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** — `db.ts` add v5 stores; repos; `supportingCatalog.ts`; `CustomExercise.scheme?`. `supportingDoneRepo.toggle` = if an entry (date,category,name) exists delete it else add. Re-export catalog helpers.
- [ ] **Step 4: Run → PASS**, `tsc -b` clean.
- [ ] **Step 5: Commit** — `git commit -am "feat(data): supporting-lifts catalog + v5 stores/repos"`

---

### Task 2: LiftCard (set table + plates + inline logging)

**Files:** Create `src/ui/components/LiftCard.tsx`, `src/ui/components/LiftCard.test.tsx`.

**Interface:** `LiftCard({ liftKey, week, cycle, unit, roundingIncrement, dayNumber, settings, onLogged })` — builds `buildWorkout({ tm: cycle.tm[liftKey], week, template: cycle.template, fivesPro: cycle.fivesPro, warmups: settings.template.warmups, roundingIncrement })`; renders header (name · `Day N` · `training max NN <unit>`) and the **set table**: each row = `warm-up/work` + `%`, big weight + unit, `×reps` (AMRAP shows `×N+`), and the per-side plate breakdown from `computePlates(weight, BAR_WEIGHT[unit], PLATE_SET[unit])` rendered like `5 · 1.25` (or "empty bar" when none). The AMRAP set is highlighted with `--accent`. Inline logging: tap work sets to toggle done; the AMRAP set has a "Reps done" numeric field. When all work sets are done, save a `Session` (via `sessionRepo.add`, same shape/estimate as the current Home) and call `onLogged()`. If a session already exists for (liftKey, week), show a "logged" state read-only. Includes `<ExerciseDemo liftKey={liftKey}/>` (collapsed) when `settings.exerciseDemos`, and `<SupportingLifts liftKey={liftKey} tm={cycle.tm[liftKey]} unit={unit} roundingIncrement={roundingIncrement}/>` (collapsed) when `settings.assistanceTracking`.

- [ ] **Step 1: Failing test** — render a LiftCard (deadlift, week 1, a seeded cycle) within SettingsProvider; assert the header shows the TM, the three work weights + `×reps` appear, and a plate breakdown string is shown for a work set; toggling the work sets + entering AMRAP reps and it persists a `Session` for that lift/week (assert `sessionRepo.forCycle`).
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement `LiftCard.tsx`** (reuse the logging/estimate logic pattern from the current Home). Run → PASS.
- [ ] **Step 4: Commit** — `git commit -am "feat(ui): LiftCard with set table, plates, inline logging"`

---

### Task 3: SupportingLifts checklist

**Files:** Create `src/ui/components/SupportingLifts.tsx`, `src/ui/components/SupportingLifts.test.tsx`.

**Interface:** `SupportingLifts({ liftKey, tm, unit, roundingIncrement })` — collapsed by default ("Supporting lifts"). Expanded: a **Boring But Big** row ("same lift, for size — 5 × 10 @ `bbbFor(tm, inc)` `unit`") with a done checkbox; then, for each category in `categoriesForLift(liftKey)`, a header + the `supportingList(category, customs, hidden)` items — each `name` + `scheme` + a **done checkbox** (via `supportingDoneRepo.toggle`, reflecting `forDate(today)`) + a **remove** (×) control (built-in → `hiddenSupportingRepo.add`; custom → `customExerciseRepo.remove`), and an **"＋ Add exercise"** per category (name + optional scheme → `customExerciseRepo.add({category,name,scheme})`). All changes reload from the repos and persist.

- [ ] **Step 1: Failing test** — render SupportingLifts (press) in SettingsProvider; expand; a catalog item (e.g. "Dips") shows under Push; add a custom "JM Press" → it appears + `customExerciseRepo.all()` has it; remove a built-in ("Dips") → it disappears + `hiddenSupportingRepo.all()` has it; check an item → `supportingDoneRepo.forDate(today)` has it, uncheck → gone.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement.** Run → PASS.
- [ ] **Step 4: Commit** — `git commit -am "feat(ui): SupportingLifts checklist (ideas, add/remove/done, BBB)"`

---

### Task 4: WeekTabs + rebuilt Home (cycle overview)

**Files:** Create `src/ui/components/WeekTabs.tsx`; rewrite `src/ui/screens/Home.tsx`; update `src/ui/screens/Home.test.tsx`.

**Behavior:** `WeekTabs({ week, onChange })` — segmented Week 1 · 5s / Week 2 · 3s / Week 3 · 5/3/1 / Deload · easy. `Home`: load active cycle + lifts + profile + `useSettings()`; if all 4 lifts have a week-4 session → route `/cycle-end` (as today). State `selectedWeek` defaults to `nextUp(loggedSessions).week`. Render: title row ("5/3/1 · Wendler strength cycle" + `Cycle N`), the week's protocol line, `<WeekTabs>`, then the 4 `<LiftCard>`s (order press→bench→squat→deadlift, `dayNumber` = index+1) for `selectedWeek`, each gated-in `ExerciseDemo`/`SupportingLifts` via settings. A compact rest timer (existing `useRestTimer`) stays available when `settings.restTimer.enabled`. Remove the pick-your-workout selector and the old `AssistanceSection` usage. Bottom nav unchanged (Today active).

- [ ] **Step 1: Failing tests** — new Home (within SettingsProvider, seeded cycle): shows all 4 lift names as cards for the current week; `WeekTabs` switches `selectedWeek` (e.g. clicking "Deload" shows the deload weights); still routes to `/cycle-end` when week-4 is complete. Update/replace the old Home tests that assumed the single-lift selector.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement `WeekTabs` + rewrite `Home`.** Run → PASS.
- [ ] **Step 4: Commit** — `git commit -am "feat(ui): cycle-overview Home with week tabs + all-lift cards"`

---

### Task 5: Settings cleanup + full-suite integration

**Files:** Modify `src/ui/screens/Settings.tsx`, `Settings.test.tsx`; remove `src/ui/components/AssistanceSection.tsx` (+ its test) if now unused; touch any file still importing removed pieces.

**Behavior:** retire the **plate-breakdown** display toggle (plates are always shown now) — remove it from the Settings UI and from the display resolver usage on Home (leave the `DisplayElement` type alone to avoid churn, just stop surfacing/depending on it). Repurpose the **assistance tracking** toggle to gate the new **Supporting lifts** (label it "Supporting lifts" if clearer). Ensure nothing references the deleted `AssistanceSection`. Keep bodyweight/theme/rounding/templates/rest-timer/notes/demos toggles working.

- [ ] **Step 1: Failing/adjusted tests** — Settings no longer renders the plate-breakdown toggle; the supporting-lifts (assistance) toggle still persists; no dangling imports. Run the FULL suite.
- [ ] **Step 2: Implement.** `npm test` all green (run 2–3x), `npx tsc -b` clean.
- [ ] **Step 3: Commit** — `git commit -am "chore(ui): retire plate toggle, wire supporting-lifts toggle, remove old AssistanceSection"`

---

## Self-Review
**Spec coverage:** week tabs + protocol (Task 4) ✓; per-lift cards with set table + per-set plates + AMRAP highlight + inline logging saving Sessions (Task 2) ✓; supporting-lifts checklist with BBB + categorized ideas + add-custom + remove-any + done-persist (Tasks 1,3) ✓; replaces selector + dropdown assistance (Tasks 4,5) ✓; progression/cycle-end preserved (Task 2,4) ✓; orange theme (all UI tasks) ✓; History/Settings/demos/bodyweight preserved (Task 5) ✓.
**Placeholder scan:** none — Task 1 has concrete interfaces + catalog + tests; UI tasks (2–4) have concrete interfaces, behaviors, and test assertions; Task 5 is a targeted cleanup.
**Type consistency:** `SupportingItem`/`SUPPORTING_CATALOG`/`categoriesForLift`/`bbbFor`/`supportingList`, `HiddenSupporting`/`SupportingDone`/repos, `LiftCard`/`SupportingLifts`/`WeekTabs` props consistent across tasks; `CustomExercise.scheme?` added Task 1, used Task 3; `Session`/`buildWorkout`/`computePlates` reused unchanged.
**Notes for executor:** additive v5 only. Preserve the Session-save + cycle-end logic verbatim from the current Home (this is a re-layout, not a logic change). Await loaded settings in tests. This is a big visual change — after Task 4 (and again after Task 5) do a dev-server screenshot QA (week tabs, all-lift cards with plates, AMRAP orange highlight, an expanded supporting-lifts list) in dark mode; the owner will review the look before merge.
