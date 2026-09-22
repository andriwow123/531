# Plan 13 — Supporting-Lift Workflow + History — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make supporting-lift logging fast mid-workout (a "Today's supporting work" section you build by picking from the catalog), pre-fill each exercise from last time, add supporting-lift history to the History screen, and relabel the unclear "Scheme" field.

**Architecture:** A new `SupportingDone.done` boolean separates "selected for today" (a row exists) from "completed" (the checkmark). `SupportingLifts` splits into a Today zone (picked exercises + BBB, with inputs + done checkmark) and an Add/catalog zone. A pure domain aggregation feeds a new History section. No Dexie version bump.

**Tech Stack:** React 19 + TS strict + Vite + Tailwind v3 + Dexie + Vitest.

**Spec:** `docs/superpowers/specs/2026-09-22-531-plan13-supporting-workflow-history-design.md`

## Global Constraints
- TS strict + `verbatimModuleSyntax`: `import type` for type-only imports. `noUnusedLocals`/`noUnusedParameters` ON.
- COACH theme tokens only; no hardcoded hex. Mobile-first; keep `max-w-md`.
- Decimal inputs: `type=text inputMode=decimal` + comma-normalized parse (`Number(String(v).replace(',', '.'))`). Reps stay `type=number inputMode=numeric`.
- UI tests render within `SettingsProvider`, await `loaded`; fake-indexeddb globally set up.
- `npx tsc -b` clean + full suite green (2×) before each commit. Baseline: **250 tests**.
- **No Dexie schema/version bump** (still `version(5)`); adding an object field needs none. No change to 5/3/1 progression math or main-set generation.
- Exercise identity for suggestions/history is **category + name** (across all lift days).

## File Structure
- `src/data/repositories.ts` — `SupportingDone` gains `done: boolean`; `supportingDoneRepo` gains `select`/`setDone`/`deselect`/`lastLogged`/`allLogged` (keep `log`/`forDate`; `toggle` kept in T1, removed in T3). (T1)
- `src/domain/supportingHistory.ts` (new) + `src/domain/index.ts` export — pure `aggregateSupportingHistory`. (T2)
- `src/ui/components/SupportingLifts.tsx` — Today zone + catalog zone + pre-fill + scheme relabel. (T3)
- `src/ui/components/SupportingHistory.tsx` (new) + `src/ui/screens/History.tsx` — history section. (T4)
- Tests alongside each.

---

### Task 1: Data layer — `SupportingDone.done` + repo methods

**Files:**
- Modify: `src/data/repositories.ts` (`SupportingDone` interface ~line 17-25; `supportingDoneRepo` ~line 91-115)
- Test: `src/data/repositories.test.ts`

**Interfaces:**
- Produces: `SupportingDone` now has `done: boolean`. `supportingDoneRepo.select(date, liftKey, category, name, seed?: { weight: number|null; reps: number|null }): Promise<void>`; `.setDone(date, liftKey, category, name, done: boolean): Promise<void>`; `.deselect(date, liftKey, category, name): Promise<void>`; `.lastLogged(category: AssistanceCategory, name: string, beforeDate: string): Promise<{ weight: number|null; reps: number|null } | null>`; `.allLogged(): Promise<SupportingDone[]>`. `.log`/`.forDate` unchanged in signature. `.toggle` kept (used by the not-yet-migrated component; removed in Task 3).

- [ ] **Step 1: Write failing tests** in `src/data/repositories.test.ts` (add a `describe('supportingDoneRepo select/setDone/deselect/lastLogged', ...)`):

