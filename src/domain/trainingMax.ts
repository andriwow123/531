import { roundToIncrement } from './rounding';

export function computeTrainingMax(oneRm: number, tmPercent: number, roundingIncrement: number): number {
  return roundToIncrement(oneRm * tmPercent, roundingIncrement);
}
