export type { Unit, LiftKey, LiftCategory, WeekNumber, TemplateKey, SetKind, WorkingSet } from './types';

export { roundToIncrement } from './rounding';
export { computeTrainingMax } from './trainingMax';
export { estimate1RM } from './estimate';
export { generateMainSets, generateWarmups, generateSupplemental } from './sets';
export { computePlates } from './plates';
export { suggestProgression } from './progression';
export type { ProgressionInput, ProgressionDecision, ProgressionResult } from './progression';
export { buildWorkout } from './workout';
export type { WorkoutParams } from './workout';
export { nextUp, LIFT_ORDER } from './schedule';
export type { LoggedSession } from './schedule';
export { estimatedOneRmSeries, trainingMaxSeries, personalRecord } from './history';
export type { OneRmPoint, TmPoint, PR } from './history';
