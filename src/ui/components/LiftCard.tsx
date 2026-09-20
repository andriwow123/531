import { useEffect, useRef, useState } from 'react';
import { buildWorkout, computePlates, estimate1RM } from '../../domain';
import type { LiftKey, SetKind, Unit, WeekNumber, WorkingSet } from '../../domain';
import { sessionRepo } from '../../data/repositories';
import type { Cycle, LoggedSet, Session } from '../../data/repositories';
import type { SettingsState } from '../../settings/schema';
import { resolveDisplay } from '../../settings/display';
import ExerciseDemo from './ExerciseDemo';
import SupportingLifts from './SupportingLifts';

export interface LiftCardProps {
  liftKey: LiftKey;
  week: WeekNumber;
  cycle: Cycle;
  unit: Unit;
  roundingIncrement: number;
  dayNumber: number;
  settings: SettingsState;
  onLogged?: () => void;
  /**
   * Pre-resolved logged session for this lift/week, supplied by a parent
   * that already loaded the cycle's sessions (avoids a redundant per-card
   * DB lookup and the resulting one-tick flash from interactive -> read-only).
   * `undefined` (prop omitted) preserves the legacy self-lookup behavior;
   * `null` means "confirmed not logged"; a `Session` means "confirmed logged".
   */
  session?: Session | null;
}

const LIFT_NAMES: Record<LiftKey, string> = {
  press: 'Overhead Press',
  bench: 'Bench Press',
  squat: 'Squat',
  deadlift: 'Deadlift',
};

const KIND_LABEL: Record<SetKind, string> = {
  warmup: 'warm-up',
  main: 'work',
  supplemental: 'supplemental',
};

const BAR_WEIGHT: Record<Unit, number> = { kg: 20, lb: 45 };
const PLATE_SET: Record<Unit, number[]> = {
  kg: [25, 20, 15, 10, 5, 2.5, 1.25],
  lb: [45, 35, 25, 10, 5, 2.5],
};

interface RowState {
  set: WorkingSet;
  done: boolean;
  actualReps: number;
  /** 1-based position of this set within its own kind (e.g. 2nd warm-up). */
  kindIndex: number;
}

function withKindIndex(sets: WorkingSet[]): RowState[] {
  const counts: Record<SetKind, number> = { warmup: 0, main: 0, supplemental: 0 };
  return sets.map((set) => {
    counts[set.kind] += 1;
    return { set, done: false, actualReps: set.reps, kindIndex: counts[set.kind] };
  });
}

/** Per-side plate breakdown, e.g. "5 · 1.25", or "empty bar" when the bar alone suffices. */
function formatPlates(weight: number, unit: Unit): string {
  const { perSide, leftover } = computePlates(weight, BAR_WEIGHT[unit], PLATE_SET[unit]);
  if (perSide.length === 0) return 'empty bar';
  const parts = perSide.flatMap((p) => Array<string>(p.count).fill(String(p.plate)));
  const base = parts.join(' · ');
  return leftover > 0 ? `${base} (+${leftover} left over)` : base;
}

/**
 * A single lift's full cycle-overview card: header (name / day / training
 * max), the prescribed set table with per-set plate breakdowns and an
 * AMRAP-highlighted top set, and inline logging that saves a Session once
 * every main work set is marked done. Collapsed exercise-demo and
 * supporting-lifts panels are embedded per settings.
 */
