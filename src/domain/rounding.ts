import type { LiftCategory, Unit } from './types';

export function roundToIncrement(value: number, increment: number): number {
  if (increment <= 0) return value;
  return Math.round(value / increment) * increment;
}

/** Rounding increments offered per unit, ordered smallest -> largest. */
export const ROUNDING_STEPS: Record<Unit, number[]> = {
  kg: [1.25, 2.5, 5],
  lb: [2.5, 5, 10],
};

/** Standard per-lift rounding for a new setup: upper-body 2.5 kg / 5 lb, lower-body 5 kg / 10 lb. */
export function defaultRoundingFor(category: LiftCategory, unit: Unit): number {
  if (category === 'upper') return unit === 'kg' ? 2.5 : 5;
  return unit === 'kg' ? 5 : 10;
}

/** A lift's own rounding when set, else the profile-wide fallback. */
export function effectiveRounding(perLift: number | undefined, profileRounding: number): number {
  return perLift ?? profileRounding;
}

/** Maps a rounding step across units by its position in ROUNDING_STEPS
 *  (1.25 kg <-> 2.5 lb, 2.5 <-> 5, 5 <-> 10); an unknown value falls back to the category default. */
export function convertRoundingStep(value: number, from: Unit, to: Unit, category: LiftCategory): number {
  const index = ROUNDING_STEPS[from].indexOf(value);
  return index === -1 ? defaultRoundingFor(category, to) : ROUNDING_STEPS[to][index];
}
