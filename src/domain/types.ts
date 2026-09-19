export type Unit = 'kg' | 'lb';
export type LiftKey = 'press' | 'bench' | 'squat' | 'deadlift';
export type LiftCategory = 'upper' | 'lower';
export type WeekNumber = 1 | 2 | 3 | 4;
export type TemplateKey = 'base' | 'bbb' | 'fsl';
export type SetKind = 'warmup' | 'main' | 'supplemental';

export interface WorkingSet {
  kind: SetKind;
  pct: number;       // fraction of TM (0..1)
  reps: number;      // prescribed reps
  isAmrap: boolean;
  weight: number;    // rounded absolute load
}
