# 5/3/1 App — Plan 5: Bodyweight Tracking — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Log bodyweight over time and show it as a card on the History tab (quick log + latest + trend chart), with a Settings toggle.

**Architecture:** A Dexie v3 `bodyweight` store + repo; pure aggregators; a Bodyweight card on History gated by a new `bodyweightTracking` setting.

**Tech Stack:** React 19 + TS, Dexie, Recharts, Vitest. COACH theme tokens.

**Spec:** `docs/superpowers/specs/2026-09-20-531-plan5-bodyweight-design.md`.

## Global Constraints
- COACH theme tokens only; Manrope; mobile-first; dark + light. `import type`; `tsc -b` clean; `npm test` green; all prior 115 tests stay green.
- Dexie change is ADDITIVE at `version(3)` — keep v1 and v2 blocks untouched, no migration, existing data preserved.
- Chart colors resolved from theme tokens at RUNTIME (getComputedStyle), like `ProgressChart` (P2-R1). Weight is in the profile's unit.
- Settings/History tests must await the loaded settings state before interacting/asserting (known async-settings-load race).

## File Structure
```
src/data/db.ts                 # + version(3) bodyweight store
src/data/repositories.ts       # + bodyweightRepo (add/all) + BodyweightEntry
src/domain/bodyweight.ts       # bodyweightSeries, latestWeight (+ .test)
src/settings/schema.ts         # + bodyweightTracking: boolean (default true)
src/ui/components/BodyweightCard.tsx  # log input + latest + chart (+ .test)
src/ui/screens/History.tsx     # render <BodyweightCard> when settings.bodyweightTracking
src/ui/screens/Settings.tsx    # bodyweightTracking toggle
```

---

### Task 1: Bodyweight persistence + aggregation

**Files:** Modify `src/data/db.ts`, `src/data/repositories.ts`; Create `src/domain/bodyweight.ts`, `src/domain/bodyweight.test.ts`; Modify `src/data/repositories.test.ts`, `src/domain/index.ts`.

**Interfaces:**
```ts
export interface BodyweightEntry { id?: number; date: string; weight: number; }
export const bodyweightRepo = { add(e: BodyweightEntry): Promise<number>; all(): Promise<BodyweightEntry[]>; };
export function bodyweightSeries(entries: BodyweightEntry[]): { date: string; weight: number }[]; // asc by date
export function latestWeight(entries: BodyweightEntry[]): number | null; // most recent by date, ties by id; null if empty
```

- [ ] **Step 1: Failing tests.**
  - `repositories.test.ts` (append): `bodyweightRepo.add` then `all()` returns the entries.
  ```ts
  describe('bodyweightRepo', () => {
    it('adds and lists bodyweight entries', async () => {
      await bodyweightRepo.add({ date: '2026-02-01', weight: 82.5 });
      await bodyweightRepo.add({ date: '2026-01-01', weight: 84 });
      expect(await bodyweightRepo.all()).toHaveLength(2);
    });
  });
  ```
  - `bodyweight.test.ts`:
  ```ts
  import { describe, it, expect } from 'vitest';
  import { bodyweightSeries, latestWeight } from './bodyweight';
  import type { BodyweightEntry } from '../data/repositories';
  const e = (date: string, weight: number, id?: number): BodyweightEntry => ({ id, date, weight });
  describe('bodyweightSeries', () => {
    it('sorts ascending by date', () => {
      expect(bodyweightSeries([e('2026-02-01', 82.5), e('2026-01-01', 84)]).map(p => p.date))
        .toEqual(['2026-01-01', '2026-02-01']);
    });
  });
  describe('latestWeight', () => {
    it('returns the most recent weight', () => {
      expect(latestWeight([e('2026-01-01', 84, 1), e('2026-02-01', 82.5, 2)])).toBe(82.5);
    });
    it('is null when empty', () => expect(latestWeight([])).toBeNull());
  });
  ```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement.**
  - `db.ts`: after `version(2)`, add `this.version(3).stores({ bodyweight: '++id, date' });` and declare `bodyweight!: Table<BodyweightEntry, number>;` (import the type).
  - `repositories.ts`: add `export interface BodyweightEntry { id?: number; date: string; weight: number }` and `export const bodyweightRepo = { add: (e) => db.bodyweight.add(e), all: () => db.bodyweight.toArray() };`.
  - `bodyweight.ts`:
  ```ts
  import type { BodyweightEntry } from '../data/repositories';
  export function bodyweightSeries(entries: BodyweightEntry[]) {
    return entries.map((x) => ({ date: x.date, weight: x.weight })).sort((a, b) => a.date.localeCompare(b.date));
  }
  export function latestWeight(entries: BodyweightEntry[]): number | null {
    if (entries.length === 0) return null;
    const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date) || (a.id ?? 0) - (b.id ?? 0));
    return sorted[sorted.length - 1].weight;
  }
  ```
  Re-export both from `src/domain/index.ts`.

