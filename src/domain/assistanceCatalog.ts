import type { AssistanceCategory, CustomExercise } from '../data/repositories';

export const ASSISTANCE_CATALOG: Record<AssistanceCategory, string[]> = {
  push: [
    'Dumbbell Bench Press',
    'Incline Dumbbell Press',
    'Overhead Dumbbell Press',
    'Dips',
    'Push-ups',
    'Triceps Pushdown',
    'Close-Grip Bench Press',
    'Lateral Raise',
  ],
  pull: [
    'Pull-ups',
    'Chin-ups',
    'Barbell Row',
    'Dumbbell Row',
    'Lat Pulldown',
    'Face Pull',
    'Barbell Curl',
    'Hammer Curl',
  ],
  legs: [
    'Romanian Deadlift',
    'Bulgarian Split Squat',
    'Walking Lunge',
    'Leg Press',
    'Leg Curl',
    'Leg Extension',
    'Calf Raise',
    'Front Squat',
  ],
  core: [
    'Hanging Leg Raise',
    'Ab Wheel Rollout',
    'Plank',
    'Cable Crunch',
    'Back Extension',
    'Sit-up',
    'Russian Twist',
    'Pallof Press',
  ],
};

/** Catalog for the category, then the owner's custom names for it, de-duped case-insensitively. */
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
