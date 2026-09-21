import type { LiftKey, TemplateKey } from '../domain/types';

export type DisplayPreset = 'simple' | 'standard' | 'detailed';
export type DisplayElement = 'plateBreakdown' | 'restTimer' | 'notes' | 'estimated1RM' | 'warmups' | 'charts' | 'amrapPrBadges' | 'assistanceSection' | 'bodyweightWidget';
export interface SettingsState {
  displayPreset: DisplayPreset;
  displayOverrides: Partial<Record<DisplayElement, boolean>>;
  template: { selected: TemplateKey; fivesPro: boolean; warmups: boolean };
  restTimer: { enabled: boolean; defaultSeconds: number; notify: boolean };
  schedule: { mode: 'rolling' | 'fixedDays'; days: number[] };
  progression: { upperIncrement: number; lowerIncrement: number };
  /** Retired: completed sets (including warm-ups) always stay visible on
   *  Home now. Kept only for saved-settings shape compatibility; no longer
   *  read anywhere. */
  hideCompletedWarmups: boolean;
  theme: 'dark' | 'light' | 'system';
  /** When true, Home shows an expandable "How to perform" demo for the selected lift. */
  exerciseDemos: boolean;
  bodyweightTracking: boolean;
  assistanceTracking: boolean;
  /** Display order of the 4 lifts on Home's day pager/DayStrip. Additive field —
   *  old saved settings may lack it; see `orderedLifts` for the tolerant fallback. */
  liftOrder: LiftKey[];
}

export const defaultSettings: SettingsState = {
  displayPreset: 'standard',
  displayOverrides: {},
  template: { selected: 'base', fivesPro: false, warmups: true },
  restTimer: { enabled: true, defaultSeconds: 120, notify: false },
  schedule: { mode: 'rolling', days: [] },
  progression: { upperIncrement: 2.5, lowerIncrement: 5 },
  hideCompletedWarmups: false,
  theme: 'system',
  exerciseDemos: true,
  bodyweightTracking: true,
  assistanceTracking: true,
  liftOrder: ['press', 'bench', 'squat', 'deadlift'],
};