```ts
import { supportingDoneRepo } from './repositories';
// ... existing imports/setup (fake-indexeddb reset per test as the file already does)

it('select adds a today row (done:false) and is idempotent, seeding weight/reps', async () => {
  await supportingDoneRepo.select('2026-03-02', 'press', 'push', 'Dips', { weight: 30, reps: 12 });
  await supportingDoneRepo.select('2026-03-02', 'press', 'push', 'Dips', { weight: 99, reps: 1 }); // no-op
  const rows = await supportingDoneRepo.forDate('2026-03-02');
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ name: 'Dips', done: false, weight: 30, reps: 12 });
});

it('setDone flips the done flag without removing the row; deselect removes it', async () => {
  await supportingDoneRepo.select('2026-03-02', 'press', 'push', 'Dips', { weight: null, reps: null });
  await supportingDoneRepo.setDone('2026-03-02', 'press', 'push', 'Dips', true);
  let rows = await supportingDoneRepo.forDate('2026-03-02');
  expect(rows[0].done).toBe(true);
  await supportingDoneRepo.deselect('2026-03-02', 'press', 'push', 'Dips');
  rows = await supportingDoneRepo.forDate('2026-03-02');
  expect(rows).toHaveLength(0);
});

it('lastLogged returns the most recent prior non-null entry by category+name, else null', async () => {
  await supportingDoneRepo.select('2026-03-01', 'press', 'push', 'Dips', { weight: 25, reps: 10 });
  await supportingDoneRepo.select('2026-03-02', 'bench', 'push', 'Dips', { weight: 27.5, reps: 8 });
  const found = await supportingDoneRepo.lastLogged('push', 'Dips', '2026-03-03');
  expect(found).toEqual({ weight: 27.5, reps: 8 });
  // strictly before the given date:
  const earlier = await supportingDoneRepo.lastLogged('push', 'Dips', '2026-03-02');
  expect(earlier).toEqual({ weight: 25, reps: 10 });
  expect(await supportingDoneRepo.lastLogged('push', 'Nope', '2026-03-03')).toBeNull();
});

it('allLogged returns only rows with a non-null weight or reps', async () => {
  await supportingDoneRepo.select('2026-03-02', 'press', 'push', 'A', { weight: null, reps: null });
  await supportingDoneRepo.select('2026-03-02', 'press', 'push', 'B', { weight: 20, reps: null });
  const logged = await supportingDoneRepo.allLogged();
  expect(logged.map((r) => r.name)).toEqual(['B']);
});
```

- [ ] **Step 2: Run → FAIL** (`npx vitest run src/data/repositories.test.ts`). Expected: `select`/`setDone`/`deselect`/`lastLogged`/`allLogged` are not functions.

- [ ] **Step 3: Implement.** Add `done: boolean` to the interface and the new methods; update the existing `add` calls to include `done`:

```ts
export interface SupportingDone {
  id?: number;
  date: string;
  liftKey: LiftKey;
  category: AssistanceCategory;
  name: string;
  weight: number | null;
  reps: number | null;
  done: boolean;
}
```

```ts
export const supportingDoneRepo = {
  // KEPT for the not-yet-migrated component; removed in Task 3. Adds a done:true row.
  toggle: async (date: string, liftKey: LiftKey, category: AssistanceCategory, name: string): Promise<void> => {
    const existing = await findMatch(date, liftKey, category, name);
    if (existing?.id !== undefined) {
      await db.supportingDone.delete(existing.id);
    } else {
      await db.supportingDone.add({ date, liftKey, category, name, weight: null, reps: null, done: true });
    }
  },
  select: async (
    date: string, liftKey: LiftKey, category: AssistanceCategory, name: string,
    seed?: { weight: number | null; reps: number | null },
  ): Promise<void> => {
    const existing = await findMatch(date, liftKey, category, name);
    if (existing?.id !== undefined) return;
    await db.supportingDone.add({
      date, liftKey, category, name,
      weight: seed?.weight ?? null,
      reps: seed?.reps ?? null,
      done: false,
    });
  },
  setDone: async (date: string, liftKey: LiftKey, category: AssistanceCategory, name: string, done: boolean): Promise<void> => {
    const existing = await findMatch(date, liftKey, category, name);
    if (existing?.id !== undefined) {
      await db.supportingDone.update(existing.id, { done });
    } else {
      await db.supportingDone.add({ date, liftKey, category, name, weight: null, reps: null, done });
    }
  },
  deselect: async (date: string, liftKey: LiftKey, category: AssistanceCategory, name: string): Promise<void> => {
    const existing = await findMatch(date, liftKey, category, name);
    if (existing?.id !== undefined) await db.supportingDone.delete(existing.id);
  },
  log: async (
    date: string, liftKey: LiftKey, category: AssistanceCategory, name: string,
    patch: { weight?: number | null; reps?: number | null },
  ): Promise<void> => {
    const existing = await findMatch(date, liftKey, category, name);
    if (existing?.id !== undefined) {
      await db.supportingDone.update(existing.id, patch);
    } else {
      await db.supportingDone.add({ date, liftKey, category, name, weight: patch.weight ?? null, reps: patch.reps ?? null, done: false });
    }
  },
  forDate: (date: string): Promise<SupportingDone[]> => db.supportingDone.where('date').equals(date).toArray(),
  lastLogged: async (
    category: AssistanceCategory, name: string, beforeDate: string,
  ): Promise<{ weight: number | null; reps: number | null } | null> => {
    const rows = await db.supportingDone
      .where('date').below(beforeDate)
      .filter((d) => d.category === category && d.name === name && (d.weight !== null || d.reps !== null))
      .toArray();
    if (rows.length === 0) return null;
    rows.sort((a, b) => b.date.localeCompare(a.date));
    return { weight: rows[0].weight, reps: rows[0].reps };
  },
  allLogged: (): Promise<SupportingDone[]> =>
    db.supportingDone.filter((d) => d.weight !== null || d.reps !== null).toArray(),
};
```

