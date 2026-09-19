# 5/3/1 App — Plan 3: Settings Hub — Design Spec

- **Date:** 2026-09-19
- **Status:** Approved (scope confirmed in chat: Settings hub now; backup/restore and the trackers deferred)
- **Builds on:** Plan 1 + Home picker + Plan 2 (all merged to `main`, HEAD a3ed6e5).
- **Owner context:** non-developer / vibecoding.

## 1. Purpose

Make the app **configurable**. The settings *engine* (schema + display resolver) already exists but everything runs on fixed defaults. Plan 3 adds a **Settings screen** and, underneath it, **persisted settings that every screen reads live** — turning the existing knobs into real controls. It also folds in the deferred fixes that Settings unblocks (5s-PRO progression; a running rest timer; template-snapshot-on-next-cycle).

## 2. Scope

**In:** settings persistence + a live settings provider; the Settings screen (replaces the `/settings` stub) with these sections — Display mode, Templates (incl. enabling 5s-PRO), Rest timer (config + runtime), Theme, Training-Max %, Rounding; wiring Home to read live settings; the 5s-PRO progression fix; a working rest-timer countdown on the workout screen.

**Deferred (Plan 4+ / later):** data backup & restore (owner deferred); assistance-work tracker; bodyweight tracking; exercise demos (free-exercise-db); custom-percentages editor; plate-inventory config; changing **units** after onboarding (needs value conversion — out of scope; units stay as chosen at onboarding); fixed-weekday scheduling (the Home picker already covers free lift choice).

## 3. Design decisions (made during scoping)

- **Settings persist** to a new Dexie `settings` singleton (schema **version 2**, additive — no change to existing tables, no data migration). A `settingsRepo` reads the saved state or falls back to `defaultSettings`.
- **One live source of truth:** a `SettingsProvider` / `useSettings()` context loads settings once and exposes `settings` + `updateSettings(patch)` (which persists and re-renders consumers). Home (and later History/others) read from it instead of importing `defaultSettings` directly.
- **Display mode governs the HOME screen only.** The presets (Simple / Standard / Detailed) + granular toggles control Home widgets: plate breakdown, rest timer, notes, warm-up rows, and `hideCompletedWarmups`. **History is a dedicated tab you navigate to, so it always shows its charts + PRs** (the `charts` / `amrapPrBadges` elements remain in the schema but are not surfaced as toggles and do not gate History). This avoids the "blank History under the default preset" trap.
- **Template changes apply to the NEXT cycle, not the running one.** Home builds from the cycle's `template`/`fivesPro` snapshot (established in Plan 1). So changing the template in Settings takes effect when the next cycle starts. `CycleEnd` must snapshot the **current** settings' `template`/`fivesPro` into the new cycle it creates (today it copies the old cycle's) so the choice actually takes hold.
- **5s-PRO becomes selectable, so its progression bug must be fixed first:** `CycleEnd` derives `topSetCompleted` from the week-3 top set's `done`/`actualReps`, not from `amrapReps` (5s-PRO has no AMRAP set). Fixed in this plan.
- **Rest timer runtime:** configured in Settings (enabled, default seconds, notify) AND actually runs on Home — a countdown the user can start (e.g., on marking a set done), pause/reset, with an optional notification when it hits zero.
- **Theme:** a setting for dark / light / system, applied by setting `data-theme` on `document.documentElement` (tokens already support all three states). Persisted.
- **Training-Max % and rounding increment** are editable and apply going forward (rounding changes displayed working weights immediately via `buildWorkout`; TM % is used when deriving TMs). Changing them does not retroactively rewrite stored TMs.

## 4. Data & modules

- **`src/data/db.ts`:** add `settings` store at Dexie `version(2)` (`this.version(2).stores({ settings: 'id' })`), keeping v1 stores. Singleton row keyed `id: 'app'`.
- **`src/data/repositories.ts`:** `settingsRepo.get(): Promise<SettingsState>` (persisted or `defaultSettings`), `settingsRepo.save(s: SettingsState): Promise<void>`.
- **`src/settings/schema.ts`:** ensure `SettingsState` covers everything the screen edits (units, roundingIncrement, tmPercent, theme, displayPreset, displayOverrides, template {selected, fivesPro, warmups, supplemental params}, restTimer {enabled, defaultSeconds, notify}, hideCompletedWarmups, progression increments). Add a `theme: 'dark' | 'light' | 'system'` field (default `'system'`).
- **`src/ui/settings/SettingsContext.tsx`:** `SettingsProvider` + `useSettings()` (`{ settings, updateSettings }`), loads via `settingsRepo`.
- **`src/ui/screens/Settings.tsx`:** the screen; sections above. **`src/ui/router.tsx`:** wire `/settings` → `<Settings/>`, wrap the routed app in `SettingsProvider`.
- **`src/ui/screens/Home.tsx`:** consume `useSettings()`; re-enable the display gating (plate/timer/notes/warm-ups + `hideCompletedWarmups`) from live settings; integrate the rest-timer runtime; keep building the workout from the cycle snapshot.
- **`src/ui/screens/CycleEnd.tsx`:** fix `topSetCompleted` (top-set done, not amrapReps); snapshot current settings' template/fivesPro into the next cycle.
- **`src/domain`:** if any progression/threshold logic needs adjusting for 5s-PRO completion, keep it pure and tested.

## 5. Visuals

Reuse the COACH theme (tokens, Manrope, rounded cards), mobile-first, dark + light. The Settings screen is a scannable list of labeled sections with native-feeling controls (segmented toggles, switches, steppers), styled from theme tokens. Bottom nav consistent (Settings active). Theme toggle updates `data-theme` immediately.

## 6. Testing

- TDD: `settingsRepo` round-trip (incl. v2 store, defaults fallback); `SettingsContext` load + update + persist; `CycleEnd` 5s-PRO completion (top-set done drives bump/hold/reset; and 5s-PRO cycle no longer auto-resets); CycleEnd snapshots current template; Home honoring live display toggles; rest-timer countdown logic (pure timer reducer/hook tested). Component tests for the Settings screen sections. All prior tests stay green.

## 7. Non-goals / assumptions

- No backup/restore, no unit switching, no trackers (Plan 4+).
- Rest-timer "notify" uses the Notifications API where available; silently no-ops otherwise (no permission nagging on load).
- Changing settings never corrupts existing data; template/TM%/rounding changes are forward-looking.
