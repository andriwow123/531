# 5/3/1 App — Plan 4: Exercise Demos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an expandable "how to perform" demo (start/end images + step instructions) for each main lift on the workout screen, from the public-domain free-exercise-db, bundled for offline use, with a Settings toggle.

**Architecture:** A pure data module maps each `LiftKey` to a bundled exercise (name, instructions, 2 image paths); images live under `public/`; an `ExerciseDemo` component renders a collapsed-by-default expandable; Home shows it for the selected lift when the `exerciseDemos` setting is on.

**Tech Stack:** React 19 + TS, Vite (serves `public/`, PWA precaches it), Vitest. Reuse COACH theme tokens.

**Spec:** `docs/superpowers/specs/2026-09-20-531-plan4-exercise-demos-design.md`.

## Global Constraints
- Reuse COACH theme tokens only; Manrope; mobile-first; dark + light. `import type`; `tsc -b` clean; `npm test` green; all prior 110 tests stay green.
- No runtime network — images are BUNDLED under `public/exercises/`; instructions are baked into a data module. Works offline.
- Data source is public domain (free-exercise-db, Unlicense); add a small courtesy credit line.

## File Structure
```
public/exercises/<id>/{0,1}.jpg   # 8 bundled images (committed)
src/domain/exercises.ts            # EXERCISE_DEMOS + getExerciseDemo (+ .test)
src/settings/schema.ts             # + exerciseDemos: boolean (default true)
src/ui/components/ExerciseDemo.tsx  # expandable demo (+ .test)
src/ui/screens/Home.tsx             # render <ExerciseDemo> when settings.exerciseDemos
src/ui/screens/Settings.tsx         # exerciseDemos toggle
```

---

### Task 1: Bundle exercise data + images

**Files:** Create `src/domain/exercises.ts`, `src/domain/exercises.test.ts`; add `public/exercises/<id>/0.jpg` and `1.jpg` for the 4 ids.

**Interfaces:**
```ts
export interface ExerciseDemo { id: string; name: string; instructions: string[]; images: string[]; } // images = absolute app paths
export const EXERCISE_DEMOS: Record<LiftKey, ExerciseDemo>;
export function getExerciseDemo(liftKey: LiftKey): ExerciseDemo;
```
The 4 mappings (ids from free-exercise-db):
| LiftKey | id | name |
|---|---|---|
| press | `Barbell_Shoulder_Press` | Barbell Shoulder Press |
| bench | `Barbell_Bench_Press_-_Medium_Grip` | Barbell Bench Press |
| squat | `Barbell_Full_Squat` | Barbell Squat |
| deadlift | `Barbell_Deadlift` | Barbell Deadlift |

- [ ] **Step 1: Fetch the 8 images** into the repo (run from `E:/Projects/531`):
```bash
for id in Barbell_Shoulder_Press "Barbell_Bench_Press_-_Medium_Grip" Barbell_Full_Squat Barbell_Deadlift; do
  mkdir -p "public/exercises/$id"
  for n in 0 1; do
    curl -sL "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/$id/$n.jpg" -o "public/exercises/$id/$n.jpg"
  done
done
# verify each is a real JPEG (magic bytes ffd8ff) and non-trivial size:
for f in public/exercises/*/*.jpg; do echo "$f $(wc -c < "$f")"; done
```
If any file is tiny/HTML (fetch failed), retry; do NOT commit a broken image.

- [ ] **Step 2: Get the instructions** — fetch the dataset once and extract the 4 entries' `instructions` arrays (do NOT commit the big json):
```bash
curl -sL "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json" -o /tmp/fedb.json
node -e 'const ex=require("/tmp/fedb.json"); for (const id of ["Barbell_Shoulder_Press","Barbell_Bench_Press_-_Medium_Grip","Barbell_Full_Squat","Barbell_Deadlift"]) { const e=ex.find(x=>x.id===id); console.log("\n### "+id); console.log(JSON.stringify(e.instructions)); }'
```
Copy the resulting instruction arrays verbatim into the data module.

- [ ] **Step 3: Write the failing test** — `src/domain/exercises.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { EXERCISE_DEMOS, getExerciseDemo } from './exercises';
import { LIFT_ORDER } from './index';
describe('EXERCISE_DEMOS', () => {
  it('covers all 4 lifts with name, instructions, and 2 image paths', () => {
    for (const key of LIFT_ORDER) {
      const d = getExerciseDemo(key);
      expect(d.name.length).toBeGreaterThan(0);
      expect(d.instructions.length).toBeGreaterThan(0);
      expect(d.images).toHaveLength(2);
      expect(d.images.every((p) => p.startsWith('/exercises/'))).toBe(true);
    }
  });
});
```

