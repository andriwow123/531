import type { WeekNumber } from '../../domain';

export interface WeekTabsProps {
  week: WeekNumber;
  onChange: (week: WeekNumber) => void;
}

const WEEKS: { week: WeekNumber; label: string }[] = [
  { week: 1, label: 'Week 1 · 5s' },
  { week: 2, label: 'Week 2 · 3s' },
  { week: 3, label: 'Week 3 · 5/3/1' },
  { week: 4, label: 'Deload · easy' },
];

/**
 * Segmented week selector for the cycle overview: lets the user browse any
 * of the 4 training weeks independently of which week is "current" (the
 * cycle's actual progress is driven by logged sessions, not this control).
 */
export default function WeekTabs({ week, onChange }: WeekTabsProps) {
  return (
    <div className="grid grid-cols-4 gap-1.5" role="group" aria-label="Training week">
      {WEEKS.map(({ week: w, label }) => {
        const selected = w === week;
        return (
          <button
            key={w}
            type="button"
            onClick={() => onChange(w)}
            aria-pressed={selected}
            className={
              'rounded-[var(--r-card)] border px-1.5 py-2 text-center text-[11px] font-bold leading-tight transition-colors ' +
              (selected
                ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                : 'border-[var(--line)] bg-[var(--surface)] text-[var(--text)]')
            }
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
