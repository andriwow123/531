import { useEffect, useState } from 'react';
import {
  formatElapsed,
  formatWorkoutDuration,
  toTimeInput,
  atTimeOnDay,
  resolveEndTime,
  guessFinishTime,
  isLeftRunning,
} from '../../domain';
import type { LiftKey, WeekNumber } from '../../domain';
import { workoutDayRepo } from '../../data/repositories';

export interface WorkoutTimerProps {
  cycleId: number;
  week: WeekNumber;
  liftKey: LiftKey;
  /** The lift's saved session `date` (ISO), used to guess a forgotten finish time. */
  sessionSavedAt?: string;
  /** Injectable clock for tests; defaults to the real current time. */
  now?: () => Date;
}

type Mode = 'idle' | 'finish' | 'edit';

interface Times {
  startedAt: string | null;
  endedAt: string | null;
}

const BTN_PRIMARY =
  'min-h-9 rounded-[var(--r-pill)] bg-[var(--accent)] px-3.5 py-2 text-sm font-extrabold text-[var(--on-accent)]';
const BTN_SECONDARY =
  'min-h-9 rounded-[var(--r-pill)] border border-[var(--line)] bg-[var(--surface)] px-3.5 py-2 text-sm font-bold text-[var(--text)]';
const BTN_TEXT = 'min-h-9 text-left text-[13px] font-bold text-[var(--muted)] underline underline-offset-2';
const TIME_INPUT =
  'min-h-9 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-2 py-1.5 text-sm font-bold tabular-nums text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]';
const ALERT_CLASS = 'text-[12px] font-bold text-[var(--accent)]';
const PANEL_CLASS = 'flex flex-col gap-2 rounded-[var(--r-card)] border border-[var(--line)] bg-[var(--surface)] p-3';

/**
 * Whole-workout-day timer shown near the top of a LiftCard: Start -> a live
 * ticking clock -> End -> a stored duration, with Edit/Reset afterward and a
 * "forgot to end it?" recovery (plus a prominent prompt once a timer has run
 * for more than 3 hours). Loads/persists via `workoutDayRepo`; `now` is
 * injectable so tests can drive it with a fixed/mutable clock.
 */
