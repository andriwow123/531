# 5/3/1 App — Plan 6: Assistance-Work Tracker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Log assistance work on the workout screen — pick a category, choose a built-in exercise or add a custom one (persisted), enter sets × reps (+ optional weight) — with a Settings toggle.

**Architecture:** Dexie v4 `assistance` + `customExercises` stores + repos; a bundled catalog + a pure `exerciseOptions` merge helper; an `AssistanceSection` on Home gated by a new `assistanceTracking` setting.

**Tech Stack:** React 19 + TS, Dexie, Vitest. COACH theme tokens.

**Spec:** `docs/superpowers/specs/2026-09-20-531-plan6-assistance-design.md`.

## Global Constraints
- COACH theme tokens only; Manrope; mobile-first; dark + light. `import type`; `tsc -b` clean; `npm test` green; all prior 126 tests stay green.
- Dexie change is ADDITIVE at `version(4)` — keep v1/v2/v3 blocks untouched, no migration, existing data preserved.
- Settings/Home tests await the loaded settings state before interacting/asserting (known async-settings-load race).

## File Structure
```
src/data/db.ts                        # + version(4): assistance, customExercises
src/data/repositories.ts              # + assistanceRepo, customExerciseRepo + types
src/domain/assistanceCatalog.ts       # AssistanceCategory, ASSISTANCE_CATALOG, exerciseOptions (+ .test)
src/settings/schema.ts                # + assistanceTracking: boolean (default true)
src/ui/components/AssistanceSection.tsx  # add flow + today's list (+ .test)
src/ui/screens/Home.tsx               # render <AssistanceSection> when settings.assistanceTracking
src/ui/screens/Settings.tsx           # assistanceTracking toggle
```

---

### Task 1: Data + catalog + options helper

**Files:** Modify `src/data/db.ts`, `src/data/repositories.ts`; Create `src/domain/assistanceCatalog.ts`, `src/domain/assistanceCatalog.test.ts`; Modify `src/data/repositories.test.ts`, `src/domain/index.ts`.

**Interfaces:**
```ts
export type AssistanceCategory = 'push' | 'pull' | 'legs' | 'core';
export interface AssistanceEntry { id?: number; date: string; category: AssistanceCategory; name: string; sets: number; reps: number; weight: number | null; }
export interface CustomExercise { id?: number; category: AssistanceCategory; name: string; }
export const assistanceRepo = { add(e: AssistanceEntry): Promise<number>; forDate(date: string): Promise<AssistanceEntry[]>; all(): Promise<AssistanceEntry[]>; };
export const customExerciseRepo = { add(c: CustomExercise): Promise<number>; all(): Promise<CustomExercise[]>; };
export const ASSISTANCE_CATALOG: Record<AssistanceCategory, string[]>;
export function exerciseOptions(category: AssistanceCategory, customs: CustomExercise[]): string[]; // catalog[category] then this category's customs, de-duped case-insensitively
```
Catalog contents (from the spec §3): push/pull/legs/core lists (8 each).

- [ ] **Step 1: Failing tests.**
  - `repositories.test.ts` (append): `assistanceRepo.add` two entries for a date → `forDate(date)` returns them; `customExerciseRepo.add` → `all()` returns it.
  - `assistanceCatalog.test.ts`:
  ```ts
  import { describe, it, expect } from 'vitest';
  import { ASSISTANCE_CATALOG, exerciseOptions } from './assistanceCatalog';
  import type { CustomExercise } from '../data/repositories';
  describe('exerciseOptions', () => {
    it('lists the catalog for a category then its customs, de-duped', () => {
      const customs: CustomExercise[] = [
        { category: 'push', name: 'JM Press' },
        { category: 'push', name: 'Dips' }, // duplicate of a catalog item
        { category: 'pull', name: 'Rope Curl' },
      ];
      const opts = exerciseOptions('push', customs);
      expect(opts.slice(0, ASSISTANCE_CATALOG.push.length)).toEqual(ASSISTANCE_CATALOG.push);
      expect(opts).toContain('JM Press');
      expect(opts.filter((o) => o.toLowerCase() === 'dips')).toHaveLength(1); // de-duped
      expect(opts).not.toContain('Rope Curl'); // other category excluded
    });
  });
  ```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement.**
  - `db.ts`: after `version(3)`, add `this.version(4).stores({ assistance: '++id, date', customExercises: '++id, category' });` and declare both tables (`assistance!: Table<AssistanceEntry, number>`, `customExercises!: Table<CustomExercise, number>`; import types).
  - `repositories.ts`: add the two interfaces and repos:
  ```ts
  export const assistanceRepo = {
    add: (e: AssistanceEntry) => db.assistance.add(e),
    forDate: (date: string) => db.assistance.where('date').equals(date).toArray(),
    all: () => db.assistance.toArray(),
  };
  export const customExerciseRepo = {
    add: (c: CustomExercise) => db.customExercises.add(c),
    all: () => db.customExercises.toArray(),
  };
  ```
  - `assistanceCatalog.ts`:
  ```ts
  import type { AssistanceCategory, CustomExercise } from '../data/repositories';
  export const ASSISTANCE_CATALOG: Record<AssistanceCategory, string[]> = { push: [...], pull: [...], legs: [...], core: [...] };
  export function exerciseOptions(category: AssistanceCategory, customs: CustomExercise[]): string[] {
    const out: string[] = [...ASSISTANCE_CATALOG[category]];
    const seen = new Set(out.map((n) => n.toLowerCase()));
    for (const c of customs) {
      if (c.category !== category) continue;
      if (seen.has(c.name.toLowerCase())) continue;
      seen.add(c.name.toLowerCase());
      out.push(c.name);
    }
    return out;
  }
  ```
  (Move `AssistanceCategory` to `repositories.ts` or a shared types module and import it where needed; re-export catalog helpers from `src/domain/index.ts`.)

