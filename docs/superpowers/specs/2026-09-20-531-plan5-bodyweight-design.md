# 5/3/1 App — Plan 5: Bodyweight Tracking — Design Spec

- **Date:** 2026-09-20
- **Status:** Approved (owner requested in intake form; order confirmed in chat)
- **Builds on:** Plans 1–4 (merged + pushed, HEAD 3eb7a65).

## 1. Purpose
Let the owner log their bodyweight and see the trend over time, alongside the strength charts — quick to enter, motivating to watch.

## 2. Scope
**In:** persist bodyweight entries; a Bodyweight card on the History tab (quick log input + latest weight + a trend line chart); a Settings toggle to hide it; an empty state.
**Out (later):** editing/deleting past entries, bodyweight goals, weight in a different unit than the profile, importing.

## 3. Data & modules
- **Dexie v3** (additive): a `bodyweight` store `'++id, date'` (keep v1/v2 untouched). `BodyweightEntry { id?: number; date: string; weight: number }` (weight in the profile's unit).
- **`bodyweightRepo`** (`src/data/repositories.ts`): `add(entry)`, `all()`, `latest()` (most recent by date).
- **Aggregation (pure, tested)** in `src/domain/bodyweight.ts`: `bodyweightSeries(entries): { date: string; weight: number }[]` sorted ascending by date; `latestWeight(entries): number | null`.
- **Settings:** add `bodyweightTracking: boolean` (default `true`) to `SettingsState`.

## 4. UI
- A **Bodyweight card at the top of the History tab**, shown when `settings.bodyweightTracking` is true:
  - A quick **"Log today"** row: a numeric input (unit label from profile) + a Save/Log button → `bodyweightRepo.add({ date: today ISO, weight })`, then the card refreshes.
  - The **latest weight** displayed prominently (with unit); "—" when none.
  - A **trend line chart** of `bodyweightSeries` (single accent line, emphasized latest point), following the existing `ProgressChart` conventions: colors resolved from theme tokens at runtime (getComputedStyle), `ResponsiveContainer`, legible in both themes, no crash on 0/1 points.
  - **Empty state** when no entries: "Log your bodyweight to see the trend."
- COACH tokens, Manrope, mobile-first. History's existing per-lift cards + cycle log stay unchanged (bodyweight card sits above them).

## 5. Testing
- `bodyweightRepo` round-trip (v3 store; add/all/latest); `bodyweightSeries`/`latestWeight` (ordering, empty). Settings toggle persists. History: the bodyweight card shows when enabled and hides when off; logging a weight adds an entry and updates the latest/chart; empty state with no entries. Render within `SettingsProvider`, awaiting the loaded settings state (known async-load race). All prior 115 tests stay green; `tsc -b` clean.

## 6. Assumptions
- Weight is stored/displayed in the profile's unit (set at onboarding). One entry per log action (multiple same-day entries allowed; `latest` = most recent by date, ties broken by insertion id).
- No runtime network; local-first like the rest of the app.
