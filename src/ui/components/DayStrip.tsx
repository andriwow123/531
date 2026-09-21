import type { LiftKey } from '../../domain';

export interface DayStripProps {
  lifts: { key: LiftKey; label: string }[];
  activeDay: number;
  doneKeys: Set<LiftKey>;
  onSelect: (index: number) => void;
}

/**
 * Horizontal day selector for the cycle-overview pager: one button per lift
 * (Press/Bench/Squat/Deadlift). The active day is accent-styled and marked
 * `aria-current`; a done lift (for the selected week) shows a ✓ badge.
 * Purely presentational — `Home` owns `activeDay` and syncs it with the
 * scroll-snap pager.
 */
export default function DayStrip({ lifts, activeDay, doneKeys, onSelect }: DayStripProps) {
  return (
    <div className="grid grid-cols-4 gap-1.5" role="group" aria-label="Training day">
      {lifts.map(({ key, label }, index) => {
        const active = index === activeDay;
        const done = doneKeys.has(key);
        return (
          <button
            key={key}
            type="button"
            onClick={() => onSelect(index)}
            aria-current={active ? 'true' : undefined}
            className={
              'relative rounded-[var(--r-card)] border px-1.5 py-2 text-center text-[12px] font-bold leading-tight transition-colors ' +
              (active
                ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                : 'border-[var(--line)] bg-[var(--surface)] text-[var(--muted)]')
            }
          >
            {label}
            {done && (
              <span aria-label="done" className="ml-1 text-[var(--accent)]">
                ✓
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