- [ ] **Step 4: Run → PASS**, `tsc -b` clean.
- [ ] **Step 5: Commit** — `git commit -am "feat(data): assistance + custom-exercise stores, catalog, options helper"`

---

### Task 2: `assistanceTracking` setting + toggle

**Files:** Modify `src/settings/schema.ts`, `src/ui/screens/Settings.tsx`, `src/ui/screens/Settings.test.tsx`.

**Interfaces:** `SettingsState` gains `assistanceTracking: boolean` (default `true`).

- [ ] **Step 1: Failing test** — a Settings toggle labeled "Assistance tracking" persists the flip (within `SettingsProvider`; await the loaded switch state before clicking, waitFor the persisted read).
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** — add `assistanceTracking: true` to `defaultSettings` + the field; a Switch/ToggleRow in `Settings.tsx` wired to `updateSettings({ assistanceTracking: next })`, matching the existing pattern.
- [ ] **Step 4: Run → PASS**, `tsc -b` clean.
- [ ] **Step 5: Commit** — `git commit -am "feat(settings): assistanceTracking toggle"`

---

### Task 3: AssistanceSection on Home

**Files:** Create `src/ui/components/AssistanceSection.tsx`, `src/ui/components/AssistanceSection.test.tsx`; Modify `src/ui/screens/Home.tsx`, `src/ui/screens/Home.test.tsx`.

**Interfaces:** `export default function AssistanceSection(): JSX.Element` — loads `customExerciseRepo.all()` + `assistanceRepo.forDate(today)`. Renders:
- **Add flow:** a category segmented control (Push/Pull/Legs/Core) → an exercise `<select>` populated from `exerciseOptions(category, customs)` PLUS an "＋ Add custom…" entry that reveals a text input; submitting it calls `customExerciseRepo.add({ category, name })`, reloads customs, and selects the new name. Numeric **sets** and **reps** inputs + an optional **weight** input. An **Add** button → `assistanceRepo.add({ date: new Date().toISOString().slice(0,10), category, name, sets, reps, weight: weight || null })`, then reload today's list and reset the sets/reps/weight inputs. Ignore incomplete adds (no exercise, or sets/reps ≤ 0).
- **Today's list:** `assistanceRepo.forDate(today)` entries, each: category · name · `sets × reps` (· weight when present). Empty when none.
- COACH tokens, mobile-first, compact (a labeled "Assistance" section, collapsible is fine).

- [ ] **Step 1: Failing tests** — `AssistanceSection.test.tsx` (fake-indexeddb reset): pick category "Pull", the select contains catalog items (e.g. "Pull-ups"); add a custom exercise "Meadows Row" → it becomes selectable AND `customExerciseRepo.all()` has it; select an exercise, set sets=3 reps=10, click Add → `assistanceRepo.forDate(today)` has 1 entry and it shows in the list as e.g. "3 × 10". (Assert text/roles.)
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement `AssistanceSection.tsx`.** Run → PASS.
- [ ] **Step 4: Integrate into Home** — render `<AssistanceSection/>` when `settings.assistanceTracking` (via `useSettings()`), below the main sets (before/after Save — your choice, kept out of the way). Add a Home test (within `SettingsProvider`): present when on; absent when off (seed `assistanceTracking:false`), awaiting loaded state. Keep all existing Home behaviors/tests green.
- [ ] **Step 5: Run → PASS**, `npm test` all green (run 2–3x for order-independence), `tsc -b` clean.
- [ ] **Step 6: Commit** — `git commit -am "feat(ui): AssistanceSection on Home"`

---

## Self-Review
**Spec coverage:** v4 stores + repos (Task 1) ✓; catalog + custom merge (Task 1) ✓; setting + toggle (Task 2) ✓; add-flow with category picklist + custom + sets×reps+weight, today's list, gated (Task 3) ✓; Home existing content unchanged ✓.
**Placeholder scan:** none (catalog contents live in the spec §3; the plan references them — the implementer copies the 8-per-category lists verbatim).
**Type consistency:** `AssistanceCategory`/`AssistanceEntry`/`CustomExercise`/repos/`exerciseOptions` consistent across tasks; `assistanceTracking` added Task 2, read Task 3.
**Notes for executor:** additive v4 only (never edit v1–v3). Settings/Home tests await loaded settings (async race). After Task 3, visual QA (dev server + screenshot): pick a category, add a custom exercise, log an entry — confirm it appears, in dark mode.