Also: search the repo for any OTHER place that constructs a `SupportingDone` object literal (e.g. existing tests, seeds) and add `done` to keep `tsc -b` clean. `backup.ts` is generic (no literal) and needs no change. Legacy rows without `done` are handled by read-time coercion in Tasks 3–4 (`d.done ?? true`); do NOT add a migration or bump Dexie.

- [ ] **Step 4: Run → PASS** (`npx vitest run src/data/repositories.test.ts`), then `npx tsc -b` clean + full suite green (2×).
- [ ] **Step 5: Commit** — `git commit -am "feat(data): supportingDone.done + select/setDone/deselect/lastLogged/allLogged"`

---

### Task 2: Domain — `aggregateSupportingHistory`

**Files:**
- Create: `src/domain/supportingHistory.ts`
- Modify: `src/domain/index.ts` (export)
- Test: `src/domain/supportingHistory.test.ts`

**Interfaces:**
- Consumes: `SupportingDone` from Task 1 (imported as a type).
- Produces: `aggregateSupportingHistory(rows: SupportingDone[], recentLimit?: number): SupportingExerciseHistory[]` and `interface SupportingExerciseHistory { category: AssistanceCategory; name: string; entries: { date: string; weight: number | null; reps: number | null }[] }`.

- [ ] **Step 1: Write failing test** `src/domain/supportingHistory.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { aggregateSupportingHistory } from './supportingHistory';
import type { SupportingDone } from '../data/repositories';

const row = (date: string, name: string, weight: number | null, reps: number | null): SupportingDone =>
  ({ date, liftKey: 'press', category: 'push', name, weight, reps, done: true });

describe('aggregateSupportingHistory', () => {
  it('groups by category+name, entries most-recent-first, capped', () => {
    const out = aggregateSupportingHistory(
      [row('2026-03-01', 'Dips', 25, 10), row('2026-03-03', 'Dips', 30, 8), row('2026-03-02', 'Push-ups', null, 20)],
      2,
    );
    const dips = out.find((g) => g.name === 'Dips')!;
    expect(dips.entries.map((e) => e.date)).toEqual(['2026-03-03', '2026-03-01']);
    expect(dips.entries[0]).toEqual({ date: '2026-03-03', weight: 30, reps: 8 });
    // exercises ordered by most-recent entry first
    expect(out[0].name).toBe('Dips');
  });

  it('drops rows with no weight and no reps', () => {
    const out = aggregateSupportingHistory([row('2026-03-01', 'A', null, null)]);
    expect(out).toEqual([]);
  });

  it('respects the recentLimit cap on entries', () => {
    const rows = Array.from({ length: 10 }, (_, i) => row(`2026-03-${String(i + 1).padStart(2, '0')}`, 'Dips', i, 10));
    const out = aggregateSupportingHistory(rows, 8);
    expect(out[0].entries).toHaveLength(8);
  });
});
```

