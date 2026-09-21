import { useEffect, useRef, useState } from 'react';
import type { UIEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { nextUp, LIFT_ORDER, orderedLifts, moveItem } from '../../domain';
import type { LiftKey, Unit, WeekNumber } from '../../domain';
import { cycleRepo, profileRepo, sessionRepo } from '../../data/repositories';
import type { Cycle, Session } from '../../data/repositories';
import { resolveDisplay } from '../../settings/display';
import { useSettings } from '../settings/SettingsContext';
import { useRestTimer } from '../hooks/useRestTimer';
import LiftCard from '../components/LiftCard';
import WeekTabs from '../components/WeekTabs';
import DayStrip from '../components/DayStrip';
import { NavIconLink, HistoryIcon, SettingsIcon, HomeIcon } from '../components/NavIcons';

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
  const { settings, updateSettings, loaded: settingsLoaded } = useSettings();
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
  // The order-independent suggested lift (nextUp's result), set once the
  // cycle/session data loads. The initial `activeDay` is derived from this
  // PLUS the loaded settings' liftOrder (see the effect below) rather than
  // computed directly in `load()`, because `settings.liftOrder` there would
  // still be the default — SettingsProvider loads asynchronously and this
  // effect only runs once on mount.
  const [suggestedLiftKey, setSuggestedLiftKey] = useState<LiftKey | null>(null);
  // Guards the one-time initial activeDay placement below from re-firing
  // after the user has already tapped/dragged/swiped to a different day.
  const initedActiveDayRef = useRef(false);
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
      // Order-independent (nextUp only ever reasons in LIFT_ORDER space) —
      // where this lands on the DAY STRIP depends on the loaded liftOrder,
      // resolved separately below once settings have actually loaded.
      setSuggestedLiftKey(next.liftKey);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  // One-time initial placement of activeDay: waits for BOTH the cycle data
  // (suggestedLiftKey) AND the persisted settings (settingsLoaded) so a
  // saved custom liftOrder is honored instead of racing the default one a
  // synchronous first render sees. Runs once; afterward tap/swipe/drag own
  // activeDay via their own setActiveDay calls (goToDay, handlePagerScroll,
  // handleDayReorder).
  useEffect(() => {
    if (initedActiveDayRef.current) return;
    if (!settingsLoaded || suggestedLiftKey == null) return;
    const idx = orderedLifts(settings.liftOrder).indexOf(suggestedLiftKey);
    if (idx >= 0) {
      setActiveDay(idx);
      initedActiveDayRef.current = true;
    }
  }, [settingsLoaded, suggestedLiftKey, settings.liftOrder]);

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
    initedActiveDayRef.current = true;
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
    if (index !== activeDay) {
      initedActiveDayRef.current = true;
      setActiveDay(index);
    }
  }

  // DayStrip drag-to-reorder -> persists the new lift order, and keeps the
  // active-day marker on the SAME lift the user was on (its slot may have
  // moved), not stuck on whatever now occupies the old slot index.
  function handleDayReorder(from: number, to: number) {
    const order = orderedLifts(settings.liftOrder);
    if (from < 0 || from >= order.length) return;
    const activeKey = order[activeDay] ?? order[0];
    const next = moveItem(order, from, to);
    updateSettings({ liftOrder: next });
    const nextActiveIndex = next.indexOf(activeKey);
    initedActiveDayRef.current = true;
    setActiveDay(nextActiveIndex === -1 ? 0 : nextActiveIndex);
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
  const order = orderedLifts(settings.liftOrder);
  const doneKeys = new Set(
    order.filter((key) =>
      data.sessions.some((s) => s.status === 'done' && s.liftKey === key && s.week === selectedWeek),
    ),
  );

  return (
    <main className="min-h-screen bg-[var(--bg)] px-4 py-6 text-[var(--text)] flex justify-center">
      <div className="w-full max-w-md pb-4">
        <header className="mb-4 flex items-center justify-between gap-3">
          <Link
            to="/"
            aria-label="Home"
            className="inline-flex min-w-0 items-center gap-1.5 rounded-[var(--r-pill)] border border-[var(--line)] bg-[var(--surface-2)] px-2.5 py-1.5 hover:border-[var(--accent)] hover:text-[var(--accent)]"
          >
            <HomeIcon className="h-6 w-6 flex-none" />
            <span className="min-w-0">
              <h1 className="text-[22px] font-extrabold leading-tight">5/3/1</h1>
            </span>
          </Link>
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

        <div className="mb-4">
          <WeekTabs week={selectedWeek} onChange={setSelectedWeek} />
        </div>

        <div className="mb-3">
          <DayStrip
            lifts={order.map((key) => ({ key, label: DAY_LABEL[key] }))}
            activeDay={activeDay}
            doneKeys={doneKeys}
            onSelect={goToDay}
            onReorder={handleDayReorder}
          />
        </div>

        <div
          ref={pagerRef}
          onScroll={handlePagerScroll}
          data-testid="day-pager"
          className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden -mx-1 px-1"
        >
          {order.map((key, index) => (
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
