import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { suggestProgression, estimate1RM, LIFT_ORDER } from '../../domain';
import type { LiftKey, ProgressionDecision } from '../../domain';
import { cycleRepo, liftRepo, profileRepo, sessionRepo } from '../../data/repositories';
import type { Cycle, Lift, Session } from '../../data/repositories';

const LIFT_NAMES: Record<LiftKey, string> = {
  press: 'Overhead Press',
  bench: 'Bench Press',
  squat: 'Squat',
  deadlift: 'Deadlift',
};

const DECISION_LABEL: Record<ProgressionDecision, string> = {
  bump: 'Bump',
  hold: 'Hold',
  reset: 'Reset',
};

const DEFAULT_RPE = 8;

interface LiftRow {
  liftKey: LiftKey;
  liftName: string;
  currentTm: number;
  increment: number;
  topSetCompleted: boolean;
  amrapWeight: number | null;
  amrapReps: number | null;
  rpe: number;
  decision: ProgressionDecision;
  newTm: number;
}

interface LoadedCycleEnd {
  cycle: Cycle;
  roundingIncrement: number;
  rows: LiftRow[];
}

function findWeek3Session(sessions: Session[], liftKey: LiftKey): Session | undefined {
  return sessions.find((s) => s.liftKey === liftKey && s.week === 3);
}

function amrapWeightFor(session: Session | undefined): number | null {
  const amrapSet = session?.sets.find((s) => s.isAmrap);
  return amrapSet ? amrapSet.weight : null;
}

function suggestFor(row: {
  topSetCompleted: boolean;
  currentTm: number;
  increment: number;
}, rpe: number, roundingIncrement: number) {
  return suggestProgression({
    topSetCompleted: row.topSetCompleted,
    rpe,
    currentTm: row.currentTm,
    increment: row.increment,
    roundingIncrement,
  });
}

