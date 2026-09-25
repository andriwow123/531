import { useEffect, useRef, useState } from 'react';
import { buildWorkout, computePlates, estimate1RM, workoutRowKey } from '../../domain';
import type { LiftKey, SetKind, TemplateKey, Unit, WeekNumber, WorkingSet } from '../../domain';
import { cycleRepo, sessionRepo, workoutDayRepo } from '../../data/repositories';
import type { Cycle, LoggedSet, Session, WorkoutDay } from '../../data/repositories';
import type { SettingsState } from '../../settings/schema';
import { resolveDisplay } from '../../settings/display';
import ExerciseDemo from './ExerciseDemo';
import SupportingLifts from './SupportingLifts';
import WorkoutTimer from './WorkoutTimer';
import Chevron from './Chevron';

export interface LiftCardProps {
  liftKey: LiftKey;
  week: WeekNumber;
  cycle: Cycle;
  unit: Unit;
  roundingIncrement: number;
  dayNumber: number;
  settings: SettingsState;
  onLogged?: () => void;
  /** Called after a training-max edit is saved, so a parent can re-load the cycle. */
  onTmChange?: () => void;
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
  /** This row's key in the day's saved progress (`workoutRowKey`). */
  progressKey: string;
}

function withKindIndex(sets: WorkingSet[], template: TemplateKey): RowState[] {
  const counts: Record<SetKind, number> = { warmup: 0, main: 0, supplemental: 0 };
  return sets.map((set) => {
    counts[set.kind] += 1;
    const kindIndex = counts[set.kind];
    return {
      set,
      done: false,
      actualReps: set.reps,
      kindIndex,
      progressKey: workoutRowKey(set.kind, kindIndex, template),
    };
  });
}

/** A day's in-progress (not yet logged) sets and note, as saved on its `WorkoutDay`. */
interface Draft {
  /** The day this draft belongs to (see `dayKeyOf`). */
  dayKey: string;
  progress: WorkoutDay['progress'];
  notes: string;
}

function dayKeyOf(cycleId: number | undefined, week: WeekNumber, liftKey: LiftKey): string {
  return `${cycleId ?? 'x'}:${week}:${liftKey}`;
}

/** Each row's saveable state. `actualReps` stays `null` while it matches the
 *  prescription, so a restore follows a changed prescription (e.g. 5s PRO
 *  switched on) instead of pinning the old default. */
function progressOf(rows: RowState[]): WorkoutDay['progress'] {
  const progress: WorkoutDay['progress'] = {};
  for (const row of rows) {
    progress[row.progressKey] = { done: row.done, actualReps: row.actualReps === row.set.reps ? null : row.actualReps };
  }
  return progress;
}

/** Freshly built rows with a draft's saved progress applied, matched by row key. */
function restoreProgress(rows: RowState[], progress: WorkoutDay['progress']): RowState[] {
  return rows.map((row) => {
    const saved = progress[row.progressKey];
    return saved ? { ...row, done: saved.done, actualReps: saved.actualReps ?? row.set.reps } : row;
  });
}

/** 1-based position of each logged set within its own kind (e.g. 2nd
 *  warm-up), matching the interactive rows' per-kind numbering. */
