import type { BodyweightEntry } from '../data/repositories';

export function bodyweightSeries(entries: BodyweightEntry[]): { date: string; weight: number }[] {
  return entries.map((x) => ({ date: x.date, weight: x.weight })).sort((a, b) => a.date.localeCompare(b.date));
}

export function latestWeight(entries: BodyweightEntry[]): number | null {
  if (entries.length === 0) return null;
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date) || (a.id ?? 0) - (b.id ?? 0));
  return sorted[sorted.length - 1].weight;
}

/** Picks a round tick step from the plotted range: tight ranges get a fine
 *  step, wide ranges get a coarse one, so the Y-axis never lands on odd
 *  increments like the chart library's own 'auto' domain produces. */
function niceStep(range: number): number {
  if (range <= 10) return 2;
  if (range <= 25) return 5;
  if (range <= 60) return 10;
  return 20;
}

/**
 * Computes a clean, rounded Y-axis domain + evenly-spaced round ticks for a
 * set of plotted bodyweights. Pads the data's min/max out to the next step
 * multiple (and one step further when the raw value already sits exactly on
 * a step, so a point never renders flush against the axis edge).
 */
export function bodyweightAxis(weights: number[]): { domain: [number, number]; ticks: number[] } {
  if (weights.length === 0) return { domain: [0, 1], ticks: [0, 1] };

  const min = Math.min(...weights);
  const max = Math.max(...weights);
  const step = niceStep(max - min);

  let floor = Math.floor(min / step) * step;
  let ceil = Math.ceil(max / step) * step;
  if (floor === min) floor -= step;
  if (ceil === max) ceil += step;
  if (floor < 0) floor = 0;

  const ticks: number[] = [];
  for (let t = floor; t <= ceil + 1e-9; t += step) {
    ticks.push(Math.round(t * 100) / 100);
  }
  if (ticks.length < 2) ticks.push(ceil);

  return { domain: [floor, ceil], ticks };
}