export default function CycleEnd() {
  const navigate = useNavigate();
  const [loaded, setLoaded] = useState<LoadedCycleEnd | null | undefined>(undefined);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [cycle, lifts, profile] = await Promise.all([
        cycleRepo.active(),
        liftRepo.all(),
        profileRepo.get(),
      ]);
      if (!cycle || cycle.id == null || !profile) {
        if (!cancelled) setLoaded(null);
        return;
      }

      const sessions = await sessionRepo.forCycle(cycle.id);
      const rows: LiftRow[] = LIFT_ORDER.map((liftKey) => {
        const lift = lifts.find((l) => l.key === liftKey) as Lift | undefined;
        const session = findWeek3Session(sessions, liftKey);
        const topSetCompleted = (session?.amrapReps ?? 0) >= 1;
        const rpe = session?.rpe ?? DEFAULT_RPE;
        const currentTm = cycle.tm[liftKey];
        const increment = lift?.increment ?? 0;
        const suggestion = suggestFor({ topSetCompleted, currentTm, increment }, rpe, profile.roundingIncrement);

        return {
          liftKey,
          liftName: lift?.name ?? LIFT_NAMES[liftKey],
          currentTm,
          increment,
          topSetCompleted,
          amrapWeight: amrapWeightFor(session),
          amrapReps: session?.amrapReps ?? null,
          rpe,
          decision: suggestion.decision,
          newTm: suggestion.newTm,
        };
      });

      if (!cancelled) {
        setLoaded({ cycle, roundingIncrement: profile.roundingIncrement, rows });
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  function changeRpe(liftKey: LiftKey, rpe: number) {
    setLoaded((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        rows: prev.rows.map((row) => {
          if (row.liftKey !== liftKey) return row;
          const suggestion = suggestFor(row, rpe, prev.roundingIncrement);
          return { ...row, rpe, decision: suggestion.decision, newTm: suggestion.newTm };
        }),
      };
    });
  }

  function changeNewTm(liftKey: LiftKey, newTm: number) {
    setLoaded((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        rows: prev.rows.map((row) => (row.liftKey === liftKey ? { ...row, newTm } : row)),
      };
    });
  }

  async function handleApply() {
    if (!loaded || loaded.cycle.id == null) return;
    setApplying(true);

    const tm = {} as Record<LiftKey, number>;
    for (const row of loaded.rows) {
      tm[row.liftKey] = row.newTm;
    }

    await Promise.all(loaded.rows.map((row) => liftRepo.update(row.liftKey, { trainingMax: row.newTm })));
    await cycleRepo.complete(loaded.cycle.id);
    await cycleRepo.add({
      index: loaded.cycle.index + 1,
      startedAt: new Date().toISOString(),
      status: 'active',
      template: loaded.cycle.template,
      fivesPro: loaded.cycle.fivesPro,
      tm,
    });

    navigate('/');
  }

  if (loaded === undefined) {
    return (
      <main className="min-h-screen bg-[var(--bg)] px-4 py-8 text-[var(--text)]">
        <p className="text-sm text-[var(--muted)]">Loading cycle summary…</p>
      </main>
    );
  }

  if (loaded === null) {
    return (
      <main className="min-h-screen bg-[var(--bg)] px-4 py-8 text-[var(--text)]">
        <p className="text-sm text-[var(--muted)]">No active cycle found.</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--bg)] px-4 py-6 text-[var(--text)] flex justify-center">
      <div className="w-full max-w-md pb-4">
        <header className="mb-4">
          <div className="text-xs font-semibold text-[var(--muted)]">Cycle {loaded.cycle.index} complete</div>
          <div className="text-[26px] font-extrabold leading-tight">Review &amp; progress</div>
          <p className="mt-1 text-[13px] text-[var(--muted)]">
            Confirm each lift's RPE and training max before starting Cycle {loaded.cycle.index + 1}.
          </p>
        </header>

        <ul className="flex flex-col gap-3 list-none p-0 m-0">
          {loaded.rows.map((row) => {
            const estimated =
              row.amrapWeight != null && row.amrapReps != null && row.amrapReps > 0
                ? estimate1RM(row.amrapWeight, row.amrapReps)
                : null;

            return (
              <li
                key={row.liftKey}
                className="rounded-[var(--r-card)] border border-[var(--line)] bg-[var(--surface)] p-4"
              >
                <div className="flex items-center justify-between">
                  <span className="text-base font-extrabold">{row.liftName}</span>
                  <span
                    className={
                      'rounded-[var(--r-pill)] px-2.5 py-1 text-[12px] font-extrabold ' +
                      (row.decision === 'bump'
                        ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                        : 'bg-[var(--surface-2)] text-[var(--muted)]')
                    }
                  >
                    {DECISION_LABEL[row.decision]}
                  </span>
                </div>

                <div className="mt-1.5 text-[13px] text-[var(--muted)]">
                  Week 3 top set: {row.topSetCompleted ? `${row.amrapReps} reps` : 'missed'}
                  {estimated != null && <> · est. 1RM {Math.round(estimated)}</>}
                </div>

                <div className="mt-3 flex items-end gap-3">
                  <label className="flex flex-col text-[12px] font-semibold text-[var(--muted)]">
                    RPE
                    <input
                      type="number"
                      step={0.5}
                      min={0}
                      max={10}
                      aria-label={`RPE for ${row.liftName}`}
                      value={row.rpe}
                      onChange={(e) => changeRpe(row.liftKey, Number(e.target.value))}
                      className="mt-1 w-16 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-2 py-1.5 text-center font-bold text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                    />
                  </label>

                  <label className="flex flex-col text-[12px] font-semibold text-[var(--muted)]">
                    New training max
                    <input
                      type="number"
                      step={0.5}
                      aria-label={`New training max for ${row.liftName}`}
                      value={row.newTm}
                      onChange={(e) => changeNewTm(row.liftKey, Number(e.target.value))}
                      className="mt-1 w-24 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-2 py-1.5 text-center font-bold text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                    />
                  </label>

                  <span className="ml-auto text-[12px] font-semibold text-[var(--muted)]">was {row.currentTm}</span>
                </div>
              </li>
            );
          })}
        </ul>

        <button
          type="button"
          onClick={handleApply}
          disabled={applying}
          className="mt-5 w-full rounded-[var(--r-pill)] bg-[var(--accent)] py-3 text-base font-bold text-[var(--on-accent)] disabled:opacity-60"
        >
          Apply / start next cycle
        </button>
      </div>
    </main>
  );
}
