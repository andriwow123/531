import { roundToIncrement } from './rounding';

export interface ProgressionInput {
  topSetCompleted: boolean;   // hit >=1 prescribed rep on the week-3 1+ set
  rpe: number;                // 0.5 steps
  currentTm: number;
  increment: number;
  roundingIncrement: number;
  thresholds?: { bumpRpeMax: number; holdRpeMin: number };
}
export type ProgressionDecision = 'bump' | 'hold' | 'reset';
export interface ProgressionResult { decision: ProgressionDecision; newTm: number; }

export function suggestProgression(input: ProgressionInput): ProgressionResult {
  const bumpRpeMax = input.thresholds?.bumpRpeMax ?? 9;
  if (!input.topSetCompleted) {
    return { decision: 'reset', newTm: roundToIncrement(input.currentTm * 0.9, input.roundingIncrement) };
  }
  if (input.rpe <= bumpRpeMax) {
    return { decision: 'bump', newTm: roundToIncrement(input.currentTm + input.increment, input.roundingIncrement) };
  }
  return { decision: 'hold', newTm: input.currentTm };
}
