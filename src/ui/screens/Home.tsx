import { useEffect, useRef, useState } from 'react';
import type { UIEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { nextUp, LIFT_ORDER } from '../../domain';
import type { LiftKey, Unit, WeekNumber } from '../../domain';
import { cycleRepo, profileRepo, sessionRepo } from '../../data/repositories';
import type { Cycle, Session } from '../../data/repositories';
import { resolveDisplay } from '../../settings/display';
import { useSettings } from '../settings/SettingsContext';
import { useRestTimer } from '../hooks/useRestTimer';
import LiftCard from '../components/LiftCard';
import WeekTabs from '../components/WeekTabs';
import DayStrip from '../components/DayStrip';
import { NavIconLink, HistoryIcon, SettingsIcon } from '../components/NavIcons';

/** One-line standard 5/3/1 scheme description per week, shown under the title row. */
const PROTOCOL: Record<WeekNumber, string> = {
  1: '5×5/5/5+ · 65/75/85%',
  2: '3×3/3/3+ · 70/80/90%',
  3: '5/3/1+ · 75/85/95%',
  4: 'Deload · 40/50/60%, no AMRAP',
};

/** Short day-strip labels per lift, distinct from LiftCard's fuller exercise names. */
const DAY_LABEL: Record<LiftKey, string> = {
  press: 'Press',
  bench: 'Bench',
  squat: 'Squat',
  deadlift: 'Deadlift',
};

interface LoadedData {
  cycle: Cycle;
  profile: { units: Unit; roundingIncrement: number };
  sessions: Session[];
}

/** mm:ss, zero-padded seconds. */
function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/** True once every lift has a logged week-4 session — the cycle is done. */
function isCycleComplete(sessions: Session[]): boolean {
  const week4Logged = new Set(
    sessions.filter((s) => s.status === 'done' && s.week === 4).map((s) => s.liftKey),
  );
  return LIFT_ORDER.every((key) => week4Logged.has(key));
}

/**
 * Cycle overview: title row, a week selector, and all 4 lifts' cards for the
 * selected week. Each `LiftCard` owns its own set table and inline logging;
 * this screen just loads the cycle-wide data (active cycle, profile, this
 * cycle's sessions) and resolves each card's already-logged session from a
 * single shared query instead of letting every card query independently.
 */
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
  const [selectedWeek, setSelectedWeek] = useState<WeekNumber>(1);
  const [activeDay, setActiveDay] = useState(0);
  const pagerRef = useRef<HTMLDivElement | null>(null);

  // Guards the async `handleLogged` callback from touching state/navigation
  // after the screen has unmounted (the initial-load effect has its own
  // `cancelled` flag; this covers the post-log re-query).
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  // Initial load: active cycle, profile, and this cycle's logged sessions.
  // If every lift already has its week-4 session logged, the cycle is done —
  // route to the end-of-cycle review instead. Otherwise the selected week
  // defaults to wherever the rotation suggests next (but stays independently
  // user-selectable afterward via WeekTabs).
  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [cycle, profile] = await Promise.all([cycleRepo.active(), profileRepo.get()]);
      if (!cycle || cycle.id == null || !profile) {
        if (!cancelled) setData(null);
        return;
      }

      const sessions = await sessionRepo.forCycle(cycle.id);
      if (isCycleComplete(sessions)) {
        if (!cancelled) navigate('/cycle-end', { replace: true });
        return;
      }

      if (cancelled) return;
      const logged = sessions
        .filter((s) => s.status === 'done')
        .map((s) => ({ liftKey: s.liftKey, week: s.week }));
      setData({ cycle, profile, sessions });
      const next = nextUp(logged);
      setSelectedWeek(next.week);
      setActiveDay(Math.max(0, LIFT_ORDER.indexOf(next.liftKey)));
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  // Re-queries this cycle's sessions after any card logs one, so every
  // card's `session` prop and the done-count both reflect the new state.
  // Also re-checks cycle completion, mirroring the load effect's check.
  function handleLogged() {
    const cycleId = data?.cycle.id;
    if (cycleId == null) return;

    sessionRepo.forCycle(cycleId).then((sessions) => {
      if (!mountedRef.current) return;
      if (isCycleComplete(sessions)) {
        navigate('/cycle-end', { replace: true });
        return;
      }
      setData((prev) => (prev ? { ...prev, sessions } : prev));
    });
  }

  // Re-loads the active cycle (and this cycle's sessions) after a training-max
  // edit, so `data.cycle.tm` refreshes and every card's set table rebuilds.
  // Deliberately leaves `selectedWeek`/`activeDay` untouched — this is a data
  // refresh, not a navigation.
  function handleTmChange() {
    cycleRepo.active().then(async (cycle) => {
      if (!mountedRef.current || !cycle || cycle.id == null) return;
      const sessions = await sessionRepo.forCycle(cycle.id);
      if (!mountedRef.current) return;
      setData((prev) => (prev ? { ...prev, cycle, sessions } : prev));
    });
  }

  // DayStrip selection -> smooth-scroll the pager to that page and mark it
  // active immediately (the scroll-driven handler below then keeps it in
  // sync as the user swipes). `scrollTo` is optionally chained since jsdom
  // (unit tests) doesn't implement it.
  function goToDay(index: number) {
    setActiveDay(index);
    const container = pagerRef.current;
    if (container) {
      container.scrollTo?.({ left: index * container.clientWidth, behavior: 'smooth' });
    }
  }

  // Keeps the DayStrip's active marker in sync when the user swipes the
  // pager directly instead of tapping a day. jsdom never fires a real
  // scroll event, so this is exercised only in the real browser.
  function handlePagerScroll(e: UIEvent<HTMLDivElement>) {
    const container = e.currentTarget;
    if (!container.clientWidth) return;
    const index = Math.round(container.scrollLeft / container.clientWidth);
    if (index !== activeDay) setActiveDay(index);
  }

  if (data === undefined) {
    return (
      <main className="min-h-screen bg-[var(--bg)] px-4 py-8 text-[var(--text)]">
        <p className="text-sm text-[var(--muted)]">Loading today's workout…</p>
      </main>
    );
  }

  if (data === null) {
    return (
      <main className="min-h-screen bg-[var(--bg)] px-4 py-8 text-[var(--text)]">
        <p className="text-sm text-[var(--muted)]">No active cycle found.</p>
      </main>
    );
  }

  const unit = data.profile.units;
  const doneKeys = new Set(
    LIFT_ORDER.filter((key) =>
      data.sessions.some((s) => s.status === 'done' && s.liftKey === key && s.week === selectedWeek),
    ),
  );
  const doneCount = doneKeys.size;

  return (
    <main className="min-h-screen bg-[var(--bg)] px-4 py-6 text-[var(--text)] flex justify-center">
      <div className="w-full max-w-md pb-4">
        <header className="mb-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[22px] font-extrabold leading-tight">5/3/1</h1>
            <p className="text-[12px] font-semibold text-[var(--muted)]">Wendler strength cycle</p>
          </div>
          <div className="flex flex-none items-center gap-1.5">
            <span className="flex-none rounded-[var(--r-pill)] bg-[var(--accent-soft)] px-2.5 py-1 text-[12px] font-extrabold text-[var(--accent)]">
              Cycle {data.cycle.index}
            </span>
            <NavIconLink to="/history" label="History">
              <HistoryIcon />
            </NavIconLink>
            <NavIconLink to="/settings" label="Settings">
              <SettingsIcon />
            </NavIconLink>
          </div>
        </header>

        <p className="mb-4 text-[13px] font-semibold text-[var(--muted)]">
          {PROTOCOL[selectedWeek]} · {doneCount} of 4 done this week
        </p>

        <div className="mb-4">
          <WeekTabs week={selectedWeek} onChange={setSelectedWeek} />
        </div>

        <div className="mb-3">
          <DayStrip
            lifts={LIFT_ORDER.map((key) => ({ key, label: DAY_LABEL[key] }))}
            activeDay={activeDay}
            doneKeys={doneKeys}
            onSelect={goToDay}
          />
        </div>

        <div
          ref={pagerRef}
          onScroll={handlePagerScroll}
          data-testid="day-pager"
          className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden -mx-1 px-1"
        >
          {LIFT_ORDER.map((key, index) => (
            <div key={key} className="w-full flex-none snap-start px-1">
              <LiftCard
                liftKey={key}
                week={selectedWeek}
                cycle={data.cycle}
                unit={unit}
                roundingIncrement={data.profile.roundingIncrement}
                dayNumber={index + 1}
                settings={settings}
                session={
                  data.sessions.find(
                    (s) => s.status === 'done' && s.liftKey === key && s.week === selectedWeek,
                  ) ?? null
                }
                onLogged={handleLogged}
                onTmChange={handleTmChange}
              />
            </div>
          ))}
        </div>

        {display.restTimer && settings.restTimer.enabled && (
          <div className="mt-4 rounded-[var(--r-card)] bg-[var(--surface-2)] p-3 text-center">
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
      </div>
    </main>
  );
}
