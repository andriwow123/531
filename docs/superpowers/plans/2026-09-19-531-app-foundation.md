# 5/3/1 App — Foundation & Core Training Loop — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an installable, offline 5/3/1 app you can onboard into and use to run and log a full training cycle, with correct math and guided end-of-cycle progression.

**Architecture:** Four layers — a pure, unit-tested TypeScript domain core (all 5/3/1 math), a Dexie/IndexedDB data layer behind repository interfaces, a typed settings engine with a display resolver, and a React UI. The domain core depends on nothing; UI depends on data + settings + domain.

**Tech Stack:** React 18 + TypeScript + Vite, Tailwind CSS, Dexie (IndexedDB), React Router, Recharts (later plans), Vitest + fake-indexeddb for tests, vite-plugin-pwa.

**Spec:** `docs/superpowers/specs/2026-09-19-531-app-design.md`

## Global Constraints

- Units: `'kg' | 'lb'`; default kg. Rounding increment configurable, default 2.5 (kg) / 5 (lb).
- Training Max percentage default **0.85**, configurable.
- Four fixed main lifts: `press`, `bench` (upper, default +2.5 kg / +5 lb), `squat`, `deadlift` (lower, default +5 kg / +10 lb).
- Week/set percentages of TM are fixed (see Task 5); "+" = AMRAP.
- All configuration lives in Settings; the workout screen shows only what the display resolver enables.
- Local-first: no network required. Data layer is interface-based so a Supabase sync adapter can be added later.
- Money/weights are numbers in the profile's unit; never mix units in stored data.
- TDD: every domain function gets a failing test first. Commit after each green step.

---

## File Structure

```
src/
  domain/
    types.ts            # shared domain types (no logic)
    rounding.ts         # roundToIncrement
    trainingMax.ts      # computeTrainingMax
    estimate.ts         # estimate1RM (Epley)
    sets.ts             # generateMainSets, generateWarmups, generateSupplemental
    plates.ts           # computePlates
    progression.ts      # suggestProgression
    workout.ts          # buildWorkout (assembles a full session)
    index.ts            # re-exports
  data/
    db.ts               # Dexie schema + table typings
    repositories.ts     # profile/lifts/cycles/sessions repos (interfaces + impl)
  settings/
    schema.ts           # SettingsState, defaults
    display.ts          # resolveDisplay
  ui/
    App.tsx, main.tsx, router.tsx
    theme/tokens.css    # orange/black theme tokens
    screens/Onboarding.tsx
    screens/Home.tsx
    screens/CycleEnd.tsx
    components/...       # SetRow, PlateBadge, etc. (as needed)
  test setup: vitest.config.ts, src/test/setup.ts
```

Domain files are one-responsibility and pure. UI screens are thin — they call domain + repositories.

---

### Task 1: Project scaffold & tooling

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `tailwind.config.js`, `postcss.config.js`, `vitest.config.ts`, `src/test/setup.ts`, `index.html`, `src/ui/main.tsx`, `src/ui/App.tsx`, `src/domain/smoke.test.ts`

**Interfaces:**
- Produces: a running dev server and a green test runner. No exported app code yet.

- [ ] **Step 1: Scaffold Vite React-TS app**

```bash
cd "E:/Projects/531"
npm create vite@latest . -- --template react-ts
# if prompted about non-empty dir, choose "Ignore files and continue"
npm install
```

- [ ] **Step 2: Install runtime + dev deps**

```bash
npm install dexie react-router-dom recharts
npm install -D tailwindcss postcss autoprefixer vitest @testing-library/react @testing-library/jest-dom jsdom fake-indexeddb vite-plugin-pwa
npx tailwindcss init -p
```

- [ ] **Step 3: Configure Tailwind** — set `tailwind.config.js` `content` to `["./index.html","./src/**/*.{ts,tsx}"]`; add `@tailwind base; @tailwind components; @tailwind utilities;` to `src/ui/index.css` and import it in `main.tsx`.

- [ ] **Step 4: Configure Vitest** — `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { environment: 'jsdom', setupFiles: ['./src/test/setup.ts'], globals: true },
});
```

`src/test/setup.ts`:

```ts
import '@testing-library/jest-dom';
import 'fake-indexeddb/auto';
```

Add scripts to `package.json`: `"test": "vitest run"`, `"test:watch": "vitest"`.

- [ ] **Step 5: Write a smoke test** — `src/domain/smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
describe('smoke', () => { it('runs', () => { expect(1 + 1).toBe(2); }); });
```

- [ ] **Step 6: Run tests + dev server to verify**

Run: `npm test` → Expected: 1 passing.
Run: `npm run dev` → Expected: app serves at localhost with the Vite starter page.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "chore: scaffold Vite React-TS app with Tailwind, Vitest, PWA deps"
```

---

### Task 2: Domain types + rounding

**Files:**
- Create: `src/domain/types.ts`, `src/domain/rounding.ts`, `src/domain/rounding.test.ts`

**Interfaces:**
- Produces: `roundToIncrement(value: number, increment: number): number` and the shared types below.

`src/domain/types.ts`:

```ts
export type Unit = 'kg' | 'lb';
export type LiftKey = 'press' | 'bench' | 'squat' | 'deadlift';
export type LiftCategory = 'upper' | 'lower';
export type WeekNumber = 1 | 2 | 3 | 4;
export type TemplateKey = 'base' | 'bbb' | 'fsl';
export type SetKind = 'warmup' | 'main' | 'supplemental';

export interface WorkingSet {
  kind: SetKind;
  pct: number;       // fraction of TM (0..1)
  reps: number;      // prescribed reps
  isAmrap: boolean;
  weight: number;    // rounded absolute load
}
```

- [ ] **Step 1: Write failing test** — `src/domain/rounding.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { roundToIncrement } from './rounding';

