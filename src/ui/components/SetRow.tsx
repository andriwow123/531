import type { SetKind, Unit } from '../../domain';

export interface PlateBreakdown {
  perSide: { plate: number; count: number }[];
  leftover: number;
}

export interface SetRowProps {
  weight: number;
  unit: Unit;
  targetReps: number;
  isAmrap: boolean;
  /** Set kind (warm-up / main / supplemental), used to build a unique label. */
  kind: SetKind;
  /** 1-based position of this row within its own kind (e.g. 2nd warm-up). */
  setNumber: number;
  done: boolean;
  actualReps: number;
  onToggleDone: () => void;
  onRepsChange: (reps: number) => void;
  plates?: PlateBreakdown | null;
}

const KIND_LABEL: Record<SetKind, string> = {
  warmup: 'warm-up',
  main: 'main',
  supplemental: 'supplemental',
};

/**
 * One prescribed set: a big tabular weight, its unit, target reps, and a way
 * to log it. Used for every set kind (warm-up, main, supplemental) — the
 * AMRAP top set gets the warm-orange gradient hero treatment and a rep-entry
 * field instead of a plain toggle, but it renders through this same component.
 */
export default function SetRow({
  weight,
  unit,
  targetReps,
  isAmrap,
  kind,
  setNumber,
  done,
  actualReps,
  onToggleDone,
  onRepsChange,
  plates,
}: SetRowProps) {
  const rowLabel = `${KIND_LABEL[kind]} set ${setNumber} (${weight}${unit})`;

  if (isAmrap) {
    return (
      <li
        className={
          'rounded-[var(--r-hero)] p-4 transition-colors ' +
          (done
            ? 'bg-[var(--surface-2)] text-[var(--text)]'
            : 'bg-gradient-to-br from-[var(--accent)] to-[var(--accent-strong)] text-[var(--on-accent)]')
        }
      >
        <div className="flex items-center gap-2.5">
          <span className="text-[44px] font-extrabold leading-none tabular-nums">{weight}</span>
          <span className="-ml-1 text-[15px] font-bold">{unit}</span>
          <span
            className={
              'ml-auto rounded-[var(--r-pill)] px-2.5 py-1 text-[13px] font-extrabold ' +
              (done ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'bg-[var(--overlay-on-accent)]')
            }
          >
            {targetReps}+ AMRAP
          </span>
        </div>

        {done ? (
          <div className="mt-2.5 flex items-center justify-between text-[13px] font-bold">
            <span>Logged {actualReps} reps</span>
            <button type="button" onClick={onToggleDone} className="underline underline-offset-2">
              Edit
            </button>
          </div>
        ) : (
          <div className="mt-3 flex items-center gap-2">
            <label htmlFor="amrap-reps-done" className="text-[13px] font-bold">
              Reps done
            </label>
            <input
              id="amrap-reps-done"
              type="number"
              inputMode="numeric"
              min={0}
              aria-label="Reps done"
              value={actualReps}
              onChange={(e) => onRepsChange(Number(e.target.value) || 0)}
              className="w-16 rounded-lg bg-[var(--overlay-on-accent)] px-2 py-1.5 text-center font-bold text-inherit outline-none appearance-none [-moz-appearance:textfield] [&::-webkit-outer-spin-button]:m-0 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none"
            />
            <button
              type="button"
              onClick={onToggleDone}
              aria-label={`Mark ${rowLabel} AMRAP set done`}
              className="ml-auto rounded-[var(--r-pill)] bg-[var(--overlay-on-accent)] px-3.5 py-1.5 text-[13px] font-extrabold"
            >
              Done
            </button>
          </div>
        )}

        {plates && plates.perSide.length > 0 && (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11.5px] font-bold">
            <b className="mr-0.5">Per side</b>
            {plates.perSide.map((p) => (
              <span key={p.plate} className="rounded-[var(--r-pill)] bg-[var(--overlay-on-accent)] px-2.5 py-0.5 tabular-nums">
                {p.plate}
                {p.count > 1 ? `×${p.count}` : ''}
              </span>
            ))}
          </div>
        )}
      </li>
    );
  }

  return (
    <li
      className={
        'flex items-center gap-3 rounded-[var(--r-card)] bg-[var(--surface-2)] px-4 py-3.5 transition-opacity ' +
        (done ? 'opacity-60' : '')
      }
    >
      {kind === 'warmup' && (
        <span className="flex-none rounded-[var(--r-pill)] bg-[var(--surface)] px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-[var(--muted)]">
          Warm-up
        </span>
      )}
      <span className="text-[28px] font-extrabold tabular-nums">{weight}</span>
      <span className="-ml-1.5 text-[13px] font-semibold text-[var(--muted)]">{unit}</span>
      <span className="ml-auto text-[13px] font-semibold text-[var(--muted)]">{targetReps} reps</span>
      <button
        type="button"
        onClick={onToggleDone}
        aria-pressed={done}
        aria-label={`Mark ${rowLabel} done`}
        className={
          'grid h-[22px] w-[22px] flex-none place-items-center rounded-full text-xs font-extrabold ' +
          (done ? 'bg-[var(--accent)] text-[var(--on-accent)]' : 'bg-[var(--line)] text-transparent')
        }
      >
        ✓
      </button>
    </li>
  );
}