- [ ] **Step 4: Run → PASS**, `tsc -b` clean.
- [ ] **Step 5: Commit** — `git commit -am "feat(data): bodyweight store + repo + aggregation"`

---

### Task 2: `bodyweightTracking` setting + toggle

**Files:** Modify `src/settings/schema.ts`, `src/ui/screens/Settings.tsx`, `src/ui/screens/Settings.test.tsx`.

**Interfaces:** `SettingsState` gains `bodyweightTracking: boolean` (default `true`).

- [ ] **Step 1: Failing test** — a Settings toggle labeled "Bodyweight tracking" persists the flip (within `SettingsProvider`; **await the loaded switch state via `findByRole`+`waitFor(...toBeChecked)` before clicking**, then `waitFor` the persisted read).
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** — add `bodyweightTracking: true` to `defaultSettings` + the field to `SettingsState`; add a Switch/ToggleRow in `Settings.tsx` wired to `updateSettings({ bodyweightTracking: next })`, matching the existing toggle pattern.
- [ ] **Step 4: Run → PASS**, `tsc -b` clean.
- [ ] **Step 5: Commit** — `git commit -am "feat(settings): bodyweightTracking toggle"`

---

### Task 3: BodyweightCard on History

**Files:** Create `src/ui/components/BodyweightCard.tsx`, `src/ui/components/BodyweightCard.test.tsx`; Modify `src/ui/screens/History.tsx`, `src/ui/screens/History.test.tsx`.

**Interfaces:** `export default function BodyweightCard(): JSX.Element` — loads `bodyweightRepo.all()` + `profileRepo.get()` (for the unit); renders:
- a **"Log today"** row: a numeric input (with the unit label) + a "Log" button → on submit `bodyweightRepo.add({ date: new Date().toISOString().slice(0,10), weight })`, then reload entries; ignore empty/≤0 input.
- the **latest weight** (`latestWeight(entries)`) with the unit, or "—".
- a **trend chart** of `bodyweightSeries(entries)` — a Recharts `LineChart` (single accent line, emphasized latest point) inside `ResponsiveContainer`; resolve `--accent`/`--muted`/`--line` colors at runtime via `getComputedStyle(document.documentElement)` (P2-R1, as `ProgressChart` does); render nothing/gracefully for 0–1 points.
- an **empty state** ("Log your bodyweight to see the trend.") when there are no entries.
COACH tokens, mobile-first.

- [ ] **Step 1: Failing tests** — `BodyweightCard.test.tsx` (fake-indexeddb reset): with no entries, shows the empty-state text and "—" latest; after typing a weight and clicking "Log", `bodyweightRepo.all()` has 1 entry and the latest weight shows it. (Assert text/roles, not SVG geometry.)
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement `BodyweightCard.tsx`** (+ chart). Run → PASS.
- [ ] **Step 4: Integrate into History** — in `History.tsx`, render `<BodyweightCard/>` at the TOP when `settings.bodyweightTracking` is true (read via `useSettings()`; History currently doesn't consume settings — add the `useSettings()` read just for this gate, leaving the always-on charts/PRs unchanged). Add a History test (within `SettingsProvider`): with `bodyweightTracking` on, the bodyweight card ("Log today"/"Bodyweight") is present; with it off (seed `settingsRepo.save({...defaultSettings, bodyweightTracking:false})`), it's absent — **await the loaded state**. Keep all existing History tests green.
- [ ] **Step 5: Run → PASS**, `npm test` all green (run 2–3x for order-independence), `tsc -b` clean.
- [ ] **Step 6: Commit** — `git commit -am "feat(ui): BodyweightCard on History"`

---

## Self-Review
**Spec coverage:** persistence v3 + repo (Task 1) ✓; series/latest aggregation (Task 1) ✓; setting + toggle (Task 2) ✓; History card with log input + latest + chart + empty state, gated (Task 3) ✓; History's existing content unchanged ✓.
**Placeholder scan:** none — Task 1 has full test+impl; Tasks 2–3 have concrete interfaces, behaviors, assertions.
**Type consistency:** `BodyweightEntry`, `bodyweightRepo`, `bodyweightSeries`/`latestWeight` consistent across tasks; `bodyweightTracking` added in Task 2, read in Task 3.
**Notes for executor:** additive v3 only (never edit v1/v2). Settings/History tests await loaded settings (async race). After Task 3, visual QA (dev server + screenshot): log a couple of weights, confirm the latest + trend chart render in dark mode.