export default function LiftCard({
  liftKey,
  week,
  cycle,
  unit,
  roundingIncrement,
  dayNumber,
  settings,
  onLogged,
  session,
}: LiftCardProps) {
  const display = resolveDisplay(settings.displayPreset, settings.displayOverrides);

  const [rows, setRows] = useState<RowState[]>([]);
  const [rowsForRef, setRowsForRef] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [noteOpen, setNoteOpen] = useState(false);

  // Seeded from the `session` prop when a parent already resolved it, so a
  // parent-provided session renders read-only on the very first commit (no
  // interactive -> read-only flash). `null` (no prop) falls back to the
  // optimistic "no session yet" assumption; the mount effect below corrects
  // this to the real logged session, if any, once the async self-lookup
  // resolves (only taken when the prop is omitted).
  const [existingSession, setExistingSession] = useState<Session | null>(() =>
    session !== undefined ? session : null,
  );
  const [saveError, setSaveError] = useState(false);
  const savingRef = useRef(false);

  const showWarmups = settings.template.warmups && display.warmups;
  const workoutKey = `${liftKey}:${week}:${cycle.id ?? 'x'}:${cycle.tm[liftKey]}:${showWarmups}`;
  if (workoutKey !== rowsForRef) {
    setRows(
      withKindIndex(
        buildWorkout({
          tm: cycle.tm[liftKey],
          week,
          template: cycle.template,
          fivesPro: cycle.fivesPro,
          warmups: showWarmups,
          roundingIncrement,
        }),
      ),
    );
    setRowsForRef(workoutKey);
    setNotes('');
    setNoteOpen(false);
  }

  useEffect(() => {
    let cancelled = false;
    savingRef.current = false;

    // A parent that already loaded this cycle's sessions passes the
    // pre-resolved session (or `null` for "confirmed none") — skip the
    // self-lookup and just sync from the prop.
    if (session !== undefined) {
      setExistingSession(session);
      return;
    }

    async function check() {
      if (cycle.id == null) {
        if (!cancelled) setExistingSession(null);
        return;
      }
      const sessions = await sessionRepo.forCycle(cycle.id);
      if (cancelled) return;
      const found =
        sessions.find((s) => s.status === 'done' && s.liftKey === liftKey && s.week === week) ?? null;
      setExistingSession(found);
    }

    void check();
    return () => {
      cancelled = true;
    };
  }, [cycle.id, liftKey, week, session]);

  async function save() {
    const sets: LoggedSet[] = rows.map((r) => ({
      targetReps: r.set.reps,
      weight: r.set.weight,
      actualReps: r.done ? r.actualReps : null,
      done: r.done,
      isAmrap: r.set.isAmrap,
      kind: r.set.kind,
    }));

    const amrapRow = rows.find((r) => r.set.isAmrap);
    const amrapReps = amrapRow?.done ? amrapRow.actualReps : null;
    const estimated1RM = amrapRow && amrapReps != null ? estimate1RM(amrapRow.set.weight, amrapReps) : null;

    const newSession: Session = {
      cycleId: cycle.id as number,
      week,
      liftKey,
      date: new Date().toISOString(),
      status: 'done',
      sets,
      amrapReps,
      estimated1RM,
      rpe: null,
      notes,
    };

    const id = await sessionRepo.add(newSession);
    setExistingSession({ ...newSession, id });
    onLogged?.();
  }

  // Guarded save: on failure (e.g. IndexedDB quota / private mode) reset the
  // in-flight guard and surface a retry affordance rather than silently
  // stranding a "done" workout with nothing persisted.
  function triggerSave() {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaveError(false);
    save().catch(() => {
      savingRef.current = false;
      setSaveError(true);
    });
  }

  // Auto-save the moment every main ("work") set is marked done.
  useEffect(() => {
    if (existingSession !== null) return;
    if (savingRef.current) return;
    const mainRows = rows.filter((r) => r.set.kind === 'main');
    if (mainRows.length === 0 || !mainRows.every((r) => r.done)) return;
    triggerSave();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, existingSession]);

  function toggleDone(index: number) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, done: !r.done } : r)));
  }

  function changeReps(index: number, reps: number) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, actualReps: reps } : r)));
  }

  const tm = cycle.tm[liftKey];

  const visibleRows = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => !(settings.hideCompletedWarmups && row.set.kind === 'warmup' && row.done));

  return (
    <section className="rounded-[var(--r-card)] border border-[var(--line)] bg-[var(--surface)] p-4">
      <header className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold leading-tight">{LIFT_NAMES[liftKey]}</h2>
          <div className="text-[12px] font-semibold text-[var(--muted)]">Day {dayNumber}</div>
        </div>
        <div className="text-right">
          <div className="text-[10.5px] font-bold uppercase tracking-wide text-[var(--muted)]">
            training max
          </div>
          <div className="text-sm font-extrabold tabular-nums">
            {tm} {unit}
          </div>
        </div>
      </header>

      {existingSession != null && (
        <div className="flex items-center justify-between gap-2 rounded-[var(--r-card)] bg-[var(--surface-2)] px-3 py-2.5 text-[13px] font-bold text-[var(--muted)]">
          <span>
            <span aria-hidden="true">✓</span> Logged this week
          </span>
          {existingSession.amrapReps != null && (
            <span className="tabular-nums">
              {existingSession.amrapReps} reps
              {existingSession.estimated1RM != null &&
                ` · est. 1RM ${Math.round(existingSession.estimated1RM)} ${unit}`}
            </span>
          )}
        </div>
      )}

      {existingSession != null && existingSession.notes && (
        <p className="mt-2 text-[13px] font-semibold text-[var(--muted)]">{existingSession.notes}</p>
      )}

      {existingSession === null && saveError && (
        <div
          role="alert"
          className="mb-2 flex items-center justify-between gap-2 rounded-[var(--r-card)] border border-[var(--accent)] bg-[var(--surface-2)] px-3 py-2.5 text-[13px] font-bold text-[var(--text)]"
        >
          <span>Couldn't save — check device storage.</span>
          <button
            type="button"
            onClick={triggerSave}
            className="rounded-[var(--r-pill)] bg-[var(--accent)] px-3.5 py-1.5 text-[13px] font-extrabold text-[var(--on-accent)]"
          >
            Retry
          </button>
        </div>
      )}

      {existingSession === null && (
        <ul className="flex flex-col gap-2 list-none p-0 m-0">
          {visibleRows.map(({ row, index }) => {
            const { set, done, actualReps, kindIndex } = row;
            const rowLabel = `${KIND_LABEL[set.kind]} set ${kindIndex} (${set.weight}${unit})`;
            const pct = Math.round(set.pct * 100);
            const plateText = formatPlates(set.weight, unit);

            if (set.isAmrap) {
              return (
                <li
                  key={index}
                  className={
                    'rounded-[var(--r-hero)] p-4 transition-colors ' +
                    (done
                      ? 'bg-[var(--surface-2)] text-[var(--text)]'
                      : 'bg-[var(--accent)] text-[var(--on-accent)]')
                  }
                >
                  <div className="flex items-center gap-3">
                    <div className="w-16 flex-none">
                      <div className="text-[13px] font-bold">{KIND_LABEL[set.kind]}</div>
                      <div className="text-[12px] font-semibold opacity-80">{pct}%</div>
                    </div>
                    <div className="flex flex-1 items-baseline justify-center gap-1">
                      <span className="text-[40px] font-extrabold leading-none tabular-nums">
                        {set.weight}
                      </span>
                      <span className="text-[13px] font-bold">{unit}</span>
                    </div>
                    <div className="flex-none text-right">
                      <div className="text-[17px] font-extrabold tabular-nums">×{set.reps}+</div>
                      <div className="text-[11px] font-bold opacity-80">{plateText}</div>
                    </div>
                  </div>

                  <div className="mt-1 text-[12.5px] font-bold">as many reps as possible</div>

                  {done ? (
                    <div className="mt-2.5 flex items-center justify-between text-[13px] font-bold">
                      <span>Logged {actualReps} reps</span>
                      <button type="button" onClick={() => toggleDone(index)} className="underline underline-offset-2">
                        Edit
                      </button>
                    </div>
                  ) : (
                    <div className="mt-3 flex items-center gap-2">
                      <label htmlFor={`amrap-reps-${liftKey}`} className="text-[13px] font-bold">
                        Reps done
                      </label>
                      <input
                        id={`amrap-reps-${liftKey}`}
                        type="number"
                        inputMode="numeric"
                        min={0}
                        aria-label="Reps done"
                        value={actualReps}
                        onChange={(e) => changeReps(index, Number(e.target.value) || 0)}
                        className="w-16 rounded-lg bg-[var(--overlay-on-accent)] px-2 py-1.5 text-center font-bold text-inherit outline-none appearance-none [-moz-appearance:textfield] [&::-webkit-outer-spin-button]:m-0 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <button
                        type="button"
                        onClick={() => toggleDone(index)}
                        aria-label={`Mark ${rowLabel} AMRAP set done`}
                        className="ml-auto rounded-[var(--r-pill)] bg-[var(--overlay-on-accent)] px-3.5 py-1.5 text-[13px] font-extrabold"
                      >
                        Done
                      </button>
                    </div>
                  )}
                </li>
              );
            }

            return (
              <li
                key={index}
                className={
                  'flex items-center gap-3 rounded-[var(--r-card)] bg-[var(--surface-2)] px-3.5 py-3 transition-opacity ' +
                  (done ? 'opacity-60' : '')
                }
              >
                <div className="w-16 flex-none">
                  <div className="text-[13px] font-bold">{KIND_LABEL[set.kind]}</div>
                  <div className="text-[12px] font-semibold text-[var(--muted)]">{pct}%</div>
                </div>
                <div className="flex flex-1 items-baseline justify-center gap-1">
                  <span className="text-[26px] font-extrabold tabular-nums">{set.weight}</span>
                  <span className="text-[12px] font-semibold text-[var(--muted)]">{unit}</span>
                </div>
                <div className="flex-none text-right">
                  <div className="text-[15px] font-extrabold tabular-nums">×{set.reps}</div>
                  <div className="text-[11px] font-semibold text-[var(--muted)]">{plateText}</div>
                </div>
                <button
                  type="button"
                  onClick={() => toggleDone(index)}
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
          })}
        </ul>
      )}

      {display.notes && existingSession === null && (
        <div className="mt-3 rounded-[var(--r-card)] border border-[var(--line)] bg-[var(--surface)] p-4">
          {noteOpen ? (
            <>
              <label htmlFor={`lift-note-${liftKey}`} className="mb-2 block text-sm font-semibold">
                Notes
              </label>
              <textarea
                id={`lift-note-${liftKey}`}
                autoFocus
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
            </>
          ) : (
            <button
              type="button"
              onClick={() => setNoteOpen(true)}
              className="text-sm font-semibold text-[var(--accent)]"
            >
              {notes.trim() ? notes : '+ Add note'}
            </button>
          )}
        </div>
      )}

      {settings.exerciseDemos && (
        <div className="mt-3">
          <ExerciseDemo liftKey={liftKey} />
        </div>
      )}

      {settings.assistanceTracking && (
        <div className="mt-3">
          <SupportingLifts liftKey={liftKey} tm={tm} unit={unit} roundingIncrement={roundingIncrement} />
        </div>
      )}
    </section>
  );
}