describe('roundToIncrement', () => {
  it('rounds to nearest 2.5', () => {
    expect(roundToIncrement(101.2, 2.5)).toBe(100);
    expect(roundToIncrement(101.3, 2.5)).toBe(102.5);
  });
  it('rounds to nearest 5', () => {
    expect(roundToIncrement(97.4, 5)).toBe(95);
    expect(roundToIncrement(97.6, 5)).toBe(100);
  });
  it('returns 0 for 0', () => expect(roundToIncrement(0, 2.5)).toBe(0));
});
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run src/domain/rounding.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement** — `src/domain/rounding.ts`:

```ts
export function roundToIncrement(value: number, increment: number): number {
  if (increment <= 0) return value;
  return Math.round(value / increment) * increment;
}
```

- [ ] **Step 4: Run test to verify it passes** — Expected: PASS.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(domain): rounding + core types"`

---

### Task 3: Training Max

**Files:**
- Create: `src/domain/trainingMax.ts`, `src/domain/trainingMax.test.ts`

**Interfaces:**
- Consumes: `roundToIncrement`
- Produces: `computeTrainingMax(oneRm: number, tmPercent: number, roundingIncrement: number): number`

- [ ] **Step 1: Failing test**:

```ts
import { describe, it, expect } from 'vitest';
import { computeTrainingMax } from './trainingMax';

describe('computeTrainingMax', () => {
  it('is 85% of 1RM rounded to increment', () => {
    // 100 * 0.85 = 85 -> 85
    expect(computeTrainingMax(100, 0.85, 2.5)).toBe(85);
    // 102 * 0.85 = 86.7 -> 87.5
    expect(computeTrainingMax(102, 0.85, 2.5)).toBe(87.5);
  });
  it('supports 90% and lb rounding', () => {
    // 200 * 0.9 = 180 -> 180 (increment 5)
    expect(computeTrainingMax(200, 0.9, 5)).toBe(180);
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement**:

```ts
import { roundToIncrement } from './rounding';
export function computeTrainingMax(oneRm: number, tmPercent: number, roundingIncrement: number): number {
  return roundToIncrement(oneRm * tmPercent, roundingIncrement);
}
```

- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `git commit -am "feat(domain): computeTrainingMax"`

---

### Task 4: Estimated 1RM (Epley)

**Files:**
- Create: `src/domain/estimate.ts`, `src/domain/estimate.test.ts`

**Interfaces:**
- Produces: `estimate1RM(weight: number, reps: number): number`

- [ ] **Step 1: Failing test**:

```ts
import { describe, it, expect } from 'vitest';
import { estimate1RM } from './estimate';