export default function WorkoutTimer({
  cycleId,
  week,
  liftKey,
  sessionSavedAt,
  now = () => new Date(),
}: WorkoutTimerProps) {
  const [times, setTimesState] = useState<Times | null>(null);
  const [mode, setMode] = useState<Mode>('idle');
  const [finishValue, setFinishValue] = useState('');
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [, setTick] = useState(0);

  // Load on mount and whenever the identity of the workout day changes;
  // renders nothing (see the `times === null` check below) until this
  // resolves, so a stale/wrong day is never shown mid-load.
  useEffect(() => {
    let cancelled = false;
    setTimesState(null);
    setMode('idle');
    setError(null);
    workoutDayRepo.get(cycleId, week, liftKey).then((day) => {
      if (cancelled) return;
      setTimesState({ startedAt: day?.startedAt ?? null, endedAt: day?.endedAt ?? null });
    });
    return () => {
      cancelled = true;
    };
  }, [cycleId, week, liftKey]);

  const running = times != null && times.startedAt != null && times.endedAt == null;

  // Ticks once a second only while a timer is actually running, purely to
  // force a re-render (elapsed time / the 3h "left running" cutoff both read
  // `now()` fresh on every render); cleared on stop/unmount.
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [running]);

  if (times === null) return null;

  async function persist(next: Times) {
    await workoutDayRepo.setTimes(cycleId, week, liftKey, next);
    setTimesState(next);
  }

  async function startWorkout() {
    await persist({ startedAt: now().toISOString(), endedAt: null });
  }

  async function endWorkout() {
    if (!times || times.startedAt == null) return;
    await persist({ startedAt: times.startedAt, endedAt: now().toISOString() });
    setMode('idle');
  }

  function openFinish() {
    if (!times || times.startedAt == null) return;
    const guess = guessFinishTime(times.startedAt, sessionSavedAt, now().toISOString());
    setFinishValue(toTimeInput(guess));
    setError(null);
    setMode('finish');
  }

  async function saveFinish() {
    if (!times || times.startedAt == null) return;
    const nowIso = now().toISOString();
    const end = resolveEndTime(times.startedAt, finishValue);
    if (Date.parse(end) <= Date.parse(times.startedAt) || Date.parse(end) > Date.parse(nowIso)) {
      setError('Pick a time between your start and now.');
      return;
    }
    await persist({ startedAt: times.startedAt, endedAt: end });
    setMode('idle');
    setError(null);
  }

  function openEdit() {
    if (!times || times.startedAt == null || times.endedAt == null) return;
    setEditStart(toTimeInput(times.startedAt));
    setEditEnd(toTimeInput(times.endedAt));
    setError(null);
    setMode('edit');
  }

  async function saveEdit() {
    if (!times || times.startedAt == null) return;
    const start = atTimeOnDay(times.startedAt, editStart);
    const end = resolveEndTime(start, editEnd);
    const nowIso = now().toISOString();
    if (Date.parse(end) > Date.parse(nowIso)) {
      setError("End time can't be in the future.");
      return;
    }
    await persist({ startedAt: start, endedAt: end });
    setMode('idle');
    setError(null);
  }

  async function resetTimer() {
    await persist({ startedAt: null, endedAt: null });
    setMode('idle');
    setError(null);
  }

  function cancel() {
    setMode('idle');
    setError(null);
  }

  if (mode === 'finish') {
    return (
      <div className={PANEL_CLASS}>
        <label htmlFor="workout-finish-time" className="text-[13px] font-bold text-[var(--text)]">
          When did you finish?
        </label>
        <input
          id="workout-finish-time"
          type="time"
          aria-label="Finish time"
          value={finishValue}
          onChange={(e) => setFinishValue(e.target.value)}
          className={TIME_INPUT}
        />
        {error && (
          <div role="alert" className={ALERT_CLASS}>
            {error}
          </div>
        )}
        <div className="flex gap-2">
          <button type="button" onClick={saveFinish} className={BTN_PRIMARY}>
            Save
          </button>
          <button type="button" onClick={cancel} className={BTN_SECONDARY}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (mode === 'edit') {
    return (
      <div className={PANEL_CLASS}>
        <div className="flex gap-3">
          <label className="flex flex-1 flex-col text-[12px] font-semibold text-[var(--muted)]">
            Start
            <input
              type="time"
              aria-label="Start time"
              value={editStart}
              onChange={(e) => setEditStart(e.target.value)}
              className={`mt-1 ${TIME_INPUT}`}
            />
          </label>
          <label className="flex flex-1 flex-col text-[12px] font-semibold text-[var(--muted)]">
            End
            <input
              type="time"
              aria-label="End time"
              value={editEnd}
              onChange={(e) => setEditEnd(e.target.value)}
              className={`mt-1 ${TIME_INPUT}`}
            />
          </label>
        </div>
        {error && (
          <div role="alert" className={ALERT_CLASS}>
            {error}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={saveEdit} className={BTN_PRIMARY}>
            Save
          </button>
          <button type="button" onClick={cancel} className={BTN_SECONDARY}>
            Cancel
          </button>
          <button type="button" onClick={resetTimer} className={BTN_SECONDARY}>
            Reset timer
          </button>
        </div>
      </div>
    );
  }

  if (times.startedAt == null) {
    return (
      <button type="button" onClick={startWorkout} className={`w-full ${BTN_PRIMARY}`}>
        Start workout
      </button>
    );
  }

  if (times.endedAt == null) {
    const startedAt = times.startedAt;
    const nowIso = now().toISOString();
    const elapsedSeconds = (Date.parse(nowIso) - Date.parse(startedAt)) / 1000;

    if (isLeftRunning(startedAt, nowIso)) {
      const startLabel = new Date(startedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      return (
        <div className="flex flex-col gap-2 rounded-[var(--r-card)] bg-[var(--accent-soft)] p-3">
          <p className="text-[13px] font-bold tabular-nums text-[var(--accent)]">
            Still running since {startLabel} — forgot to end it?
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={openFinish} className={BTN_PRIMARY}>
              Set finish time
            </button>
            <button type="button" onClick={endWorkout} className={BTN_SECONDARY}>
              End now
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col items-start gap-0.5">
          <span className="text-sm font-extrabold tabular-nums">Workout · {formatElapsed(elapsedSeconds)}</span>
          <button type="button" onClick={openFinish} className={BTN_TEXT}>
            Forgot to end it?
          </button>
        </div>
        <button type="button" onClick={endWorkout} className={BTN_PRIMARY}>
          End workout
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm font-extrabold tabular-nums">
        Workout · {formatWorkoutDuration(times.startedAt, times.endedAt)}
      </span>
      <button type="button" onClick={openEdit} className={BTN_SECONDARY}>
        Edit
      </button>
    </div>
  );
}
