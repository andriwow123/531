import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { buildWorkout, computePlates, estimate1RM, nextUp, LIFT_ORDER } from '../../domain';
import type { LiftKey, SetKind, TemplateKey, Unit, WeekNumber, WorkingSet } from '../../domain';
import { cycleRepo, liftRepo, profileRepo, sessionRepo } from '../../data/repositories';
import type { Cycle, Lift, LoggedSet, Session } from '../../data/repositories';
import { resolveDisplay } from '../../settings/display';
import { useSettings } from '../settings/SettingsContext';
import { useRestTimer } from '../hooks/useRestTimer';
import SetRow from '../components/SetRow';
import ExerciseDemo from '../components/ExerciseDemo';

const TEMPLATE_LABEL: Record<TemplateKey, string> = {
  base: '5/3/1 week',
  bbb: 'Boring But Big',
  fsl: 'First Set Last',
};

const LIFT_NAMES: Record<LiftKey, string> = {
  press: 'Overhead Press',
  bench: 'Bench Press',
  squat: 'Squat',
  deadlift: 'Deadlift',
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

/** Rebuilds row state from a previously-logged session's sets, for read-only display. */
function fromLoggedSets(sets: LoggedSet[]): RowState[] {
  const counts: Record<SetKind, number> = { warmup: 0, main: 0, supplemental: 0 };
  return sets.map((s) => {
    counts[s.kind] += 1;
    return {
      set: { kind: s.kind, pct: 0, reps: s.targetReps, isAmrap: s.isAmrap, weight: s.weight },
      done: s.done,
      actualReps: s.actualReps ?? s.targetReps,
      kindIndex: counts[s.kind],
    };
  });
}

interface LoadedData {
  cycle: Cycle;
  lifts: Lift[];
  profile: { units: Unit; roundingIncrement: number };
  sessions: Session[];
}

/** mm:ss, zero-padded seconds. */
function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export default function Home() {
  const { settings } = useSettings();
  const display = resolveDisplay(settings.displayPreset, settings.displayOverrides);
  const navigate = useNavigate();
  const restTimer = useRestTimer(settings.restTimer.defaultSeconds);

  // Fires a browser notification the moment the rest timer's running->0
  // transition happens (i.e. it actually completed, not a manual pause or
  // reset). Guarded on Notifications API availability + permission; never
  // prompts, and no-ops when unavailable/denied/disabled.
  const wasRunningRef = useRef(restTimer.running);
  useEffect(() => {
    const wasRunning = wasRunningRef.current;
    wasRunningRef.current = restTimer.running;
    if (!wasRunning || restTimer.running || restTimer.secondsLeft !== 0) return;
    if (!settings.restTimer.notify) return;
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    new Notification('Rest complete', { body: 'Time for your next set.' });
  }, [restTimer.running, restTimer.secondsLeft, settings.restTimer.notify]);

  const [data, setData] = useState<LoadedData | null | undefined>(undefined);
  const [selectedLift, setSelectedLift] = useState<LiftKey | null>(null);
  const [rows, setRows] = useState<RowState[]>([]);
  /** The `liftKey:week:showWarmups` key that `rows` currently represents. */
  const [rowsForRef, setRowsForRef] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [noteOpen, setNoteOpen] = useState(false);
  const [saved, setSaved] = useState(false);

  // Initial load: active cycle, lifts, profile, and this cycle's logged
  // sessions. If every lift already has its week-4 session logged, the
  // cycle is done — route to the end-of-cycle review instead.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [cycle, lifts, profile] = await Promise.all([
        cycleRepo.active(),
        liftRepo.all(),
        profileRepo.get(),
      ]);
      if (!cycle || cycle.id == null || !profile) {
        if (!cancelled) setData(null);
        return;
      }

      const sessions = await sessionRepo.forCycle(cycle.id);
      const logged = sessions
        .filter((s) => s.status === 'done')
        .map((s) => ({ liftKey: s.liftKey, week: s.week }));

      const week4Logged = new Set(logged.filter((s) => s.week === 4).map((s) => s.liftKey));
      const cycleComplete = LIFT_ORDER.every((key) => week4Logged.has(key));
      if (cycleComplete) {
        if (!cancelled) navigate('/cycle-end', { replace: true });
        return;
      }

      if (cancelled) return;
      setData({ cycle, lifts, profile, sessions });
      setSelectedLift(nextUp(logged).liftKey);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  // The cycle-wide current week, derived from what's logged so far. Every
  // lift shares this week; only which lift the user is looking at varies.
  const currentWeek: WeekNumber | null = useMemo(() => {
    if (!data) return null;
    const logged = data.sessions
      .filter((s) => s.status === 'done')
      .map((s) => ({ liftKey: s.liftKey, week: s.week }));
    return nextUp(logged).week;
  }, [data]);

  const doneKeys = useMemo(() => {
    if (!data || currentWeek == null) return new Set<LiftKey>();
    return new Set(
      data.sessions
        .filter((s) => s.status === 'done' && s.week === currentWeek)
        .map((s) => s.liftKey),
    );
  }, [data, currentWeek]);

  const isSelectedDone = selectedLift != null && doneKeys.has(selectedLift);

  // Rebuild the displayed rows whenever the selected lift (or the current
  // week / underlying data) changes. A lift already logged this week shows
  // its actual logged sets read-only; otherwise a fresh prescription.
  //
  // This runs during render (guarded by comparing against `rowsFor`, a piece
  // of state carried from the previous render) rather than in a useEffect,
  // so the header and the rows it describes always land in the same commit.
  // A useEffect here would leave a one-frame gap — data/selectedLift set,
  // rows still empty from the previous selection — that's real enough to be
  // flaky in tests that wait for the header text before checking rows.
  const showWarmups = settings.template.warmups && display.warmups;

  if (data && selectedLift && currentWeek != null) {
    const rowsFor = `${selectedLift}:${currentWeek}:${showWarmups}`;

    if (rowsFor !== rowsForRef) {
      const doneSession = data.sessions.find(
        (s) => s.status === 'done' && s.liftKey === selectedLift && s.week === currentWeek,
      );

      const nextRows = doneSession
        ? fromLoggedSets(doneSession.sets)
        : withKindIndex(
            buildWorkout({
              tm: data.cycle.tm[selectedLift],
              week: currentWeek,
              template: data.cycle.template,
              fivesPro: data.cycle.fivesPro,
              warmups: showWarmups,
              roundingIncrement: data.profile.roundingIncrement,
            }),
          );

      setRows(nextRows);
      setRowsForRef(rowsFor);
      setNotes('');
      setNoteOpen(false);
      setSaved(false);
    }
  }

  function toggleDone(index: number) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, done: !r.done } : r)));
  }

  function changeReps(index: number, reps: number) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, actualReps: reps } : r)));
  }

  async function handleSave() {
    if (!data || !selectedLift || currentWeek == null || isSelectedDone) return;

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
      cycleId: data.cycle.id as number,
      week: currentWeek,
      liftKey: selectedLift,
      date: new Date().toISOString(),
      status: 'done',
      sets,
      amrapReps,
      estimated1RM,
      rpe: null,
      notes,
    };

    const id = await sessionRepo.add(newSession);
    setSaved(true);

    const updatedSessions = [...data.sessions, { ...newSession, id }];
    const logged = updatedSessions
      .filter((s) => s.status === 'done')
      .map((s) => ({ liftKey: s.liftKey, week: s.week }));
    const week4Logged = new Set(logged.filter((s) => s.week === 4).map((s) => s.liftKey));
    const cycleComplete = LIFT_ORDER.every((key) => week4Logged.has(key));

    if (cycleComplete) {
      navigate('/cycle-end', { replace: true });
      return;
    }

    setData({ ...data, sessions: updatedSessions });
    setSelectedLift(nextUp(logged).liftKey);
  }

  if (data === undefined) {
    return (
      <main className="min-h-screen bg-[var(--bg)] px-4 py-8 text-[var(--text)]">
        <p className="text-sm text-[var(--muted)]">Loading today's workout…</p>
      </main>
    );
  }

  if (data === null || selectedLift == null || currentWeek == null) {
    return (
      <main className="min-h-screen bg-[var(--bg)] px-4 py-8 text-[var(--text)]">
        <p className="text-sm text-[var(--muted)]">No active cycle found.</p>
      </main>
    );
  }

  const liftName = (key: LiftKey): string =>
    data.lifts.find((l) => l.key === key)?.name ?? LIFT_NAMES[key];

  const unit = data.profile.units;
  const percent = Math.round((doneKeys.size / 4) * 100);

  const amrapIndex = rows.findIndex((r) => r.set.isAmrap);
  const amrapRow = amrapIndex >= 0 ? rows[amrapIndex] : undefined;
  const plates =
    display.plateBreakdown && amrapRow
      ? computePlates(amrapRow.set.weight, BAR_WEIGHT[unit], PLATE_SET[unit])
      : null;

  const visibleRows = rows
    .map((row, index) => ({ row, index }))
    .filter(
      ({ row }) => !(settings.hideCompletedWarmups && row.set.kind === 'warmup' && row.done),
    );

  return (
    <main className="min-h-screen bg-[var(--bg)] px-4 py-6 text-[var(--text)] flex justify-center">
      <div className="w-full max-w-md pb-4">
        <div className="mb-4 grid grid-cols-2 gap-2">
          {LIFT_ORDER.map((key) => {
            const isDone = doneKeys.has(key);
            const isSelected = selectedLift === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedLift(key)}
                aria-pressed={isSelected}
                className={
                  'flex items-center justify-between gap-2 rounded-[var(--r-card)] border px-3 py-2.5 text-left text-sm font-bold transition-colors ' +
                  (isSelected
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                    : 'border-[var(--line)] bg-[var(--surface)] text-[var(--text)]')
                }
              >
                <span>{liftName(key)}</span>
                {isDone && (
                  <span
                    aria-label="Done this week"
                    className="grid h-5 w-5 flex-none place-items-center rounded-full bg-[var(--accent)] text-[10px] font-extrabold text-[var(--on-accent)]"
                  >
                    ✓
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <header className="flex items-center gap-3.5 mb-4">
          <div
            className="grid h-14 w-14 flex-none place-items-center rounded-full"
            style={{
              background: `conic-gradient(var(--accent) 0 ${percent}%, var(--surface-2) ${percent}% 100%)`,
            }}
          >
            <div className="grid h-[42px] w-[42px] place-items-center rounded-full bg-[var(--bg)] text-xs font-extrabold text-[var(--accent)]">
              {percent}%
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold text-[var(--muted)]">
              Cycle {data.cycle.index} · Week {currentWeek}
            </div>
            <h1 className="text-[26px] font-extrabold leading-tight">{liftName(selectedLift)}</h1>
            <div className="text-[12.5px] font-bold text-[var(--accent)]">
              {TEMPLATE_LABEL[data.cycle.template]}
            </div>
          </div>
        </header>

        {isSelectedDone && (
          <div className="mb-3 inline-flex items-center gap-1.5 rounded-[var(--r-pill)] bg-[var(--surface-2)] px-3 py-1.5 text-[12px] font-bold text-[var(--muted)]">
            <span aria-hidden="true">✓</span> Already logged this week
          </div>
        )}

        {settings.exerciseDemos && (
          <div className="mb-3">
            <ExerciseDemo liftKey={selectedLift} />
          </div>
        )}

        <ul className="flex flex-col gap-2.5 list-none p-0 m-0">
          {visibleRows.map(({ row, index }) => (
            <SetRow
              key={index}
              weight={row.set.weight}
              unit={unit}
              targetReps={row.set.reps}
              isAmrap={row.set.isAmrap}
              kind={row.set.kind}
              setNumber={row.kindIndex}
              done={row.done}
              actualReps={row.actualReps}
              onToggleDone={() => toggleDone(index)}
              onRepsChange={(reps) => changeReps(index, reps)}
              plates={row.set.isAmrap ? plates : null}
            />
          ))}
        </ul>

        {display.restTimer && settings.restTimer.enabled && (
          <div className="mt-3 rounded-[var(--r-card)] bg-[var(--surface-2)] p-3 text-center">
            <div className="text-sm font-bold">
              Rest timer ·{' '}
              <span className="text-[var(--accent)]">{formatDuration(restTimer.secondsLeft)}</span>
            </div>
            <div className="mt-2 flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={restTimer.start}
                disabled={restTimer.running}
                className="rounded-[var(--r-pill)] bg-[var(--accent)] px-4 py-1.5 text-[12px] font-extrabold text-[var(--on-accent)] disabled:opacity-50"
              >
                Start
              </button>
              <button
                type="button"
                onClick={restTimer.pause}
                disabled={!restTimer.running}
                className="rounded-[var(--r-pill)] border border-[var(--line)] bg-[var(--surface)] px-4 py-1.5 text-[12px] font-extrabold text-[var(--text)] disabled:opacity-50"
              >
                Pause
              </button>
              <button
                type="button"
                onClick={restTimer.reset}
                className="rounded-[var(--r-pill)] border border-[var(--line)] bg-[var(--surface)] px-4 py-1.5 text-[12px] font-extrabold text-[var(--text)]"
              >
                Reset
              </button>
            </div>
          </div>
        )}

        {display.notes && !isSelectedDone && (
          <div className="mt-4 rounded-[var(--r-card)] border border-[var(--line)] bg-[var(--surface)] p-4">
            {noteOpen ? (
              <>
                <label htmlFor="session-notes" className="mb-2 block text-sm font-semibold">
                  Notes
                </label>
                <textarea
                  id="session-notes"
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

        {!isSelectedDone && (
          <button
            type="button"
            onClick={handleSave}
            disabled={saved}
            className="mt-5 w-full rounded-[var(--r-pill)] bg-[var(--accent)] py-3 text-base font-bold text-[var(--on-accent)] disabled:opacity-60"
          >
            {saved ? 'Saved ✓' : 'Save workout'}
          </button>
        )}

        <nav className="mt-5 flex items-center justify-around text-xs font-bold text-[var(--muted)]">
          <span className="text-[var(--accent)]">Today</span>
          <Link to="/history">History</Link>
          <Link to="/settings">Settings</Link>
        </nav>
      </div>
    </main>
  );
}
