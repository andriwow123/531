import type { BodyweightEntry } from '../data/repositories';

export function bodyweightSeries(entries: BodyweightEntry[]): { date: string; weight: number }[] {
  return entries.map((x) => ({ date: x.date, weight: x.weight })).sort((a, b) => a.date.localeCompare(b.date));
}

export function latestWeight(entries: BodyweightEntry[]): number | null {
  if (entries.length === 0) return null;
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date) || (a.id ?? 0) - (b.id ?? 0));
  return sorted[sorted.length - 1].weight;
}
