# 5/3/1 App — Plan 4: Exercise Demos — Design Spec

- **Date:** 2026-09-20
- **Status:** Approved (owner requested this in the intake form; scope/order confirmed in chat)
- **Builds on:** Plans 1–3 (all merged + pushed, HEAD a4a42d9).
- **Owner context:** non-developer / vibecoding.

## 1. Purpose

An expandable **"how to perform" demo for each main lift** on the workout screen — start/end position images plus step-by-step instructions — so the owner can check form. Data comes from the open-source **free-exercise-db** (public domain / Unlicense), **bundled into the app** so it works offline (PWA).

## 2. Scope

**In:** a per-lift demo (the 4 main lifts) — 2 images + numbered instructions; an expandable/collapsible affordance on Home for the selected lift (collapsed by default so it never clutters); a Settings toggle to hide demos; a small data-source credit.
**Out (later plans):** demos for assistance exercises; a searchable exercise browser; video.

## 3. Data source & mapping

`free-exercise-db` (github.com/yuhonas/free-exercise-db, Unlicense/public domain — no attribution required; we add a courtesy credit). Each exercise has `instructions: string[]` and 2 images at `exercises/<id>/{0,1}.jpg`. The 4 lift → entry mappings (barbell variants):

| LiftKey | Exercise id | Display name |
|---|---|---|
| press | `Barbell_Shoulder_Press` | Barbell Shoulder Press |
| bench | `Barbell_Bench_Press_-_Medium_Grip` | Barbell Bench Press |
| squat | `Barbell_Full_Squat` | Barbell Squat |
| deadlift | `Barbell_Deadlift` | Barbell Deadlift |

Raw image URL pattern (for fetching at build/bundle time only): `https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/<id>/<n>.jpg`. Verified: images are ~50–90 KB JPEGs (~850×567); instructions are clear step lists.

## 4. Design decisions

- **Bundle, don't fetch at runtime.** The 8 images (4 lifts × 2) are committed under `public/exercises/<id>/{0,1}.jpg` (Vite serves `public/` at root; vite-plugin-pwa precaches them → offline-capable). Instructions are copied into a local data module (no runtime network).
- **Data module:** `src/domain/exercises.ts` exports `EXERCISE_DEMOS: Record<LiftKey, ExerciseDemo>` where `ExerciseDemo = { id: string; name: string; instructions: string[]; images: string[] }` (images as absolute app paths like `/exercises/Barbell_Deadlift/0.jpg`). Pure data + a `getExerciseDemo(liftKey)` accessor.
- **Placement:** an expandable **"How to perform"** section on Home, tied to the currently selected lift, **collapsed by default** (opt-in tap) so the lean workout UI is unaffected. Expanded: the 2 images (labeled Start / Finish) + a numbered instruction list.
- **Configurable:** add `exerciseDemos: boolean` (default `true`) to `SettingsState`; a Settings toggle hides the demo affordance entirely when off (consistent with the everything-in-Settings ethos).
- **Credit:** a small "Exercise guides from free-exercise-db (public domain)" line in the expanded demo or Settings.

## 5. Components / files

- `src/domain/exercises.ts` (+ `.test`) — the demo data + accessor.
- `public/exercises/<id>/{0,1}.jpg` — 8 bundled images.
- `src/settings/schema.ts` — `exerciseDemos: boolean` (default true).
- `src/ui/components/ExerciseDemo.tsx` (+ `.test`) — the expandable demo (images + instructions), theme-token styled, mobile-first, lazy/`loading="lazy"` images with `alt` text.
- `src/ui/screens/Home.tsx` — render `<ExerciseDemo liftKey={selectedLift} />` when `settings.exerciseDemos`, collapsed by default.
- `src/ui/screens/Settings.tsx` — the `exerciseDemos` toggle.

## 6. Testing

- `EXERCISE_DEMOS` has all 4 lifts; each has a non-empty `name`, ≥1 instruction, exactly 2 image paths that point under `/exercises/`.
- `ExerciseDemo`: collapsed by default (instructions not in the DOM until expanded); expanding shows the lift name, images (with alt text), and the numbered instructions.
- Settings: the `exerciseDemos` toggle persists.
- Home: the demo affordance renders for the selected lift when `exerciseDemos` is on, and is absent when off. (Render within `SettingsProvider`.)
- All prior 110 tests stay green; `tsc -b` clean.

## 7. Assumptions / non-goals

- Images are committed to the repo (small, static, public domain). If the build-time fetch of an image genuinely fails, the demo degrades to instructions-only for that lift (never a broken image) — but the intent is all 8 bundle successfully.
- No runtime network dependency; works offline like the rest of the app.