function loggedKindIndexes(sets: LoggedSet[]): number[] {
  const counts: Record<SetKind, number> = { warmup: 0, main: 0, supplemental: 0 };
  return sets.map((s) => {
    counts[s.kind] += 1;
    return counts[s.kind];
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
  onTmChange,
  session,
}: LiftCardProps) {
  const display = resolveDisplay(settings.displayPreset, settings.displayOverrides);

  const [rows, setRows] = useState<RowState[]>([]);
  const [rowsForRef, setRowsForRef] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [noteOpen, setNoteOpen] = useState(false);

  // The workout day this render is for. Home keeps every LiftCard mounted and
  // just changes `week` when a week tab is tapped, so anything that finishes
  // later (a draft load, a save) must check it is still for the day on screen
  // before touching this card's state. The ref mirrors the latest value for
  // those late continuations (same pattern as WorkoutTimer).
  const dayKey = dayKeyOf(cycle.id, week, liftKey);
  const identityRef = useRef(dayKey);
  identityRef.current = dayKey;

  // The day's in-progress draft, once loaded from its WorkoutDay (null until
  // then). It only ever describes the day on screen: leaving a day drops it
  // right here, so coming back always restores from what was stored rather
  // than from a copy that may have missed a save's clear.
  const [draft, setDraft] = useState<Draft | null>(null);
  if (draft !== null && draft.dayKey !== dayKey) setDraft(null);
  const draftReady = draft !== null && draft.dayKey === dayKey;

  // Latest draft and rows for the event handlers, updated synchronously on
  // every change so a second tap that lands before a re-render still builds
  // on the first (a handler's own `rows`/`draft` would be one tap behind).
  const draftRef = useRef<Draft | null>(null);
  const rowsRef = useRef<RowState[]>([]);

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
  // Days (their `dayKey`s) with a session save in flight on this card, kept
  // once it succeeds. Per day, not one flag: leaving a day mid-save and
  // coming straight back restores its draft with every main set still done,
  // and that must not start a second save of the same day (a duplicate
  // Session). Other days save independently; a failed save removes its day
  // so it can be retried (Retry, or on return via its restored draft).
  const savingRef = useRef(new Set<string>());

  // Inline training-max editor state (header). Only ever open while the lift
  // is unlogged; closed by Save (after persisting) or Cancel.
  const [editingTm, setEditingTm] = useState(false);
  const [tmInput, setTmInput] = useState('');

  const showWarmups = settings.template.warmups && display.warmups;
  // `draftReady` is part of the key, so the draft's arrival rebuilds the list
  // with the saved progress applied.
  const workoutKey = `${liftKey}:${week}:${cycle.id ?? 'x'}:${cycle.tm[liftKey]}:${showWarmups}:${cycle.template}:${cycle.fivesPro}:${roundingIncrement}:${draftReady}`;
  if (workoutKey !== rowsForRef) {
    const built = withKindIndex(
      buildWorkout({
        tm: cycle.tm[liftKey],
        week,
        template: cycle.template,
        fivesPro: cycle.fivesPro,
        warmups: showWarmups,
        roundingIncrement,
      }),
      cycle.template,
    );
    setRows(draftReady ? restoreProgress(built, draft.progress) : built);
    setRowsForRef(workoutKey);
    setNotes(draftReady ? draft.notes : '');
    setNoteOpen(false);
    setSaveError(false);
    setEditingTm(false);
  }
  rowsRef.current = rows;

  useEffect(() => {
    let cancelled = false;

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

  // Loads the day's saved draft on mount and whenever the day changes. The
  // result is tagged with the day it was read for, and a load for a day the
  // card has already left is dropped (cancelled) rather than applied.
  useEffect(() => {
    if (cycle.id == null) return;
    let cancelled = false;
    const loadingFor = dayKeyOf(cycle.id, week, liftKey);
    workoutDayRepo
      .get(cycle.id, week, liftKey)
      .then((day) => {
        if (cancelled) return;
        const loaded: Draft = { dayKey: loadingFor, progress: day?.progress ?? {}, notes: day?.notes ?? '' };
        draftRef.current = loaded;
        setDraft(loaded);
      })
      .catch(() => {
        // Unreadable: the draft stays unloaded, so this visit's changes just
        // aren't saved as you go (never overwrite the stored draft blind).
      });
    return () => {
      cancelled = true;
    };
  }, [cycle.id, week, liftKey]);

  async function save() {
    // The day being logged, fixed before the await: by the time the write
    // lands the card may be showing another week.
    const cycleId = cycle.id as number;
    const savingFor = dayKey;
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
      cycleId,
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
    // The session now holds everything the draft did: clear the logged day's
    // draft (its workout timer is kept) — that day's, even if the card has
    // moved on. Local state is only touched if it is still on that day.
    workoutDayRepo.clearProgress(cycleId, week, liftKey).catch(() => {
      // Harmless if it fails: a logged day renders from its session.
    });
    if (identityRef.current === savingFor) {
      draftRef.current = null;
      setDraft(null);
      setExistingSession({ ...newSession, id });
    }
    onLogged?.();
  }

  // Guarded save, at most one per day (see `savingRef`): on failure (e.g.
  // IndexedDB quota / private mode) release that day's guard and surface a
  // retry affordance rather than silently stranding a "done" workout with
  // nothing persisted. A failure for a day the card has since left shows
  // nothing on the day now on screen; the failed day's saved draft still has
  // its checks, so returning to it retries the save.
  function triggerSave() {
    const savingFor = dayKey;
    if (savingRef.current.has(savingFor)) return;
    savingRef.current.add(savingFor);
    setSaveError(false);
    save().catch(() => {
      savingRef.current.delete(savingFor);
      if (identityRef.current !== savingFor) return;
      setSaveError(true);
    });
  }

  // Auto-save the moment every main ("work") set is marked done.
  useEffect(() => {
    if (existingSession !== null) return;
    if (savingRef.current.has(dayKey)) return;
    const mainRows = rows.filter((r) => r.set.kind === 'main');
    if (mainRows.length === 0 || !mainRows.every((r) => r.done)) return;
    triggerSave();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, existingSession]);

  /**
   * Saves the day's draft with `change` applied, as you go. Only once this
   * day's stored draft has loaded and the rows on screen were rebuilt from it
   * (`draftReady` — before that, writing would replace the stored progress
   * with a partial one) and while the lift is still unlogged. Updates the
   * local draft synchronously, then writes it with this day's ids, fixed now,
   * and touches no state afterward. Each write carries the whole draft and
   * the repo's upserts are atomic and applied in call order, so the last
   * change always wins and a failed write heals on the next one.
   */
  function saveDraft(change: { progress?: WorkoutDay['progress']; notes?: string }) {
    const current = draftRef.current;
    if (!draftReady || cycle.id == null || existingSession !== null) return;
    if (current === null || current.dayKey !== dayKey) return;
    const next: Draft = {
      dayKey,
      // Spread over the saved progress so rows not on screen right now (e.g.
      // BBB back-off sets while on FSL) keep theirs.
      progress: change.progress ? { ...current.progress, ...change.progress } : current.progress,
      notes: change.notes ?? current.notes,
    };
    draftRef.current = next;
    setDraft(next);
    workoutDayRepo.saveProgress(cycle.id, week, liftKey, next.progress, next.notes).catch(() => {
      // Best effort: the rows on screen are unaffected, and the next change
      // writes the whole draft again.
    });
  }

  function updateRows(change: (current: RowState[]) => RowState[]) {
    const next = change(rowsRef.current);
    rowsRef.current = next;
    setRows(next);
    saveDraft({ progress: progressOf(next) });
  }

  function toggleDone(index: number) {
    updateRows((current) => current.map((r, i) => (i === index ? { ...r, done: !r.done } : r)));
  }

  function changeReps(index: number, reps: number) {
    updateRows((current) => current.map((r, i) => (i === index ? { ...r, actualReps: reps } : r)));
  }

  function changeNotes(value: string) {
    setNotes(value);
    saveDraft({ notes: value });
  }

  function openTmEditor() {
    setTmInput(String(tm));
    setEditingTm(true);
  }

  function cancelTmEdit() {
    setEditingTm(false);
  }

  async function saveTmEdit() {
    const value = Number(tmInput.replace(',', '.'));
    if (!Number.isFinite(value) || value <= 0) return;
    if (cycle.id == null) return;
    await cycleRepo.updateTrainingMax(cycle.id, liftKey, value);
    setEditingTm(false);
    onTmChange?.();
  }

  const tm = cycle.tm[liftKey];

  // Completed sets (including warm-ups) always stay visible with a
  // checkmark — the old `hideCompletedWarmups` hide-on-done behavior is
  // retired.
  const visibleRows = rows.map((row, index) => ({ row, index }));

  // Per-kind position of each already-logged set, for the read-only rows'
  // aria-labels — matches the interactive rows' per-kind numbering
  // (`kindIndex` above) instead of numbering by raw array position.
  const loggedKindIndexesForSets =
    existingSession != null ? loggedKindIndexes(existingSession.sets) : [];

  /**
   * Read-only row for an already-logged set (rendered once
   * `existingSession != null`): same visual idiom as the interactive rows,
   * but with no Done button / reps input — just weight, plates, reps and a
   * checkmark.
   */
  function renderLoggedRow(s: LoggedSet, i: number, kindIndex: number) {
    const pct = Math.round((s.weight / tm) * 100);
    const plateText = formatPlates(s.weight, unit);
    const repsLabel = s.isAmrap
      ? `${s.done && s.actualReps != null ? s.actualReps : s.targetReps} reps`
      : `×${s.targetReps}`;
    const checkLabel = `${KIND_LABEL[s.kind]} set ${kindIndex} (${s.weight}${unit}) logged`;
    const checkClasses =
      'grid h-[22px] w-[22px] justify-self-center place-items-center rounded-full text-xs font-extrabold ' +
      (s.done ? 'bg-[var(--accent)] text-[var(--on-accent)]' : 'bg-[var(--line)] text-transparent');

    if (s.isAmrap) {
      return (
        <li
          key={i}
          className="grid grid-cols-[4.25rem_1fr_6.5rem_1.75rem] items-center gap-2 rounded-[var(--r-hero)] bg-[var(--surface-2)] p-4 text-[var(--text)]"
        >
          <div>
            <div className="text-[13px] font-bold">{KIND_LABEL[s.kind]}</div>
            <div className="text-[12px] font-semibold opacity-80">{pct}%</div>
          </div>
          <div className="flex items-baseline justify-center gap-1">
            <span className="text-center text-[40px] font-extrabold leading-none tabular-nums">{s.weight}</span>
            <span className="text-[13px] font-bold">{unit}</span>
          </div>
          <div className="text-right">
            <div className="text-[17px] font-extrabold tabular-nums">{repsLabel}</div>
            <div className="text-[11px] font-bold opacity-80">{plateText}</div>
          </div>
          <span aria-label={checkLabel} className={checkClasses}>
            ✓
          </span>
        </li>
      );
    }

    return (
      <li
        key={i}
        className="grid grid-cols-[4.25rem_1fr_6.5rem_1.75rem] items-center gap-2 rounded-[var(--r-card)] bg-[var(--surface-2)] px-3.5 py-3"
      >
        <div>
          <div className="text-[13px] font-bold">{KIND_LABEL[s.kind]}</div>
          <div className="text-[12px] font-semibold text-[var(--muted)]">{pct}%</div>
        </div>
        <div className="flex items-baseline justify-center gap-1">
          <span className="text-center text-[26px] font-extrabold tabular-nums">{s.weight}</span>
          <span className="text-[12px] font-semibold text-[var(--muted)]">{unit}</span>
        </div>
        <div className="text-right">
          <div className="text-[15px] font-extrabold tabular-nums">{repsLabel}</div>
          <div className="text-[11px] font-semibold text-[var(--muted)]">{plateText}</div>
        </div>
        <span aria-label={checkLabel} className={checkClasses}>
          ✓
        </span>
      </li>
    );
  }

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
          {existingSession === null && cycle.id != null ? (
            editingTm ? (
              <div className="flex items-center justify-end gap-1.5">
                <input
                  id={`training-max-${liftKey}`}
                  aria-label={`training-max-${liftKey}`}
                  type="text"
                  inputMode="decimal"
                  value={tmInput}
                  onChange={(e) => setTmInput(e.target.value)}
                  onFocus={(e) => e.currentTarget.select()}
                  autoFocus
                  className="w-16 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-2 py-1 text-right text-sm font-extrabold tabular-nums text-[var(--text)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
                />
                <button
                  type="button"
                  onClick={saveTmEdit}
                  className="rounded-[var(--r-pill)] bg-[var(--accent)] px-2.5 py-1 text-[11px] font-extrabold text-[var(--on-accent)]"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={cancelTmEdit}
                  className="rounded-[var(--r-pill)] border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1 text-[11px] font-extrabold text-[var(--text)]"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                aria-label="Edit training max"
                onClick={openTmEditor}
                className="text-sm font-extrabold tabular-nums"
              >
                {tm} {unit}
              </button>
            )
          ) : (
            <div className="text-sm font-extrabold tabular-nums">
              {tm} {unit}
            </div>
          )}
        </div>
      </header>

      {cycle.id != null && (
        <div className="mb-3">
          <WorkoutTimer cycleId={cycle.id} week={week} liftKey={liftKey} sessionSavedAt={existingSession?.date} />
        </div>
      )}

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

      {existingSession != null && existingSession.sets.length > 0 && (
        <ul className="mt-2 flex flex-col gap-2 list-none p-0 m-0">
          {existingSession.sets.map((s, i) => renderLoggedRow(s, i, loggedKindIndexesForSets[i]))}
        </ul>
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
                  <div className="grid grid-cols-[4.25rem_1fr_6.5rem_1.75rem] items-center gap-2">
                    <div>
                      <div className="text-[13px] font-bold">{KIND_LABEL[set.kind]}</div>
                      <div className="text-[12px] font-semibold opacity-80">{pct}%</div>
                    </div>
                    <div className="flex items-baseline justify-center gap-1">
                      <span className="text-center text-[40px] font-extrabold leading-none tabular-nums">
                        {set.weight}
                      </span>
                      <span className="text-[13px] font-bold">{unit}</span>
                    </div>
                    <div className="text-right">
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
                  'grid grid-cols-[4.25rem_1fr_6.5rem_1.75rem] items-center gap-2 rounded-[var(--r-card)] bg-[var(--surface-2)] px-3.5 py-3 transition-opacity ' +
                  (done ? 'opacity-60' : '')
                }
              >
                <div>
                  <div className="text-[13px] font-bold">{KIND_LABEL[set.kind]}</div>
                  <div className="text-[12px] font-semibold text-[var(--muted)]">{pct}%</div>
                </div>
                <div className="flex items-baseline justify-center gap-1">
                  <span className="text-center text-[26px] font-extrabold tabular-nums">{set.weight}</span>
                  <span className="text-[12px] font-semibold text-[var(--muted)]">{unit}</span>
                </div>
                <div className="text-right">
                  <div className="text-[15px] font-extrabold tabular-nums">×{set.reps}</div>
                  <div className="text-[11px] font-semibold text-[var(--muted)]">{plateText}</div>
                </div>
                <button
                  type="button"
                  onClick={() => toggleDone(index)}
                  aria-pressed={done}
                  aria-label={`Mark ${rowLabel} done`}
                  className={
                    'grid h-[22px] w-[22px] justify-self-center place-items-center rounded-full text-xs font-extrabold ' +
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
        <div
          className={
            'mt-3 rounded-[var(--r-card)] border border-[var(--line)] bg-[var(--surface)] ' +
            (noteOpen ? 'p-4' : '')
          }
        >
          {noteOpen ? (
            <>
              <label htmlFor={`lift-note-${liftKey}`} className="mb-2 block text-sm font-semibold">
                Notes
              </label>
              <textarea
                id={`lift-note-${liftKey}`}
                autoFocus
                value={notes}
                onChange={(e) => changeNotes(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
            </>
          ) : (
            <button
              type="button"
              onClick={() => setNoteOpen(true)}
              aria-expanded={false}
              className="flex w-full items-center justify-between px-4 py-3.5 text-left text-sm font-semibold text-[var(--accent)]"
            >
              <span>{notes.trim() ? notes : '+ Add note'}</span>
              <Chevron open={false} />
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
