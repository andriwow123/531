import { useEffect, useState } from 'react';
import { aggregateSupportingHistory } from '../../domain';
import type { SupportingExerciseHistory } from '../../domain';
import { supportingDoneRepo } from '../../data/repositories';

/** History-screen section: each logged supporting exercise with its recent
 *  weight×reps (most-recent-first). Reads the same rows the pre-fill uses. */
export default function SupportingHistory() {
  const [groups, setGroups] = useState<SupportingExerciseHistory[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    supportingDoneRepo.allLogged().then((rows) => {
      if (!cancelled) setGroups(aggregateSupportingHistory(rows));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (groups === null) return null;

  return (
    <section className="mt-5" aria-label="Supporting-lift history">
      <h2 className="mb-2 text-sm font-extrabold text-[var(--muted)]">Supporting lifts</h2>
      {groups.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">Log supporting exercises and their history shows up here.</p>
      ) : (
        <ul className="flex flex-col gap-3 list-none p-0 m-0">
          {groups.map((g) => (
            <li
              key={`${g.category}|${g.name}`}
              className="rounded-[var(--r-card)] border border-[var(--line)] bg-[var(--surface)] p-3"
            >
              <h3 className="text-sm font-extrabold">{g.name}</h3>
              <ul className="mt-1.5 flex flex-col gap-1 list-none p-0 m-0">
                {g.entries.map((e, i) => (
                  <li key={`${e.date}-${i}`} className="flex items-center justify-between text-[13px] tabular-nums">
                    <span className="text-[var(--muted)]">{e.date}</span>
                    <span className="font-bold">
                      {e.weight ?? '—'}
                      {' × '}
                      {e.reps ?? '—'}
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