- [ ] **Step 2: Run → FAIL** (`npx vitest run src/domain/supportingHistory.test.ts`).

- [ ] **Step 3: Implement** `src/domain/supportingHistory.ts`:

```ts
import type { SupportingDone, AssistanceCategory } from '../data/repositories';

export interface SupportingExerciseHistory {
  category: AssistanceCategory;
  name: string;
  entries: { date: string; weight: number | null; reps: number | null }[];
}

/** Groups logged supporting entries by category+name; entries most-recent-first
 *  (capped at `recentLimit`), exercises ordered by their most-recent entry. */
export function aggregateSupportingHistory(rows: SupportingDone[], recentLimit = 8): SupportingExerciseHistory[] {
  const logged = rows.filter((r) => r.weight !== null || r.reps !== null);
  const groups = new Map<string, SupportingExerciseHistory>();
  for (const r of logged) {
    const key = `${r.category}|${r.name}`;
    let g = groups.get(key);
    if (!g) {
      g = { category: r.category, name: r.name, entries: [] };
      groups.set(key, g);
    }
    g.entries.push({ date: r.date, weight: r.weight, reps: r.reps });
  }
  const result = [...groups.values()];
  for (const g of result) {
    g.entries.sort((a, b) => b.date.localeCompare(a.date));
    g.entries = g.entries.slice(0, recentLimit);
  }
  result.sort((a, b) => (b.entries[0]?.date ?? '').localeCompare(a.entries[0]?.date ?? ''));
  return result;
}
```

Add to `src/domain/index.ts`:

```ts
export { aggregateSupportingHistory } from './supportingHistory';
export type { SupportingExerciseHistory } from './supportingHistory';
```

- [ ] **Step 4: Run → PASS**, then `npx tsc -b` clean + full suite (2×).
- [ ] **Step 5: Commit** — `git commit -am "feat(domain): aggregateSupportingHistory (group supporting logs by exercise)"`

---

### Task 3: `SupportingLifts.tsx` — Today zone + catalog + pre-fill + scheme relabel

**Files:**
- Modify: `src/ui/components/SupportingLifts.tsx`
- Modify: `src/data/repositories.ts` (remove the now-unused `toggle`)
- Test: `src/ui/components/SupportingLifts.test.tsx`

**Interfaces:**
- Consumes: `supportingDoneRepo.select/setDone/deselect/log/forDate/lastLogged` (Task 1). Props unchanged: `{ liftKey, tm, unit, roundingIncrement }`.

**Design of the redesigned panel (expanded):** two zones inside the existing collapsible card.

**Zone A — "Today's supporting work":**
- Heading `h3` "Today's supporting work" (muted uppercase, matching existing category headers).
- **BBB pinned first** (unchanged: `bbbFor(tm, roundingIncrement)` placeholder, weight×reps inputs, done checkmark) — BBB is always present here, not in the catalog. Its checkmark uses `setDone(today, liftKey, bbbCategory, BBB_NAME, next)`; a row is created on first check/log via `setDone`/`log`.
- Then each **selected** exercise = rows from `forDate(today)` filtered to `d.liftKey === liftKey` and NOT the BBB row, showing: a **done checkmark** (`d.done ?? true`; `setDone`), name + scheme, weight×reps inputs (commit-on-blur via `log`, same local-draft discipline), and a small **"Remove" ✕** button (`aria-label={`Remove ${name} from today`}`) → `deselect`.
- Empty state (no non-BBB selected rows): muted line "Pick exercises below to build today's list."

