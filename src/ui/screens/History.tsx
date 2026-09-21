import { useEffect, useState } from 'react';
import {
  estimatedOneRmSeries,
  trainingMaxSeries,
  personalRecord,
  cycleLog,
  LIFT_ORDER,
} from '../../domain';
import type { LiftKey, Unit } from '../../domain';
import { cycleRepo, liftRepo, profileRepo, sessionRepo } from '../../data/repositories';
import type { Cycle, Lift, Session } from '../../data/repositories';
import ProgressChart from '../components/ProgressChart';
import BodyweightCard from '../components/BodyweightCard';
import { useSettings } from '../settings/SettingsContext';
import { NavIconLink, HomeIcon, SettingsIcon } from '../components/NavIcons';

const LIFT_NAMES: Record<LiftKey, string> = {
  press: 'Overhead Press',
  bench: 'Bench Press',
  squat: 'Squat',
  deadlift: 'Deadlift',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Formats an ISO date ("2026-01-05") as "Jan 5, 2026" without going through
 *  `Date` (which would shift by a day in timezones behind UTC). */
function formatDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return iso;
  const month = MONTHS[Number(match[2]) - 1] ?? match[2];
  return `${month} ${Number(match[3])}, ${match[1]}`;
}

interface LoadedData {
  sessions: Session[];
  cycles: Cycle[];
  lifts: Lift[];
  unit: Unit;
}

export default function History() {
  const { settings } = useSettings();
  const [data, setData] = useState<LoadedData | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [sessions, cycles, lifts, profile] = await Promise.all([
        sessionRepo.all(),
        cycleRepo.all(),
        liftRepo.all(),
        profileRepo.get(),
      ]);
      if (cancelled) return;
      setData({ sessions, cycles, lifts, unit: profile?.units ?? 'kg' });
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const topBar = (
    <div className="flex flex-none items-center gap-1.5">
      <NavIconLink to="/" label="Today">
        <HomeIcon />
      </NavIconLink>
      <NavIconLink to="/settings" label="Settings">
        <SettingsIcon />
      </NavIconLink>
    </div>
  );

  if (data === undefined) {
    return (
      <main className="min-h-screen bg-[var(--bg)] px-4 py-8 text-[var(--text)]">
        <p className="text-sm text-[var(--muted)]">Loading history…</p>
      </main>
    );
  }

  const liftName = (key: LiftKey): string =>
    data.lifts.find((l) => l.key === key)?.name ?? LIFT_NAMES[key];

  const hasDoneSessions = data.sessions.some((s) => s.status === 'done');

  if (!hasDoneSessions) {
    return (
      <main className="min-h-screen bg-[var(--bg)] px-4 py-6 text-[var(--text)] flex justify-center">
        <div className="w-full max-w-md pb-4">
          <header className="mb-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-semibold text-[var(--muted)]">History</div>
              <h1 className="text-[26px] font-extrabold leading-tight">Progress</h1>
            </div>
            {topBar}
          </header>

          {settings.bodyweightTracking && (
            <div className="mb-4">
              <BodyweightCard />
            </div>
          )}

          <p className="text-sm text-[var(--muted)]">
            Log a few workouts and your progress shows up here.
          </p>
        </div>
      </main>
    );
  }

  const groups = cycleLog(data.sessions, data.cycles);

  return (
    <main className="min-h-screen bg-[var(--bg)] px-4 py-6 text-[var(--text)] flex justify-center">
      <div className="w-full max-w-md pb-4">
        <header className="mb-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-[var(--muted)]">History</div>
            <h1 className="text-[26px] font-extrabold leading-tight">Progress</h1>
          </div>
          {topBar}
        </header>

        {settings.bodyweightTracking && (
          <div className="mb-4">
            <BodyweightCard />
          </div>
        )}

        <ul className="flex flex-col gap-3 list-none p-0 m-0">
          {LIFT_ORDER.map((key) => {
            const oneRm = estimatedOneRmSeries(data.sessions, key);
            const tm = trainingMaxSeries(data.cycles, key);
            const pr = personalRecord(data.sessions, key);

            return (
              <li
                key={key}
                className="rounded-[var(--r-card)] border border-[var(--line)] bg-[var(--surface)] p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-base font-extrabold">{liftName(key)}</h2>
                  {pr && (
                    <span className="rounded-[var(--r-pill)] bg-[var(--accent-soft)] px-2.5 py-1 text-[12px] font-extrabold text-[var(--accent)]">
                      PR {Math.round(pr.est1RM)}
                      {data.unit} · {formatDate(pr.date)}
                    </span>
                  )}
                </div>

                <div className="mt-2">
                  <ProgressChart oneRm={oneRm} tm={tm} unit={data.unit} />
                </div>
              </li>
            );
          })}
        </ul>

        <section className="mt-5">
          <h2 className="mb-2 text-sm font-extrabold text-[var(--muted)]">Cycle log</h2>
          <ul className="flex flex-col gap-3 list-none p-0 m-0">
            {groups.map((group) => (
              <li
                key={group.cycleIndex}
                className="rounded-[var(--r-card)] border border-[var(--line)] bg-[var(--surface)] p-4"
              >
                <div className="text-[12.5px] font-bold text-[var(--accent)]">
                  Cycle {group.cycleIndex}
                </div>
                <ul className="mt-2 flex flex-col gap-2 list-none p-0 m-0">
                  {group.entries.map((entry, i) => (
                    <li key={i} className="flex items-center justify-between gap-2 text-[13px]">
                      <span className="text-[var(--muted)]">
                        {formatDate(entry.date)} · {liftName(entry.liftKey)} · Week {entry.week}
                      </span>
                      <span className="font-bold tabular-nums whitespace-nowrap">
                        {entry.topWeight} {data.unit} × {entry.topReps ?? '—'}
                        {entry.est1RM != null && (
                          <span className="ml-1 font-semibold text-[var(--muted)]">
                            (est {Math.round(entry.est1RM)}
                            {data.unit})
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
