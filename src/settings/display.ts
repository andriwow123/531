import type { DisplayPreset, DisplayElement } from './schema';

const ALL: DisplayElement[] = ['plateBreakdown', 'restTimer', 'notes', 'estimated1RM', 'warmups', 'charts', 'amrapPrBadges', 'assistanceSection', 'bodyweightWidget'];
const PRESETS: Record<DisplayPreset, DisplayElement[]> = {
  simple: [],
  standard: ['plateBreakdown', 'restTimer', 'notes', 'estimated1RM', 'warmups'],
  detailed: [...ALL],
};

export function resolveDisplay(
  preset: DisplayPreset, overrides: Partial<Record<DisplayElement, boolean>>,
): Record<DisplayElement, boolean> {
  const on = new Set(PRESETS[preset]);
  const out = {} as Record<DisplayElement, boolean>;
  for (const el of ALL) out[el] = overrides[el] ?? on.has(el);
  return out;
}