- [ ] **Step 4: Run → FAIL.**

- [ ] **Step 5: Implement `src/domain/exercises.ts`** — the `ExerciseDemo` interface, `EXERCISE_DEMOS` with the 4 mappings (each `images: ['/exercises/<id>/0.jpg','/exercises/<id>/1.jpg']`, `instructions` copied from Step 2), and `getExerciseDemo`. Re-export from `src/domain/index.ts` if convenient.

- [ ] **Step 6: Run → PASS**, `npx tsc -b` clean.
- [ ] **Step 7: Commit** — `git add public/exercises src/domain/exercises.ts src/domain/exercises.test.ts src/domain/index.ts && git commit -m "feat(domain): bundled exercise demo data + images"`

---

### Task 2: `exerciseDemos` setting + Settings toggle

**Files:** Modify `src/settings/schema.ts`, `src/ui/screens/Settings.tsx`, `src/ui/screens/Settings.test.tsx`.

**Interfaces:** `SettingsState` gains `exerciseDemos: boolean` (default `true` in `defaultSettings`).

- [ ] **Step 1: Failing test** (in `Settings.test.tsx`, within `SettingsProvider`): toggling the "Exercise demos" switch persists `exerciseDemos` (`await settingsRepo.get()` reflects the flip). Follow the existing file's pattern (use `findByRole`/`waitFor` for the switch's loaded state before asserting — this file has async-load races; guard accordingly).
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** — add `exerciseDemos: true` to `defaultSettings` and the field to `SettingsState`; add a switch in `Settings.tsx` (Display mode section or a small "Exercises" row) wired to `updateSettings({ exerciseDemos: next })`.
- [ ] **Step 4: Run → PASS**, `tsc -b` clean.
- [ ] **Step 5: Commit** — `git commit -am "feat(settings): exerciseDemos toggle"`

---

### Task 3: `ExerciseDemo` component + Home integration

**Files:** Create `src/ui/components/ExerciseDemo.tsx`, `src/ui/components/ExerciseDemo.test.tsx`; Modify `src/ui/screens/Home.tsx`, `src/ui/screens/Home.test.tsx`.

**Interfaces:** `export default function ExerciseDemo({ liftKey }: { liftKey: LiftKey }): JSX.Element` — uses `getExerciseDemo(liftKey)`; a **collapsed-by-default** expandable: a "How to perform" button that toggles a panel showing the two images (`<img loading="lazy" alt="...">`, labeled Start / Finish) and the numbered instruction list, plus the "free-exercise-db (public domain)" credit. Theme tokens; mobile-first.

- [ ] **Step 1: Failing test** — `ExerciseDemo.test.tsx`: rendered with `liftKey="deadlift"`, the instructions are NOT in the DOM initially (collapsed); after clicking "How to perform", the lift name, both images (by alt text), and at least the first instruction appear. Assert on text/roles.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement `ExerciseDemo.tsx`** (collapsed by default; `useState` open; images + instructions on expand). Run → PASS.
- [ ] **Step 4: Integrate into Home** — in `Home.tsx`, render `<ExerciseDemo liftKey={selectedLift} />` (e.g. under the header / above or below the sets) ONLY when `settings.exerciseDemos` is true. Add a Home test (within `SettingsProvider`): with `exerciseDemos` on, the "How to perform" affordance is present; with it off (seed `settingsRepo.save({...defaultSettings, exerciseDemos:false})`), it's absent. Keep all existing Home behaviors/tests green.
- [ ] **Step 5: Run → PASS**, `npm test` all green, `tsc -b` clean.
- [ ] **Step 6: Commit** — `git commit -am "feat(ui): ExerciseDemo component + Home integration"`

---

## Self-Review
**Spec coverage:** bundled data + images (Task 1) ✓; offline (bundled, no runtime fetch) ✓; per-lift demo with images + instructions (Tasks 1,3) ✓; collapsed-by-default expandable on Home (Task 3) ✓; Settings toggle (Task 2) ✓; credit (Task 3) ✓; History/other screens unaffected ✓.
**Placeholder scan:** none — Task 1 gives exact fetch commands + the interface + test; Tasks 2–3 give concrete interfaces, behaviors, and test assertions.
**Type consistency:** `ExerciseDemo`/`EXERCISE_DEMOS`/`getExerciseDemo` and `LiftKey` used consistently; `exerciseDemos` added to `SettingsState` (Task 2) and read in Home (Task 3).
**Notes for executor:** the Settings/Home test files have known async-settings-load races — always await the loaded state (`findByRole` + `waitFor(...toBeChecked/present)`) before interacting/asserting. After Task 3, do a visual QA (dev server + screenshot) of a lift's demo expanded (images render) in dark mode.