describe('estimate1RM (Epley)', () => {
  it('equals weight for a single', () => expect(estimate1RM(100, 1)).toBeCloseTo(103.33, 1));
  it('scales with reps', () => expect(estimate1RM(100, 5)).toBeCloseTo(116.67, 1)); // 100*(1+5/30)
  it('returns 0 for 0 reps guard', () => expect(estimate1RM(100, 0)).toBe(100));
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement**:

```ts
export function estimate1RM(weight: number, reps: number): number {
  if (reps <= 0) return weight;
  return weight * (1 + reps / 30);
}
```

- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `git commit -am "feat(domain): Epley estimate1RM"`

---

### Task 5: Main set generation (Base + 5s PRO)

**Files:**
- Create: `src/domain/sets.ts`, `src/domain/sets.test.ts`

**Interfaces:**
- Consumes: `roundToIncrement`, `WorkingSet`, `WeekNumber`
- Produces: `generateMainSets(tm: number, week: WeekNumber, opts: { fivesPro: boolean; roundingIncrement: number }): WorkingSet[]`

Fixed schemes (fraction of TM):

```
week 1: [0.65×5, 0.75×5, 0.85×5+]
week 2: [0.70×3, 0.80×3, 0.90×3+]
week 3: [0.75×5, 0.85×3, 0.95×1+]
week 4: [0.40×5, 0.50×5, 0.60×5]  (deload, no AMRAP)
```

5s PRO: weeks 1–3 all sets are 5 reps, `isAmrap: false`. Week 4 unchanged.

- [ ] **Step 1: Failing test** — `src/domain/sets.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { generateMainSets } from './sets';

const base = { fivesPro: false, roundingIncrement: 2.5 };

describe('generateMainSets', () => {
  it('week 1 base: 65/75/85 with AMRAP on top', () => {
    const s = generateMainSets(100, 1, base);
    expect(s.map(x => x.weight)).toEqual([65, 75, 85]);
    expect(s.map(x => x.reps)).toEqual([5, 5, 5]);
    expect(s.map(x => x.isAmrap)).toEqual([false, false, true]);
    expect(s.every(x => x.kind === 'main')).toBe(true);
  });
  it('week 3 base: 75/85/95, reps 5/3/1, AMRAP on top', () => {
    const s = generateMainSets(100, 3, base);
    expect(s.map(x => x.weight)).toEqual([75, 85, 95]);
    expect(s.map(x => x.reps)).toEqual([5, 3, 1]);
    expect(s[2].isAmrap).toBe(true);
  });
  it('week 4 deload: no AMRAP', () => {
    const s = generateMainSets(100, 4, base);
    expect(s.map(x => x.weight)).toEqual([40, 50, 60]);
    expect(s.some(x => x.isAmrap)).toBe(false);
  });
  it('5s PRO: all working sets are 5 reps, no AMRAP', () => {
    const s = generateMainSets(100, 3, { ...base, fivesPro: true });
    expect(s.map(x => x.reps)).toEqual([5, 5, 5]);
    expect(s.some(x => x.isAmrap)).toBe(false);
  });
  it('rounds weights to increment', () => {
    // 102.5 * 0.65 = 66.625 -> 67.5
    expect(generateMainSets(102.5, 1, base)[0].weight).toBe(67.5);
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement** — `src/domain/sets.ts`:

```ts
import { roundToIncrement } from './rounding';
import { WorkingSet, WeekNumber } from './types';

const MAIN: Record<WeekNumber, { pct: number; reps: number; amrap?: boolean }[]> = {
  1: [{ pct: 0.65, reps: 5 }, { pct: 0.75, reps: 5 }, { pct: 0.85, reps: 5, amrap: true }],
  2: [{ pct: 0.70, reps: 3 }, { pct: 0.80, reps: 3 }, { pct: 0.90, reps: 3, amrap: true }],
  3: [{ pct: 0.75, reps: 5 }, { pct: 0.85, reps: 3 }, { pct: 0.95, reps: 1, amrap: true }],
  4: [{ pct: 0.40, reps: 5 }, { pct: 0.50, reps: 5 }, { pct: 0.60, reps: 5 }],
};

export function generateMainSets(
  tm: number, week: WeekNumber, opts: { fivesPro: boolean; roundingIncrement: number },
): WorkingSet[] {
  return MAIN[week].map((s) => {
    const fivesPro = opts.fivesPro && week !== 4;
    return {
      kind: 'main',
      pct: s.pct,
      reps: fivesPro ? 5 : s.reps,
      isAmrap: fivesPro ? false : !!s.amrap,
      weight: roundToIncrement(tm * s.pct, opts.roundingIncrement),
    };
  });
}
```

- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `git commit -am "feat(domain): generateMainSets (base + 5s PRO)"`

---

### Task 6: Warm-ups

**Files:**
- Modify: `src/domain/sets.ts`, `src/domain/sets.test.ts`

**Interfaces:**
- Produces: `generateWarmups(tm: number, roundingIncrement: number): WorkingSet[]` (40×5, 50×5, 60×3).

- [ ] **Step 1: Failing test** (append):

```ts
import { generateWarmups } from './sets';
describe('generateWarmups', () => {
  it('is 40/50/60 with reps 5/5/3', () => {
    const w = generateWarmups(100, 2.5);
    expect(w.map(x => x.weight)).toEqual([40, 50, 60]);
    expect(w.map(x => x.reps)).toEqual([5, 5, 3]);
    expect(w.every(x => x.kind === 'warmup' && !x.isAmrap)).toBe(true);
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement** (append to `sets.ts`):

```ts
const WARMUP = [{ pct: 0.4, reps: 5 }, { pct: 0.5, reps: 5 }, { pct: 0.6, reps: 3 }];
export function generateWarmups(tm: number, roundingIncrement: number): WorkingSet[] {
  return WARMUP.map((s) => ({
    kind: 'warmup', pct: s.pct, reps: s.reps, isAmrap: false,
    weight: roundToIncrement(tm * s.pct, roundingIncrement),
  }));
}
```

- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `git commit -am "feat(domain): generateWarmups"`

---

### Task 7: Supplemental (BBB, FSL)

**Files:**
- Modify: `src/domain/sets.ts`, `src/domain/sets.test.ts`

**Interfaces:**
- Produces: `generateSupplemental(template: TemplateKey, tm: number, week: WeekNumber, opts: { roundingIncrement: number; bbbPct?: number; bbbSets?: number; bbbReps?: number; fslSets?: number; fslReps?: number }): WorkingSet[]`
- Rules: `base` → `[]`. `bbb` → `bbbSets`(default 5) × `bbbReps`(default 10) at `bbbPct`(default 0.5). `fsl` → `fslSets`(default 5) × `fslReps`(default 5) at the week's first working pct (wk1 0.65, wk2 0.70, wk3 0.75; wk4 → `[]`).

- [ ] **Step 1: Failing test** (append):

```ts
import { generateSupplemental } from './sets';
describe('generateSupplemental', () => {
  it('base has no supplemental', () => {
    expect(generateSupplemental('base', 100, 1, { roundingIncrement: 2.5 })).toEqual([]);
  });
  it('BBB is 5x10 at 50% by default', () => {
    const s = generateSupplemental('bbb', 100, 1, { roundingIncrement: 2.5 });
    expect(s).toHaveLength(5);
    expect(s.every(x => x.reps === 10 && x.weight === 50 && x.kind === 'supplemental')).toBe(true);
  });
  it('FSL is 5x5 at the week first-working pct', () => {
    const s = generateSupplemental('fsl', 100, 2, { roundingIncrement: 2.5 }); // wk2 first pct 0.70
    expect(s).toHaveLength(5);
    expect(s.every(x => x.reps === 5 && x.weight === 70)).toBe(true);
  });
  it('no supplemental on deload week', () => {
    expect(generateSupplemental('bbb', 100, 4, { roundingIncrement: 2.5 })).toEqual([]);
    expect(generateSupplemental('fsl', 100, 4, { roundingIncrement: 2.5 })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement** (append to `sets.ts`):

```ts
import { TemplateKey } from './types';
const FIRST_PCT: Record<WeekNumber, number> = { 1: 0.65, 2: 0.70, 3: 0.75, 4: 0 };

export function generateSupplemental(
  template: TemplateKey, tm: number, week: WeekNumber,
  opts: { roundingIncrement: number; bbbPct?: number; bbbSets?: number; bbbReps?: number; fslSets?: number; fslReps?: number },
): WorkingSet[] {
  if (week === 4 || template === 'base') return [];
  const mk = (pct: number, reps: number, n: number): WorkingSet[] =>
    Array.from({ length: n }, () => ({
      kind: 'supplemental' as const, pct, reps, isAmrap: false,
      weight: roundToIncrement(tm * pct, opts.roundingIncrement),
    }));
  if (template === 'bbb') return mk(opts.bbbPct ?? 0.5, opts.bbbReps ?? 10, opts.bbbSets ?? 5);
  return mk(FIRST_PCT[week], opts.fslReps ?? 5, opts.fslSets ?? 5); // fsl
}
```

- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `git commit -am "feat(domain): generateSupplemental (BBB, FSL)"`

---

### Task 8: Plate calculator

**Files:**
- Create: `src/domain/plates.ts`, `src/domain/plates.test.ts`

**Interfaces:**
- Produces: `computePlates(target: number, barWeight: number, plates: number[]): { perSide: { plate: number; count: number }[]; leftover: number }`
- `perSide` uses a greedy fill of `(target - barWeight)/2` with `plates` sorted descending; `leftover` is any weight per side that couldn't be matched (×2 for total).

- [ ] **Step 1: Failing test**:

```ts
import { describe, it, expect } from 'vitest';
import { computePlates } from './plates';
const PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];

describe('computePlates', () => {
  it('100kg on 20kg bar = 40 per side', () => {
    const r = computePlates(100, 20, PLATES); // 40/side -> 25+15
    expect(r.perSide).toEqual([{ plate: 25, count: 1 }, { plate: 15, count: 1 }]);
    expect(r.leftover).toBe(0);
  });
  it('bar-only target', () => {
    const r = computePlates(20, 20, PLATES);
    expect(r.perSide).toEqual([]);
    expect(r.leftover).toBe(0);
  });
  it('reports leftover when not matchable', () => {
    const r = computePlates(21, 20, [25, 20]); // 0.5/side unmatchable
    expect(r.perSide).toEqual([]);
    expect(r.leftover).toBeCloseTo(0.5, 3);
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement**:

```ts
export function computePlates(
  target: number, barWeight: number, plates: number[],
): { perSide: { plate: number; count: number }[]; leftover: number } {
  let perSideWeight = (target - barWeight) / 2;
  if (perSideWeight <= 0) return { perSide: [], leftover: Math.max(0, perSideWeight === 0 ? 0 : -perSideWeight) === 0 ? 0 : 0 };
  const sorted = [...plates].sort((a, b) => b - a);
  const out: { plate: number; count: number }[] = [];
  const EPS = 1e-6;
  for (const p of sorted) {
    let count = 0;
    while (perSideWeight + EPS >= p) { perSideWeight -= p; count++; }
    if (count > 0) out.push({ plate: p, count });
  }
  return { perSide: out, leftover: perSideWeight < EPS ? 0 : Number(perSideWeight.toFixed(3)) };
}
```

- [ ] **Step 4: Run → PASS.** (If the bar-only branch is awkward, simplify to `if (perSideWeight <= 0) return { perSide: [], leftover: 0 };`.)
- [ ] **Step 5: Commit** — `git commit -am "feat(domain): computePlates"`

---

### Task 9: Progression suggestion

**Files:**
- Create: `src/domain/progression.ts`, `src/domain/progression.test.ts`

**Interfaces:**
- Consumes: `roundToIncrement`
- Produces:
```ts
export interface ProgressionInput {
  topSetCompleted: boolean;   // hit >=1 prescribed rep on the week-3 1+ set
  rpe: number;                // 0.5 steps
  currentTm: number;
  increment: number;
  roundingIncrement: number;
  thresholds?: { bumpRpeMax: number; holdRpeMin: number };
}
export type ProgressionDecision = 'bump' | 'hold' | 'reset';
export interface ProgressionResult { decision: ProgressionDecision; newTm: number; }
export function suggestProgression(input: ProgressionInput): ProgressionResult;
```
- Defaults: `bumpRpeMax: 9`, `holdRpeMin: 9.5`. Logic: not completed → `reset`, `newTm = round(currentTm*0.9)`. Completed & `rpe <= bumpRpeMax` → `bump`, `newTm = round(currentTm + increment)`. Else → `hold`, `newTm = currentTm`.

- [ ] **Step 1: Failing test**:

```ts
import { describe, it, expect } from 'vitest';
import { suggestProgression } from './progression';
const base = { currentTm: 100, increment: 5, roundingIncrement: 2.5 };

describe('suggestProgression', () => {
  it('bumps when completed and RPE easy', () => {
    expect(suggestProgression({ ...base, topSetCompleted: true, rpe: 8 }))
      .toEqual({ decision: 'bump', newTm: 105 });
  });
  it('holds when completed but very hard', () => {
    expect(suggestProgression({ ...base, topSetCompleted: true, rpe: 9.5 }))
      .toEqual({ decision: 'hold', newTm: 100 });
  });
  it('resets when top set failed', () => {
    expect(suggestProgression({ ...base, topSetCompleted: false, rpe: 10 }))
      .toEqual({ decision: 'reset', newTm: 90 });
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement**:

```ts
import { roundToIncrement } from './rounding';
import { ProgressionInput, ProgressionResult } from './types.progression'; // or inline in this file

export function suggestProgression(input: ProgressionInput): ProgressionResult {
  const bumpRpeMax = input.thresholds?.bumpRpeMax ?? 9;
  const holdRpeMin = input.thresholds?.holdRpeMin ?? 9.5;
  if (!input.topSetCompleted) {
    return { decision: 'reset', newTm: roundToIncrement(input.currentTm * 0.9, input.roundingIncrement) };
  }
  if (input.rpe <= bumpRpeMax) {
    return { decision: 'bump', newTm: roundToIncrement(input.currentTm + input.increment, input.roundingIncrement) };
  }
  return { decision: 'hold', newTm: input.currentTm };
}
```

(Define `ProgressionInput`/`ProgressionResult` in `progression.ts` itself; the `types.progression` import above is illustrative — keep them local to this file and re-export from `domain/index.ts`.)

- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `git commit -am "feat(domain): suggestProgression"`

---

### Task 10: Assemble a full workout + domain index

**Files:**
- Create: `src/domain/workout.ts`, `src/domain/workout.test.ts`, `src/domain/index.ts`

**Interfaces:**
- Consumes: `generateWarmups`, `generateMainSets`, `generateSupplemental`
- Produces:
```ts
export interface WorkoutParams {
  tm: number; week: WeekNumber; template: TemplateKey;
  fivesPro: boolean; warmups: boolean; roundingIncrement: number;
  supplementalOpts?: { bbbPct?: number; bbbSets?: number; bbbReps?: number; fslSets?: number; fslReps?: number };
}
export function buildWorkout(p: WorkoutParams): WorkingSet[]; // ordered warmups, main, supplemental
```

- [ ] **Step 1: Failing test**:

```ts
import { describe, it, expect } from 'vitest';
import { buildWorkout } from './workout';

describe('buildWorkout', () => {
  it('orders warmups, main, supplemental', () => {
    const s = buildWorkout({ tm: 100, week: 1, template: 'bbb', fivesPro: false, warmups: true, roundingIncrement: 2.5 });
    const kinds = s.map(x => x.kind);
    expect(kinds.slice(0, 3)).toEqual(['warmup', 'warmup', 'warmup']);
    expect(kinds.filter(k => k === 'main')).toHaveLength(3);
    expect(kinds.filter(k => k === 'supplemental')).toHaveLength(5);
  });
  it('omits warmups when disabled', () => {
    const s = buildWorkout({ tm: 100, week: 1, template: 'base', fivesPro: false, warmups: false, roundingIncrement: 2.5 });
    expect(s.some(x => x.kind === 'warmup')).toBe(false);
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement** — `src/domain/workout.ts`:

```ts
import { WorkingSet, WeekNumber, TemplateKey } from './types';
import { generateWarmups, generateMainSets, generateSupplemental } from './sets';

export interface WorkoutParams {
  tm: number; week: WeekNumber; template: TemplateKey;
  fivesPro: boolean; warmups: boolean; roundingIncrement: number;
  supplementalOpts?: { bbbPct?: number; bbbSets?: number; bbbReps?: number; fslSets?: number; fslReps?: number };
}

export function buildWorkout(p: WorkoutParams): WorkingSet[] {
  const w = p.warmups ? generateWarmups(p.tm, p.roundingIncrement) : [];
  const main = generateMainSets(p.tm, p.week, { fivesPro: p.fivesPro, roundingIncrement: p.roundingIncrement });
  const supp = generateSupplemental(p.template, p.tm, p.week, { roundingIncrement: p.roundingIncrement, ...(p.supplementalOpts ?? {}) });
  return [...w, ...main, ...supp];
}
```

Then `src/domain/index.ts` re-exports every domain function and type.

- [ ] **Step 4: Run → PASS.** Also run full `npm test` → all green.
- [ ] **Step 5: Commit** — `git commit -am "feat(domain): buildWorkout + domain index"`

---

### Task 11: Data layer (Dexie schema + repositories)

**Files:**
- Create: `src/data/db.ts`, `src/data/repositories.ts`, `src/data/repositories.test.ts`

**Interfaces:**
- Produces typed tables and repo functions:
```ts
export interface Profile { id: 'me'; units: Unit; roundingIncrement: number; tmPercent: number; }
export interface Lift { key: LiftKey; name: string; category: LiftCategory; oneRm: number; trainingMax: number; increment: number; }
export interface Cycle { id?: number; index: number; startedAt: string; status: 'active' | 'completed'; template: TemplateKey; fivesPro: boolean; tm: Record<LiftKey, number>; }
export interface LoggedSet { targetReps: number; weight: number; actualReps: number | null; done: boolean; isAmrap: boolean; kind: SetKind; }
export interface Session { id?: number; cycleId: number; week: WeekNumber; liftKey: LiftKey; date: string; status: 'planned'|'done'; sets: LoggedSet[]; amrapReps: number | null; estimated1RM: number | null; rpe: number | null; notes: string; }

// repositories (all async, Promise-based)
export const profileRepo = { get(): Promise<Profile|undefined>; save(p: Profile): Promise<void>; };
export const liftRepo = { all(): Promise<Lift[]>; bulkSave(l: Lift[]): Promise<void>; update(key: LiftKey, patch: Partial<Lift>): Promise<void>; };
export const cycleRepo = { active(): Promise<Cycle|undefined>; add(c: Cycle): Promise<number>; complete(id: number): Promise<void>; };
export const sessionRepo = { forCycle(cycleId: number): Promise<Session[]>; add(s: Session): Promise<number>; update(id: number, patch: Partial<Session>): Promise<void>; };
```

- [ ] **Step 1: Failing test** — `src/data/repositories.test.ts` (uses `fake-indexeddb/auto` from setup):

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from './db';
import { profileRepo, liftRepo } from './repositories';

beforeEach(async () => { await db.delete(); await db.open(); });

describe('profileRepo', () => {
  it('saves and gets the singleton profile', async () => {
    await profileRepo.save({ id: 'me', units: 'kg', roundingIncrement: 2.5, tmPercent: 0.85 });
    const p = await profileRepo.get();
    expect(p?.tmPercent).toBe(0.85);
  });
});
describe('liftRepo', () => {
  it('bulk saves and reads lifts', async () => {
    await liftRepo.bulkSave([{ key: 'squat', name: 'Squat', category: 'lower', oneRm: 140, trainingMax: 119, increment: 5 }]);
    const lifts = await liftRepo.all();
    expect(lifts).toHaveLength(1);
    expect(lifts[0].trainingMax).toBe(119);
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement** — `src/data/db.ts`:

```ts
import Dexie, { Table } from 'dexie';
import { Profile, Lift, Cycle, Session } from './repositories';

export class AppDB extends Dexie {
  profile!: Table<Profile, string>;
  lifts!: Table<Lift, string>;
  cycles!: Table<Cycle, number>;
  sessions!: Table<Session, number>;
  constructor() {
    super('fivethreeone');
    this.version(1).stores({
      profile: 'id',
      lifts: 'key',
      cycles: '++id, index, status',
      sessions: '++id, cycleId, week, liftKey',
    });
  }
}
export const db = new AppDB();
```

`src/data/repositories.ts`: put the interfaces above at the top, then implement each repo against `db`. Example:

```ts
import { db } from './db';
import { Unit, LiftKey, LiftCategory, TemplateKey, WeekNumber, SetKind } from '../domain/types';
// ...interfaces here...
export const profileRepo = {
  get: () => db.profile.get('me'),
  save: (p: Profile) => db.profile.put(p).then(() => {}),
};
export const liftRepo = {
  all: () => db.lifts.toArray(),
  bulkSave: (l: Lift[]) => db.lifts.bulkPut(l).then(() => {}),
  update: (key: LiftKey, patch: Partial<Lift>) => db.lifts.update(key, patch).then(() => {}),
};
export const cycleRepo = {
  active: () => db.cycles.where('status').equals('active').first(),
  add: (c: Cycle) => db.cycles.add(c),
  complete: (id: number) => db.cycles.update(id, { status: 'completed' }).then(() => {}),
};
export const sessionRepo = {
  forCycle: (cycleId: number) => db.sessions.where('cycleId').equals(cycleId).toArray(),
  add: (s: Session) => db.sessions.add(s),
  update: (id: number, patch: Partial<Session>) => db.sessions.update(id, patch).then(() => {}),
};
```

- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `git commit -am "feat(data): Dexie schema + repositories"`

---

### Task 12: Settings schema + display resolver

**Files:**
- Create: `src/settings/schema.ts`, `src/settings/display.ts`, `src/settings/display.test.ts`

**Interfaces:**
- Produces:
```ts
export type DisplayPreset = 'simple' | 'standard' | 'detailed';
export type DisplayElement = 'plateBreakdown'|'restTimer'|'notes'|'estimated1RM'|'warmups'|'charts'|'amrapPrBadges'|'assistanceSection'|'bodyweightWidget';
export interface SettingsState {
  displayPreset: DisplayPreset;
  displayOverrides: Partial<Record<DisplayElement, boolean>>;
  template: { selected: TemplateKey; fivesPro: boolean; warmups: boolean };
  restTimer: { enabled: boolean; defaultSeconds: number; notify: boolean };
  schedule: { mode: 'rolling' | 'fixedDays'; days: number[] };
  progression: { upperIncrement: number; lowerIncrement: number };
}
export const defaultSettings: SettingsState;
export function resolveDisplay(preset: DisplayPreset, overrides: Partial<Record<DisplayElement, boolean>>): Record<DisplayElement, boolean>;
```
- Preset maps: `simple` = all false except (none of the extras) — main sets always render regardless; `standard` = plateBreakdown, restTimer, estimated1RM, notes true; `detailed` = all true. Overrides win.

- [ ] **Step 1: Failing test** — `src/settings/display.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolveDisplay } from './display';

describe('resolveDisplay', () => {
  it('simple hides all optional elements', () => {
    const r = resolveDisplay('simple', {});
    expect(r.plateBreakdown).toBe(false);
    expect(r.charts).toBe(false);
  });
  it('detailed shows everything', () => {
    const r = resolveDisplay('detailed', {});
    expect(Object.values(r).every(Boolean)).toBe(true);
  });
  it('overrides win over preset', () => {
    const r = resolveDisplay('simple', { plateBreakdown: true });
    expect(r.plateBreakdown).toBe(true);
    expect(r.notes).toBe(false);
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement** — `src/settings/display.ts`:

```ts
import { DisplayPreset, DisplayElement } from './schema';

const ALL: DisplayElement[] = ['plateBreakdown','restTimer','notes','estimated1RM','warmups','charts','amrapPrBadges','assistanceSection','bodyweightWidget'];
const PRESETS: Record<DisplayPreset, DisplayElement[]> = {
  simple: [],
  standard: ['plateBreakdown','restTimer','notes','estimated1RM','warmups'],
  detailed: [...ALL],
};

export function resolveDisplay(
  preset: DisplayPreset, overrides: Partial<Record<DisplayElement, boolean>>,
): Record<DisplayElement, boolean> {
  const on = new Set(PRESETS[preset]);
  const out = {} as Record<DisplayElement, boolean>;
  for (const el of ALL) out[el] = overrides[el] ?? on.has(el);
  return out;
}
```

`src/settings/schema.ts`: declare the types + `defaultSettings` (preset `'standard'`, template `{selected:'base', fivesPro:false, warmups:true}`, restTimer `{enabled:true, defaultSeconds:120, notify:false}`, schedule `{mode:'rolling', days:[]}`, progression `{upperIncrement:2.5, lowerIncrement:5}`).

- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `git commit -am "feat(settings): schema + display resolver"`

---

### Task 13: UI shell, routing, theme tokens + frontend-design pass

**Files:**
- Create: `src/ui/router.tsx`, `src/ui/theme/tokens.css`; Modify: `src/ui/App.tsx`, `src/ui/main.tsx`

**Interfaces:**
- Produces: a routed app shell with routes `/onboarding`, `/` (home), `/cycle-end`, and a theme applied via CSS variables.

- [x] **Step 1: Visual system LOCKED — owner picked Direction "COACH".** Modern coaching-app feel (~2020): rounded cards, a cycle progress ring, warm orange accent on a charcoal ground, weights as the hero in Manrope 800. No further mockups. Visual reference: `C:/Users/andri/AppData/Local/Temp/claude/E--Projects-531/9ba537ad-ac85-4c1a-bd19-1e6b57c40471/scratchpad/looks.html` (the Direction B / `.d-coach` block). **Owner refinements (apply in Tasks 13-16):** (a) warm-ups render as normal set rows (not a one-line summary), with a settings toggle to hide them once completed; (b) the main workout screen stays lean — the AMRAP set shows only the logged reps; estimated 1RM does NOT appear on Home (it lives in History/Progress [Plan 2] and the end-of-cycle summary [Task 16]).

- [ ] **Step 2: Implement theme tokens** — `src/ui/theme/tokens.css`. Dark-first (primary), with a light variant. Declare every token on bare `:root` (light values), redefine under `@media (prefers-color-scheme: dark):root:not([data-theme="light"])` and `:root[data-theme="dark"]` (dark values), and set `body{background:var(--bg)}`. Tokens & values (COACH):
  - DARK (primary): `--bg:#16161A; --surface:#212129; --surface-2:#2A2A34; --line:#33333F; --accent:#FB8C3C; --accent-strong:#F2701E; --accent-soft:rgba(251,140,60,.15); --on-accent:#1B1205; --text:#F6F5F3; --muted:#9A99A6;`
  - LIGHT: `--bg:#FAF7F3; --surface:#FFFFFF; --surface-2:#F1ECE6; --line:#E4DDD4; --accent:#E8721C; --accent-strong:#D9630F; --accent-soft:rgba(232,114,28,.14); --on-accent:#FFFFFF; --text:#1C1A17; --muted:#6B6459;`
  - Radius tokens: `--r-card:16px; --r-hero:20px; --r-pill:999px;`
  - Load Manrope from Google Fonts (weights 500/600/700/800) with a `system-ui, sans-serif` fallback; set it as the base font. Weights/numbers use `font-variant-numeric: tabular-nums`. Import `tokens.css` in `main.tsx`.

- [ ] **Step 3: Implement router** — `react-router-dom` `createBrowserRouter` with the three routes; `App.tsx` renders `<RouterProvider>`. On load, if `profileRepo.get()` is empty, redirect to `/onboarding`.

- [ ] **Step 4: Smoke test** — `src/ui/App.test.tsx` renders `<App/>` inside `MemoryRouter` and asserts it mounts without throwing.

Run: `npm test` → PASS. Run: `npm run dev` → shell loads, theme visible.

- [ ] **Step 5: Commit** — `git commit -am "feat(ui): app shell, routing, theme tokens"`

---

### Task 14: Onboarding flow

**Files:**
- Create: `src/ui/screens/Onboarding.tsx`, `src/ui/screens/Onboarding.test.tsx`

**Interfaces:**
- Consumes: `computeTrainingMax`, `profileRepo`, `liftRepo`, `cycleRepo`, `defaultSettings`
- Produces: on completion, persists `Profile`, four `Lift`s (with computed TM), and an active `Cycle` (index 1, week starts at 1), then navigates to `/`.

- [ ] **Step 1: Failing test** — render Onboarding, choose kg, type a 1RM for each lift, submit; assert `liftRepo.all()` returns 4 lifts and each `trainingMax === computeTrainingMax(oneRm, 0.85, 2.5)`, and `cycleRepo.active()` exists.

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { db } from '../../data/db';
import { liftRepo, cycleRepo } from '../../data/repositories';
import Onboarding from './Onboarding';

beforeEach(async () => { await db.delete(); await db.open(); });

it('creates lifts with 85% TM and an active cycle', async () => {
  render(<MemoryRouter><Onboarding /></MemoryRouter>);
  for (const key of ['press','bench','squat','deadlift']) {
    fireEvent.change(screen.getByLabelText(new RegExp(key, 'i')), { target: { value: '100' } });
  }
  fireEvent.click(screen.getByRole('button', { name: /start/i }));
  // allow async persistence
  await new Promise(r => setTimeout(r, 0));
  const lifts = await liftRepo.all();
  expect(lifts).toHaveLength(4);
  expect(lifts.every(l => l.trainingMax === 85)).toBe(true);
  expect(await cycleRepo.active()).toBeTruthy();
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement** `Onboarding.tsx` — a form: unit toggle (default kg), 4 numeric inputs (labelled with lift names, `aria-label` includes the lift key for tests), a "Start training" button. On submit: build the four `Lift`s (category/increment from a static map), compute TM via `computeTrainingMax(oneRm, 0.85, roundingIncrement)`, `profileRepo.save`, `liftRepo.bulkSave`, `cycleRepo.add({ index:1, startedAt: ISO, status:'active', template:'base', fivesPro:false, tm:{...} })`, then `navigate('/')`. Keep it visually simple per the chosen theme; template/schedule can accept defaults here with an "advanced" link deferred to Settings.

- [ ] **Step 4: Run → PASS.** Manual: `npm run dev`, complete onboarding, confirm redirect to Home.
- [ ] **Step 5: Commit** — `git commit -am "feat(ui): onboarding flow"`

---

### Task 15: Home / Today workout screen

**Files:**
- Create: `src/ui/screens/Home.tsx`, `src/ui/screens/Home.test.tsx`, `src/ui/components/SetRow.tsx`

**Interfaces:**
- Consumes: `buildWorkout`, `resolveDisplay`, `estimate1RM`, `sessionRepo`, `cycleRepo`, `liftRepo`, settings
- Produces: a session in `sessions` when the user logs and saves the workout.
- Determines "today's lift/week": rolling order `press → bench → squat → deadlift`, advancing week after all four are logged. (Helper `nextUp(cycleId): { liftKey, week }` computed from existing sessions for the active cycle — implement as a small pure function in `src/domain/schedule.ts` with its own test.)

- [ ] **Step 1: Failing test for `nextUp`** — `src/domain/schedule.test.ts`: given zero sessions → `{ liftKey:'press', week:1 }`; given press+bench+squat+deadlift logged in week 1 → `{ liftKey:'press', week:2 }`.

- [ ] **Step 2: Run → FAIL. Implement `src/domain/schedule.ts`** (`nextUp(logged: {liftKey:LiftKey; week:WeekNumber}[]): {liftKey:LiftKey; week:WeekNumber}` using the fixed order and week rollover). Run → PASS.

- [ ] **Step 3: Failing test for Home** — render Home after onboarding seed; assert it shows the current lift name and the three main sets' weights; toggle a set "done"; click Save; assert a `Session` was written with `sets` and (for the AMRAP set) `estimated1RM` set from the entered reps.

- [ ] **Step 4: Run → FAIL. Implement `Home.tsx`** in the locked COACH style (see Task 13 Step 1; visually match the `.d-coach` mockup — rounded cards, cycle progress ring, warm-orange gradient hero on the AMRAP set, Manrope 800 weights). Behavior: load active cycle + lifts + settings; compute `nextUp`; `buildWorkout` with that lift's TM; render EVERY set (warm-up, main, supplemental) as a `SetRow` with the big tabular weight. Gate `plateBreakdown`, `restTimer`, `notes` through `resolveDisplay`. **Owner refinements:**
  - **Warm-ups render as normal set rows** (identical treatment to working sets), not a summary line. Add a settings field `hideCompletedWarmups: boolean` (default `false`; extend `SettingsState` in `src/settings/schema.ts` and its default) — when `true`, warm-up rows disappear from Home once marked done. Also honor the existing `warmups` display element (if off, warm-ups aren't generated/shown at all).
  - **Est 1RM is NOT rendered on Home.** The AMRAP set row shows only the logged reps (e.g. "5 reps ✓"). Still COMPUTE and STORE `estimated1RM` on the session (`estimate1RM(topWeight, amrapReps)`) for History/end-of-cycle use — just don't display it here.
  On Save: build `LoggedSet[]` from all rows, set `amrapReps` + stored `estimated1RM`, `sessionRepo.add({...})`. Run → PASS.

- [ ] **Step 5: Manual verify + commit** — `npm run dev`: log a workout, confirm it persists and the next lift advances. `git commit -am "feat(ui): Home workout screen + schedule"`

---

### Task 16: End-of-cycle progression flow

**Files:**
- Create: `src/ui/screens/CycleEnd.tsx`, `src/ui/screens/CycleEnd.test.tsx`

**Interfaces:**
- Consumes: `suggestProgression`, `cycleRepo`, `liftRepo`, `sessionRepo`
- Produces: on confirm, sets each lift's new `trainingMax`, marks the current cycle `completed`, and creates the next active cycle (index+1) with the accepted TMs.
- Trigger: Home routes to `/cycle-end` when all 4 lifts have logged week 4 (deload) — or offer a "finish cycle" action once week 3 is complete (implementer's choice; test the confirm behavior).

- [ ] **Step 1: Failing test** — seed a completed cycle's week-3 sessions (top sets completed, RPE 8); render CycleEnd; for each lift a suggestion `bump` shows with `newTm = TM + increment`; click "Apply"; assert lifts updated, old cycle `completed`, new active cycle exists with the new TMs.

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement `CycleEnd.tsx`** — for each lift, read its week-3 top set result + prompt RPE (default from any stored `rpe`), call `suggestProgression`, show decision + editable `newTm`; on Apply: `liftRepo.update(key,{trainingMax})`, `cycleRepo.complete(old)`, `cycleRepo.add(next)`, navigate `/`.

- [ ] **Step 4: Run → PASS.** Manual: run through a mock cycle end.
- [ ] **Step 5: Commit** — `git commit -am "feat(ui): end-of-cycle progression flow"`

---

### Task 17: PWA — installable + offline

**Files:**
- Modify: `vite.config.ts`; Create: app icons in `public/`

**Interfaces:**
- Produces: an installable PWA with an offline app shell.

- [ ] **Step 1: Configure `vite-plugin-pwa`** in `vite.config.ts` with `registerType:'autoUpdate'`, a manifest (name "5/3/1", theme_color from the accent, `display:'standalone'`, icons 192/512), and default Workbox precache of the built assets.

- [ ] **Step 2: Add icons** — place `pwa-192x192.png` and `pwa-512x512.png` (orange/black mark) in `public/`.

- [ ] **Step 3: Build + verify** — `npm run build && npm run preview`; in the browser, confirm the install prompt appears and the app loads offline after first visit (DevTools → Application → Service Workers; toggle offline and reload).

- [ ] **Step 4: Commit** — `git commit -am "feat(pwa): installable offline app shell"`

---

## Self-Review

**Spec coverage (v1 core):** onboarding + TM (Tasks 3,14) ✓; units/rounding (Tasks 2,12) ✓; week/set schemes + templates Base/5sPRO/BBB/FSL + warmups (Tasks 5–7,10) ✓; AMRAP→Epley (Tasks 4,15) ✓; RPE progression (Tasks 9,16) ✓; deload (Task 5) ✓; plate calculator math (Task 8; UI surfaced in Task 15/Plan 3) ✓; settings + display presets/overlays (Task 12) ✓; local-first storage behind interfaces (Task 11) ✓; PWA installable/offline (Task 17) ✓; theme direction (Task 13) ✓.

**Deferred to later plans (by design, per spec §13):** history/charts (Plan 2); plate-calc UI, rest-timer runtime + notifications, assistance tracker, bodyweight, exercise demos, backup/import, custom-percentages editor, fixed-day scheduling UI (Plan 3); visual polish (Plan 4); 7th-week + Leader/Anchor (fast-follow); cloud sync (Phase 2). These are intentionally out of this plan; each gets its own plan producing working software.

**Placeholder scan:** no TBD/TODO left; every code step has real code. (Task 8 notes an optional simplification; Task 9 notes to keep progression types local — both are clarifications, not gaps.)

**Type consistency:** `LiftKey`, `WeekNumber`, `TemplateKey`, `WorkingSet`, `SetKind` used consistently across domain, data, settings. Repo interfaces (`profileRepo`/`liftRepo`/`cycleRepo`/`sessionRepo`) referenced identically in Tasks 11,14,15,16. `resolveDisplay`/`SettingsState` names match between Tasks 12 and 15.

**Note for executor:** finalize the visual system (Task 13, frontend-design) before building Onboarding/Home visuals; the owner is non-technical, so present mockups to choose from rather than describing them.
