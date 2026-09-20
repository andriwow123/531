# 5/3/1 App — Plan 6: Assistance-Work Tracker — Design Spec

- **Date:** 2026-09-20
- **Status:** Approved (owner requested; refined design confirmed in chat: category picklist + custom exercises)
- **Builds on:** Plans 1–5 (merged + pushed, HEAD d9ba74d).

## 1. Purpose
Let the owner log assistance work after the main lifts — choosing from a built-in list of common exercises per category, or adding their own — with sets × reps and optional weight.

## 2. Scope
**In:** categories Push / Pull / Legs / Core; a built-in exercise catalog per category (bundled); custom exercises the owner adds (persisted, appear in future pickers); logging an assistance entry (exercise + sets × reps + optional weight) tied to the day/workout; an "Assistance" section on the workout screen listing what's been added; a Settings toggle.
**Out (later):** editing/deleting logged entries, assistance-specific charts/volume in History, exercise demo images for assistance, preset assistance "templates" (Triumvirate etc.).

## 3. Categories & built-in catalog
Categories: `push | pull | legs | core`. Bundled catalog (`src/domain/assistanceCatalog.ts`, `Record<AssistanceCategory, string[]>`):
- **Push:** Dumbbell Bench Press, Incline Dumbbell Press, Overhead Dumbbell Press, Dips, Push-ups, Triceps Pushdown, Close-Grip Bench Press, Lateral Raise
- **Pull:** Pull-ups, Chin-ups, Barbell Row, Dumbbell Row, Lat Pulldown, Face Pull, Barbell Curl, Hammer Curl
- **Legs:** Romanian Deadlift, Bulgarian Split Squat, Walking Lunge, Leg Press, Leg Curl, Leg Extension, Calf Raise, Front Squat
- **Core:** Hanging Leg Raise, Ab Wheel Rollout, Plank, Cable Crunch, Back Extension, Sit-up, Russian Twist, Pallof Press

## 4. Data (Dexie v4, additive)
- **`assistance` store** `'++id, date'` — `AssistanceEntry { id?: number; date: string; category: AssistanceCategory; name: string; sets: number; reps: number; weight: number | null }`.
- **`customExercises` store** `'++id, category'` — `CustomExercise { id?: number; category: AssistanceCategory; name: string }` (user-added exercise names).
- **Repos:** `assistanceRepo { add(e), forDate(date), all() }`; `customExerciseRepo { add(c), all() }`.
- **Helper (pure):** `exerciseOptions(category, customs): string[]` = the built-in catalog for the category plus the owner's custom names for it, de-duplicated (case-insensitive), catalog first then customs.
- **Settings:** add `assistanceTracking: boolean` (default `true`) to `SettingsState`.

## 5. UI
- An **"Assistance" section on Home** (the workout screen), shown when `settings.assistanceTracking`, below the main sets (collapsed/compact so it doesn't crowd the lean UI):
  - **Add flow:** category segmented control (Push/Pull/Legs/Core) → an exercise `<select>`/list showing `exerciseOptions(category, customs)` plus an **"＋ Add custom…"** option that reveals a name input (on submit → `customExerciseRepo.add`, then it appears selected) → numeric **sets** and **reps** inputs + optional **weight** input → an **Add** button → `assistanceRepo.add({ date: today, category, name, sets, reps, weight })`.
  - **Today's list:** the assistance entries logged for the current date (`assistanceRepo.forDate(today)`), each showing category · name · `sets × reps` (· weight). 
  - Ignore incomplete adds (no exercise selected, or sets/reps ≤ 0).
- COACH tokens, Manrope, mobile-first. Home's existing content (pick-your-workout, sets, AMRAP, timer, notes, demos, Save) is unchanged; the assistance section is additive.

## 6. Testing
- `assistanceRepo`/`customExerciseRepo` round-trips (Dexie v4 additive — v1–v3 untouched); `exerciseOptions` merges catalog + customs, de-dupes, catalog-first. Settings toggle persists. Assistance section: adding a custom exercise makes it selectable and persists; logging an entry adds it to today's list and to `assistanceRepo`; the section hides when the setting is off. Render within `SettingsProvider`, awaiting loaded state (async-load race). All prior 126 tests stay green; `tsc -b` clean.

## 7. Assumptions
- Weight/units follow the profile (optional; assistance often bodyweight/machine — weight may be blank).
- Entries are per date (multiple per day allowed); tied to the day rather than a specific session id (keeps it decoupled and robust). Cycle/lift association and assistance history are deferred.
- Local-first; no runtime network.
