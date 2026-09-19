import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { buildWorkout, computePlates, estimate1RM, nextUp, LIFT_ORDER } from '../../domain';
import type { LiftKey, TemplateKey, Unit, WeekNumber, WorkingSet } from '../../domain';
import { cycleRepo, liftRepo, profileRepo, sessionRepo } from '../../data/repositories';
import type { Cycle, LoggedSet } from '../../data/repositories';
import { defaultSettings } from '../../settings/schema';
import type { SettingsState } from '../../settings/schema';
import { resolveDisplay } from '../../settings/display';
import SetRow from '../components/SetRow';

const TEMPLATE_LABEL: Record<TemplateKey, string> = {
  base: '5/3/1 week',
  bbb: 'Boring But Big',
  fsl: 'First Set Last',
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
}

interface LoadedWorkout {
  cycle: Cycle;
  liftKey: LiftKey;
  liftName: string;
  week: WeekNumber;
  unit: Unit;
}

export interface HomeProps {
  /** Overridable for tests. Defaults to the shared `defaultSettings` constant. */
  settings?: SettingsState;
}

export default function Home({ settings = defaultSettings }: HomeProps = {}) {
  const display = resolveDisplay(settings.displayPreset, settings.displayOverrides);

  const [loaded, setLoaded] = useState<LoadedWorkout | null | undefined>(undefined);
  const [rows, setRows] = useState<RowState[]>([]);
  const [notes, setNotes] = useState('');
  const [saved, setSaved] = useState(false);

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
      const logged = sessions
        .filter((s) => s.status === 'done')
        .map((s) => ({ liftKey: s.liftKey, week: s.week }));
      const { liftKey, week } = nextUp(logged);
      const lift = lifts.find((l) => l.key === liftKey);

      const showWarmups = settings.template.warmups && display.warmups;
      const sets = buildWorkout({
        tm: cycle.tm[liftKey],
        week,
        template: settings.template.selected,
        fivesPro: settings.template.fivesPro,
        warmups: showWarmups,
        roundingIncrement: profile.roundingIncrement,
      });

      if (cancelled) return;
      setRows(sets.map((set) => ({ set, done: false, actualReps: set.reps })));
      setLoaded({ cycle, liftKey, liftName: lift?.name ?? liftKey, week, unit: profile.units });
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [settings]);

  function toggleDone(index: number) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, done: !r.done } : r)));
  }

  function changeReps(index: number, reps: number) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, actualReps: reps } : r)));
  }

  async function handleSave() {
    if (!loaded) return;

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

    await sessionRepo.add({
      cycleId: loaded.cycle.id as number,
      week: loaded.week,
      liftKey: loaded.liftKey,
      date: new Date().toISOString(),
      status: 'done',
      sets,
      amrapReps,
      estimated1RM,
      rpe: null,
      notes,
    });

    setSaved(true);
  }

  if (loaded === undefined) {
    return (
      <main className="min-h-screen bg-[var(--bg)] px-4 py-8 text-[var(--text)]">
        <p className="text-sm text-[var(--muted)]">Loading today's workout…</p>
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

  const sessionsCompleted = (loaded.week - 1) * 4 + LIFT_ORDER.indexOf(loaded.liftKey);
  const percent = Math.round((sessionsCompleted / 16) * 100);

  const amrapIndex = rows.findIndex((r) => r.set.isAmrap);
  const amrapRow = amrapIndex >= 0 ? rows[amrapIndex] : undefined;
  const plates =
    display.plateBreakdown && amrapRow
      ? computePlates(amrapRow.set.weight, BAR_WEIGHT[loaded.unit], PLATE_SET[loaded.unit])
      : null;

  const visibleRows = rows
    .map((row, index) => ({ row, index }))
    .filter(
      ({ row }) => !(settings.hideCompletedWarmups && row.set.kind === 'warmup' && row.done),
    );

  const restLabel = `${Math.floor(settings.restTimer.defaultSeconds / 60)}:${String(
    settings.restTimer.defaultSeconds % 60,
  ).padStart(2, '0')}`;

  return (
    <main className="min-h-screen bg-[var(--bg)] px-4 py-6 text-[var(--text)] flex justify-center">
      <div className="w-full max-w-md pb-4">
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
              Cycle {loaded.cycle.index} · Week {loaded.week}
            </div>
            <div className="text-[26px] font-extrabold leading-tight">{loaded.liftName}</div>
            <div className="text-[12.5px] font-bold text-[var(--accent)]">
              {TEMPLATE_LABEL[settings.template.selected]}
            </div>
          </div>
        </header>

        <ul className="flex flex-col gap-2.5 list-none p-0 m-0">
          {visibleRows.map(({ row, index }) => (
            <SetRow
              key={index}
              weight={row.set.weight}
              unit={loaded.unit}
              targetReps={row.set.reps}
              isAmrap={row.set.isAmrap}
              done={row.done}
              actualReps={row.actualReps}
              onToggleDone={() => toggleDone(index)}
              onRepsChange={(reps) => changeReps(index, reps)}
              plates={row.set.isAmrap ? plates : null}
            />
          ))}
        </ul>

        {display.restTimer && settings.restTimer.enabled && (
          <div className="mt-3 rounded-[var(--r-card)] bg-[var(--surface-2)] py-3 text-center text-sm font-bold">
            Rest timer · <span className="text-[var(--accent)]">{restLabel}</span>
          </div>
        )}

        {display.notes && (
          <div className="mt-4 rounded-[var(--r-card)] border border-[var(--line)] bg-[var(--surface)] p-4">
            <label htmlFor="session-notes" className="mb-2 block text-sm font-semibold">
              Notes
            </label>
            <textarea
              id="session-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
          </div>
        )}

        <button
          type="button"
          onClick={handleSave}
          disabled={saved}
          className="mt-5 w-full rounded-[var(--r-pill)] bg-[var(--accent)] py-3 text-base font-bold text-[var(--on-accent)] disabled:opacity-60"
        >
          {saved ? 'Saved ✓' : 'Save workout'}
        </button>

        <nav className="mt-5 flex items-center justify-around text-xs font-bold text-[var(--muted)]">
          <span className="text-[var(--accent)]">Today</span>
          <Link to="/history">History</Link>
          <Link to="/settings">Settings</Link>
        </nav>
      </div>
    </main>
  );
}