**Zone B — "Add exercises" (catalog):**
- Heading `h3` "Add exercises".
- Per category (`categoriesForLift(liftKey)`), the `supportingList(category, customs, hidden)` items **excluding** any already selected today (i.e. exclude names present in the today rows for this liftKey+category). Each item: name + scheme + a full-row **"＋ Add"** button (`aria-label={`Add ${name}`}`) → on click: `const seed = await supportingDoneRepo.lastLogged(category, name, today); await supportingDoneRepo.select(today, liftKey, category, name, seed ?? undefined);` then refresh. Keep the existing **hide/delete (trash)** control on catalog rows (`aria-label={`Remove ${name} from list`}` — relabel from the old "Remove {name}" to disambiguate from Zone A's remove-from-today) → `hiddenSupportingRepo.add` / `customExerciseRepo.remove`.
- Keep the **"＋ Add exercise"** custom form per category (with the relabel below).

**Pre-fill wiring:** when `select` seeds weight/reps, the new today row carries them; on refresh, seed the local `logs` draft for that key from the row (extend the existing seed-from-DB logic so it also seeds newly-selected rows, not only the initial mount — e.g. after a `select`, merge the row's weight/reps into `logs`/`committedRef` for that key).

**Scheme relabel:** the custom add form's label + `aria-label` "Scheme (optional)" → **"Sets × reps (optional)"**; placeholder `e.g. 3 × 8–12`. Keep `addScheme` state and the stored `scheme` field.

**Remove `toggle`:** delete `supportingDoneRepo.toggle` from `repositories.ts` (its only caller is this component, now migrated).

- [ ] **Step 1: Adjust/add tests** in `SupportingLifts.test.tsx` (render within `SettingsProvider`, await loaded; seed via `supportingDoneRepo`). Re-point old "checking hides/removes" assertions to the new behavior; add:

```ts
it('picking a catalog exercise moves it into Today and pre-fills from the last logged entry', async () => {
  await supportingDoneRepo.select('2020-01-01', 'press', 'push', 'Dips', { weight: 30, reps: 12 }); // a prior day
  // render the press card's SupportingLifts, expand it
  // click the "Add Dips" button in the catalog
  // expect Dips now under "Today's supporting work" with its weight input showing 30
});

it('the Today checkmark marks done without removing the row', async () => {
  // select Dips today, expand, click its done checkbox
  // expect the row still present and its checkbox checked (aria-checked / checked)
});

it('remove-from-today deselects the exercise (row gone, back in catalog)', async () => {
  // select Dips today, expand, click "Remove Dips from today"
  // expect Dips no longer in Today and present again in the Add/catalog list
});

it('the add-exercise form shows "Sets × reps (optional)"', async () => {
  // expand, open "+ Add exercise", expect the label text
});
```

Keep the existing BBB and hide/delete tests passing (adjust selectors/labels as needed for the relabels).

- [ ] **Step 2: Run → FAIL** (`npx vitest run src/ui/components/SupportingLifts.test.tsx`).
- [ ] **Step 3: Implement** the two-zone redesign + pre-fill + relabel per the design above; remove `toggle`. Preserve theme tokens, the comma-decimal weight input, the numeric reps input, and the local-draft `committedRef`/`seededRef` no-clobber discipline.
- [ ] **Step 4: Run → PASS**, then `npx tsc -b` clean + full suite (2×).
- [ ] **Step 5: Commit** — `git commit -am "feat(ui): today's-supporting-work section (pick->today, check=done) + pre-fill + clearer add-exercise label"`

---

### Task 4: Supporting history on the History screen

**Files:**
- Create: `src/ui/components/SupportingHistory.tsx`
- Modify: `src/ui/screens/History.tsx` (mount the section, gated on `settings.assistanceTracking`, after the per-lift progress cards / before "Cycle log" ~line 166)
- Test: `src/ui/components/SupportingHistory.test.tsx`

**Interfaces:**
- Consumes: `supportingDoneRepo.allLogged()` (T1), `aggregateSupportingHistory` + `SupportingExerciseHistory` (T2), `useSettings` unit for display.

- [ ] **Step 1: Write failing test** `SupportingHistory.test.tsx` (render within `SettingsProvider`, await loaded; seed via `supportingDoneRepo`):

```ts
it('renders each logged supporting exercise with its recent weight×reps', async () => {
  await supportingDoneRepo.select('2026-03-03', 'press', 'push', 'Dips', { weight: 30, reps: 8 });
  await supportingDoneRepo.select('2026-03-01', 'press', 'push', 'Dips', { weight: 25, reps: 10 });
  // render <SupportingHistory />, await loaded
  // expect "Dips" present and an entry showing "30" and "8" (most recent first)
});

it('shows an empty state when nothing is logged', async () => {
  // render with no rows -> expect the empty-state copy
});
```

- [ ] **Step 2: Run → FAIL**.
- [ ] **Step 3: Implement** `SupportingHistory.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { aggregateSupportingHistory } from '../../domain';
import type { SupportingExerciseHistory } from '../../domain';
import { supportingDoneRepo } from '../../data/repositories';
import { useSettings } from '../settings/SettingsContext';

/** History-screen section: each logged supporting exercise with its recent
 *  weight×reps (most-recent-first). Reads the same rows the pre-fill uses. */
export default function SupportingHistory() {
  const { settings } = useSettings();
  void settings; // unit read below via profile is not needed; keep display unit-agnostic (values are stored numbers)
  const [groups, setGroups] = useState<SupportingExerciseHistory[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    supportingDoneRepo.allLogged().then((rows) => {
      if (!cancelled) setGroups(aggregateSupportingHistory(rows));
    });
    return () => { cancelled = true; };
  }, []);

  if (groups === null) return null;

  return (
    <section className="mt-5" aria-label="Supporting-lift history">
      <h2 className="mb-2 text-sm font-extrabold text-[var(--muted)]">Supporting lifts</h2>
      {groups.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">Log supporting exercises and their history shows up here.</p>
      ) : (
        <ul className="flex flex-col gap-3 list-none p-0 m-0">
          {groups.map((g) => (
            <li key={`${g.category}|${g.name}`} className="rounded-[var(--r-card)] border border-[var(--line)] bg-[var(--surface)] p-3">
              <h3 className="text-sm font-extrabold">{g.name}</h3>
              <ul className="mt-1.5 flex flex-col gap-1 list-none p-0 m-0">
                {g.entries.map((e) => (
                  <li key={e.date} className="flex items-center justify-between text-[13px] tabular-nums">
                    <span className="text-[var(--muted)]">{e.date}</span>
                    <span className="font-bold">
                      {e.weight ?? '—'}{' × '}{e.reps ?? '—'}
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

(If the `void settings` line trips `noUnusedLocals`/lint, drop the `useSettings` import entirely — the component needs no settings; it is mounted behind the History screen's `assistanceTracking` gate.)

Mount it in `History.tsx` (import at top; render in the loaded branch, gated):

```tsx
{settings.assistanceTracking && (
  <SupportingHistory />
)}
```

- [ ] **Step 2b/4: Run → PASS**, then `npx tsc -b` clean + full suite (2×).
- [ ] **Step 5: Commit** — `git commit -am "feat(ui): supporting-lift history section on the History screen"`

---

## Self-Review
- **Spec coverage:** §2 data model (T1) ✓; §3 Today/catalog redesign + pre-fill (T3) ✓; §4 supporting history (T2 aggregation + T4 UI) ✓; §5 scheme relabel (T3) ✓; §6 testing spread across T1–T4 ✓.
- **Placeholder scan:** none — every code step has concrete code.
- **Type consistency:** `SupportingDone.done` added in T1 and consumed by T2/T3/T4; `select/setDone/deselect/lastLogged/allLogged` signatures match across producer (T1) and consumers (T3/T4); `aggregateSupportingHistory(rows, recentLimit?)` + `SupportingExerciseHistory` match between T2 and T4. `toggle` removed in T3 (its only caller migrates in the same task). No Dexie bump; no progression-math change.
- **Notes for executor:** T1 must fix any other `SupportingDone` literal (tests/seeds) for `tsc`. Legacy rows without `done` are read-coerced (`d.done ?? true`) in T3/T4, never migrated. Owner reviews the look before merge — NO auto-merge; merge to `main` (auto-deploys to GitHub Pages).
