import type { SupportingDone, AssistanceCategory } from '../data/repositories';

export interface SupportingExerciseHistory {
  category: AssistanceCategory;
  name: string;
  entries: { date: string; weight: number | null; reps: number | null }[];
}

/** Groups logged supporting entries by category+name; entries most-recent-first
 *  (capped at `recentLimit`), exercises ordered by their most-recent entry. */
export function aggregateSupportingHistory(rows: SupportingDone[], recentLimit = 8): SupportingExerciseHistory[] {
  const logged = rows.filter((r) => r.weight !== null || r.reps !== null);
  const groups = new Map<string, SupportingExerciseHistory>();
  for (const r of logged) {
    const key = `${r.category}|${r.name}`;
    let g = groups.get(key);
    if (!g) {
      g = { category: r.category, name: r.name, entries: [] };
      groups.set(key, g);
    }
    g.entries.push({ date: r.date, weight: r.weight, reps: r.reps });
  }
  const result = [...groups.values()];
  for (const g of result) {
    g.entries.sort((a, b) => b.date.localeCompare(a.date));
    g.entries = g.entries.slice(0, recentLimit);
  }
  result.sort((a, b) => (b.entries[0]?.date ?? '').localeCompare(a.entries[0]?.date ?? ''));
  return result;
}
