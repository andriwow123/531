import type { LiftKey } from './types';
import type { AssistanceCategory, CustomExercise, HiddenSupporting } from '../data/repositories';
import { roundToIncrement } from './rounding';

export interface SupportingItem {
  name: string;
  scheme: string;
  custom?: boolean;
}

export const SUPPORTING_CATALOG: Record<AssistanceCategory, { name: string; scheme: string }[]> = {
  push: [
    { name: 'Dips', scheme: '3 × 8–12' },
    { name: 'Close-grip bench press', scheme: '3 × 8–10' },
    { name: 'Incline dumbbell press', scheme: '3 × 10–12' },
    { name: 'Triceps pushdown', scheme: '3 × 12–15' },
    { name: 'Push-ups', scheme: '3 × max' },
    { name: 'Overhead dumbbell press', scheme: '3 × 8–12' },
    { name: 'Lateral raise', scheme: '3 × 12–15' },
  ],
  pull: [
    { name: 'Chin-ups', scheme: '3 × max' },
    { name: 'Lat pulldown', scheme: '3 × 10–12' },
    { name: 'Face pulls', scheme: '3 × 15–20' },
    { name: 'Dumbbell curl', scheme: '3 × 10–12' },
    { name: 'Barbell row', scheme: '3 × 8–10' },
    { name: 'Dumbbell row', scheme: '3 × 10–12' },
    { name: 'Hammer curl', scheme: '3 × 10–12' },
  ],
  legs: [
    { name: 'Romanian deadlift', scheme: '3 × 8–10' },
    { name: 'Bulgarian split squat', scheme: '3 × 8–12' },
    { name: 'Walking lunge', scheme: '3 × 10–12' },
    { name: 'Leg press', scheme: '3 × 10–15' },
    { name: 'Leg curl', scheme: '3 × 10–15' },
    { name: 'Leg extension', scheme: '3 × 12–15' },
    { name: 'Calf raise', scheme: '3 × 15–20' },
  ],
  core: [
    { name: 'Hanging leg raise', scheme: '3 × 10–15' },
    { name: 'Ab wheel rollout', scheme: '3 × 8–12' },
    { name: 'Plank', scheme: '3 × max' },
    { name: 'Cable crunch', scheme: '3 × 12–15' },
    { name: 'Back extension', scheme: '3 × 12–15' },
    { name: 'Russian twist', scheme: '3 × 15–20' },
  ],
};

/** Upper lifts (press, bench) -> push/pull/core; lower lifts (squat, deadlift) -> legs/pull/core. */
export function categoriesForLift(liftKey: LiftKey): AssistanceCategory[] {
  return liftKey === 'press' || liftKey === 'bench' ? ['push', 'pull', 'core'] : ['legs', 'pull', 'core'];
}

/** The BBB supplemental weight: training max * 0.5, rounded to the profile's increment. */
export function bbbFor(tm: number, roundingIncrement: number): number {
  return roundToIncrement(tm * 0.5, roundingIncrement);
}

/** Catalog for the category minus hidden built-ins (case-insensitive), then this category's customs appended, catalog-first. */
export function supportingList(
  category: AssistanceCategory,
  customs: CustomExercise[],
  hidden: HiddenSupporting[],
): SupportingItem[] {
  const hiddenNames = new Set(
    hidden.filter((h) => h.category === category).map((h) => h.name.toLowerCase()),
  );
  const catalogItems: SupportingItem[] = SUPPORTING_CATALOG[category]
    .filter((item) => !hiddenNames.has(item.name.toLowerCase()))
    .map((item) => ({ name: item.name, scheme: item.scheme, custom: false }));
  const customItems: SupportingItem[] = customs
    .filter((c) => c.category === category)
    .map((c) => ({ name: c.name, scheme: c.scheme ?? '', custom: true }));
  return [...catalogItems, ...customItems];
}
