import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { db } from '../../data/db';
import { profileRepo, liftRepo, cycleRepo, sessionRepo, settingsRepo } from '../../data/repositories';
import { defaultSettings } from '../../settings/schema';
import { SettingsProvider } from '../settings/SettingsContext';
import Home from './Home';

beforeEach(async () => {
  await db.delete();
  await db.open();
  // jsdom has no real layout/scrolling — stub scrollTo so `goToDay`'s
  // smooth-scroll call doesn't throw and can be asserted where relevant.
  HTMLElement.prototype.scrollTo = vi.fn();
});

function renderHome() {
  return render(
    <SettingsProvider>
      <MemoryRouter>
        <Home />
      </MemoryRouter>
    </SettingsProvider>,
  );
}

/** Waits for the loaded cycle-overview screen (all 4 lift cards mounted). */
async function waitForLoaded() {
  await screen.findByRole('heading', { name: 'Overhead Press' });
}

async function seed() {
  await profileRepo.save({ id: 'me', units: 'kg', roundingIncrement: 2.5, tmPercent: 0.85 });
  await liftRepo.bulkSave([
    { key: 'press', name: 'Overhead Press', category: 'upper', oneRm: 100, trainingMax: 100, increment: 2.5 },
    { key: 'bench', name: 'Bench Press', category: 'upper', oneRm: 100, trainingMax: 100, increment: 2.5 },
    { key: 'squat', name: 'Squat', category: 'lower', oneRm: 100, trainingMax: 150, increment: 5 },
    { key: 'deadlift', name: 'Deadlift', category: 'lower', oneRm: 100, trainingMax: 140, increment: 5 },
  ]);
  const cycleId = await cycleRepo.add({
    index: 1,
    startedAt: '2026-01-01',
    status: 'active',
    template: 'base',
    fivesPro: false,
    tm: { press: 100, bench: 100, squat: 150, deadlift: 140 },
  });
  return cycleId;
}

describe('Home', () => {
  it('shows all 4 lifts as cards for the current week', async () => {
    await seed();
    renderHome();

    await waitForLoaded();

    for (const name of ['Overhead Press', 'Bench Press', 'Squat', 'Deadlift']) {
      expect(screen.getByRole('heading', { name })).toBeTruthy();
    }
  });

  it('shows a top-left Home link (the 5/3/1 wordmark) and top-right icon links to History and Settings', async () => {
    await seed();
    renderHome();

    await waitForLoaded();

    const homeLink = screen.getByRole('link', { name: 'Home' });
    expect(homeLink.getAttribute('href')).toBe('/');
    // Reads as a tappable button: home icon alongside the wordmark.
    expect(homeLink.querySelector('svg')).toBeTruthy();
    expect(homeLink.textContent).toContain('5/3/1');

    const historyLink = screen.getByRole('link', { name: 'History' });
    expect(historyLink.getAttribute('href')).toBe('/history');
    expect(historyLink.getAttribute('aria-current')).toBeNull();

    const settingsLink = screen.getByRole('link', { name: 'Settings' });
    expect(settingsLink.getAttribute('href')).toBe('/settings');
    expect(settingsLink.getAttribute('aria-current')).toBeNull();
  });

  it('WeekTabs switches the shown week — deload has no AMRAP set, week 1 does', async () => {
    await seed();
    renderHome();

    await waitForLoaded();

    // Week 1 (default) is an AMRAP week — every lift's top set is "as many
    // reps as possible"; there are 4 cards, so 4 occurrences.
    expect(screen.getAllByText('as many reps as possible')).toHaveLength(4);
    expect(screen.getByText(/5×5\/5\/5\+ · 65\/75\/85%/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Deload/ }));

    // Deload (week 4) is a straight-sets week — no set is ever AMRAP.
    await waitFor(() => {
      expect(screen.queryByText('as many reps as possible')).toBeNull();
    });
    expect(screen.getByText(/Deload · 40\/50\/60%, no AMRAP/)).toBeTruthy();
  });

  it('shows a lift already logged this week as read-only, via the session resolved by Home', async () => {
    const cycleId = await seed();
    await sessionRepo.add({
      cycleId,
      week: 1,
      liftKey: 'bench',
      date: '2026-01-01',
      status: 'done',
      sets: [],
      amrapReps: 8,
      estimated1RM: 120,
      rpe: null,
      notes: '',
    });

    renderHome();
    await waitForLoaded();

    const benchHeading = screen.getByRole('heading', { name: 'Bench Press' });
    const benchCard = benchHeading.closest('section') as HTMLElement;
    expect(await within(benchCard).findByText(/logged this week/i)).toBeTruthy();

    const pressHeading = screen.getByRole('heading', { name: 'Overhead Press' });
    const pressCard = pressHeading.closest('section') as HTMLElement;
    expect(within(pressCard).queryByText(/logged this week/i)).toBeNull();
  });

  it('routes to /cycle-end once all four lifts have logged week 4', async () => {
    const cycleId = await seed();
    const liftKeys = ['press', 'bench', 'squat', 'deadlift'] as const;
    for (const liftKey of liftKeys) {
      await sessionRepo.add({
        cycleId,
        week: 4,
        liftKey,
        date: '2026-01-28',
        status: 'done',
        sets: [],
        amrapReps: null,
        estimated1RM: null,
        rpe: null,
        notes: '',
      });
    }

    render(
      <SettingsProvider>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/cycle-end" element={<div>Cycle end screen</div>} />
          </Routes>
        </MemoryRouter>
      </SettingsProvider>,
    );

    expect(await screen.findByText('Cycle end screen')).toBeTruthy();
  });
});

describe('Home — DayStrip pager', () => {
  it('renders the pager container alongside all 4 lift cards', async () => {
    await seed();
    renderHome();

    await waitForLoaded();

    expect(screen.getByTestId('day-pager')).toBeTruthy();
    for (const name of ['Overhead Press', 'Bench Press', 'Squat', 'Deadlift']) {
      expect(screen.getByRole('heading', { name })).toBeTruthy();
    }
  });

  it('defaults the active day to press (nextUp) for a fresh cycle', async () => {
    await seed();
    renderHome();

    await waitForLoaded();

    const pressDay = screen.getByRole('button', { name: /^Press/ });
    expect(pressDay.getAttribute('aria-current')).toBe('true');
    const benchDay = screen.getByRole('button', { name: /^Bench/ });
    expect(benchDay.getAttribute('aria-current')).toBeNull();
  });

  it('defaults the active day to nextUp\'s lift once earlier lifts are already logged', async () => {
    const cycleId = await seed();
    await sessionRepo.add({
      cycleId,
      week: 1,
      liftKey: 'press',
      date: '2026-01-01',
      status: 'done',
      sets: [],
      amrapReps: 8,
      estimated1RM: 120,
      rpe: null,
      notes: '',
    });

    renderHome();
    await waitForLoaded();

    const benchDay = await screen.findByRole('button', { name: /^Bench/ });
    expect(benchDay.getAttribute('aria-current')).toBe('true');
    const pressDay = screen.getByRole('button', { name: /^Press/ });
    expect(pressDay.getAttribute('aria-current')).toBeNull();
    // Done marker: press already has a session logged for the selected week.
    expect(within(pressDay).getByLabelText('done')).toBeTruthy();
  });

  it('clicking a different DayStrip day makes it active and scrolls the pager', async () => {
    await seed();
    renderHome();
    await waitForLoaded();

    const squatDay = screen.getByRole('button', { name: /^Squat/ });
    fireEvent.click(squatDay);

    expect(squatDay.getAttribute('aria-current')).toBe('true');
    const pressDay = screen.getByRole('button', { name: /^Press/ });
    expect(pressDay.getAttribute('aria-current')).toBeNull();
    expect(HTMLElement.prototype.scrollTo).toHaveBeenCalled();
  });
});

describe('Home — default active day respects a saved custom lift order', () => {
  it('defaults the active day to nextUp\'s lift at ITS POSITION in a saved custom liftOrder, not the default order', async () => {
    // Regression test: SettingsProvider loads settings asynchronously, so at
    // the moment Home's initial-load effect ran, `settings.liftOrder` was
    // still the DEFAULT (['press','bench','squat','deadlift']) even though a
    // custom order is persisted. The bug computed activeDay as
    // `order.indexOf(nextUp(...).liftKey)` using that stale default order —
    // landing on the wrong chip/card once the custom order actually renders.
    const cycleId = await seed();
    await sessionRepo.add({
      cycleId,
      week: 1,
      liftKey: 'press',
      date: '2026-01-01',
      status: 'done',
      sets: [],
      amrapReps: 8,
      estimated1RM: 120,
      rpe: null,
      notes: '',
    });
    // nextUp after press is logged for week 1 -> bench, week 1.
    // Custom saved order puts bench at index 3 (not its default index 1).
    await settingsRepo.save({
      ...defaultSettings,
      liftOrder: ['squat', 'deadlift', 'press', 'bench'],
    });

    renderHome();
    await waitForLoaded();

    const dayStripGroup = screen.getByRole('group', { name: 'Training day' });
    const dayButtons = within(dayStripGroup).getAllByRole('button');

    // Cards/chips must render in the loaded custom order.
    await waitFor(() => expect(dayButtons[3].textContent).toMatch(/^Bench/));

    const benchDay = within(dayStripGroup).getByRole('button', { name: /^Bench/ });
    await waitFor(() => expect(benchDay.getAttribute('aria-current')).toBe('true'));

    // No other chip is marked active.
    for (const label of ['Squat', 'Deadlift', 'Press']) {
      const button = within(dayStripGroup).getByRole('button', { name: new RegExp(`^${label}`) });
      expect(button.getAttribute('aria-current')).toBeNull();
    }

    const pager = screen.getByTestId('day-pager');
    const firstHeading = within(pager).getAllByRole('heading')[0];
    expect(firstHeading.textContent).toBe('Squat');
  });
});

describe('Home — lift order display', () => {
  it('renders day cards and DayStrip in the default order (press first) when no liftOrder is set', async () => {
    await seed();
    renderHome();

    await waitForLoaded();

    const pager = screen.getByTestId('day-pager');
    const firstHeading = within(pager).getAllByRole('heading')[0];
    expect(firstHeading.textContent).toBe('Overhead Press');
    expect(within(firstHeading.closest('section') as HTMLElement).getByText('Day 1')).toBeTruthy();

    const dayStripGroup = screen.getByRole('group', { name: 'Training day' });
    const firstDayButton = within(dayStripGroup).getAllByRole('button')[0];
    expect(firstDayButton.textContent).toMatch(/^Press/);
  });

  it('renders day cards and DayStrip in a custom liftOrder', async () => {
    await seed();
    await settingsRepo.save({
      ...defaultSettings,
      liftOrder: ['squat', 'deadlift', 'press', 'bench'],
    });
    renderHome();

    await waitForLoaded();

    const pager = screen.getByTestId('day-pager');
    const firstHeading = within(pager).getAllByRole('heading')[0];
    expect(firstHeading.textContent).toBe('Squat');
    expect(within(firstHeading.closest('section') as HTMLElement).getByText('Day 1')).toBeTruthy();

    const dayStripGroup = screen.getByRole('group', { name: 'Training day' });
    const dayButtons = within(dayStripGroup).getAllByRole('button');
    expect(dayButtons[0].textContent).toMatch(/^Squat/);
    expect(dayButtons[1].textContent).toMatch(/^Deadlift/);
    expect(dayButtons[2].textContent).toMatch(/^Press/);
    expect(dayButtons[3].textContent).toMatch(/^Bench/);
  });
});

describe('Home — DayStrip reorder', () => {
  /** Stubs each chip's getBoundingClientRect to lay them out left-to-right,
   *  100px apart — jsdom does no real layout, so the pointer-drag target
   *  detection inside DayStrip needs deterministic stand-in geometry. */
  function stubChipLayout(buttons: HTMLElement[]) {
    buttons.forEach((btn, i) => {
      vi.spyOn(btn, 'getBoundingClientRect').mockReturnValue({
        left: i * 100,
        right: i * 100 + 100,
        width: 100,
        top: 0,
        bottom: 40,
        height: 40,
        x: i * 100,
        y: 0,
        toJSON() {
          return {};
        },
      } as DOMRect);
    });
  }

  it('dragging the active day chip past the threshold persists the new liftOrder and keeps that lift active', async () => {
    await seed();
    renderHome();
    await waitForLoaded();

    // Fresh cycle -> default order (press, bench, squat, deadlift), active day = press (index 0).
    const dayStripGroup = screen.getByRole('group', { name: 'Training day' });
    const buttons = within(dayStripGroup).getAllByRole('button');
    stubChipLayout(buttons);

    const pressButton = buttons[0];
    fireEvent.pointerDown(pressButton, { pointerId: 1, clientX: 10 });
    // clientX 220 falls left of chip 2's midpoint (250) -> rawTarget 2 ->
    // finalDropIndex(0, 2) === 1, so press should land at index 1.
    fireEvent.pointerMove(pressButton, { pointerId: 1, clientX: 220 });
    fireEvent.pointerUp(pressButton, { pointerId: 1, clientX: 220 });

    await waitFor(() => {
      const updated = within(screen.getByRole('group', { name: 'Training day' })).getAllByRole(
        'button',
      );
      expect(updated[0].textContent).toMatch(/^Bench/);
      expect(updated[1].textContent).toMatch(/^Press/);
    });

    const updated = within(screen.getByRole('group', { name: 'Training day' })).getAllByRole(
      'button',
    );
    // The active marker follows press's lift to its new slot, not the old slot index.
    expect(updated[1].getAttribute('aria-current')).toBe('true');
    expect(updated[0].getAttribute('aria-current')).toBeNull();

    const saved = await settingsRepo.get();
    expect(saved.liftOrder).toEqual(['bench', 'press', 'squat', 'deadlift']);
  });
});

describe('Home — settings pass-through to lift cards', () => {
  it('shows exercise demo and supporting lifts affordances on every card when enabled', async () => {
    await seed();
    await settingsRepo.save({ ...defaultSettings, exerciseDemos: true, assistanceTracking: true });
    renderHome();

    await waitForLoaded();

    expect(await screen.findAllByRole('button', { name: /how to perform/i })).toHaveLength(4);
    expect(screen.getAllByRole('button', { name: /supporting lifts/i })).toHaveLength(4);
  });

  it('hides exercise demo and supporting lifts affordances on every card when disabled', async () => {
    await seed();
    await settingsRepo.save({ ...defaultSettings, exerciseDemos: false, assistanceTracking: false });
    renderHome();

    await waitForLoaded();

    // SettingsProvider seeds state with defaultSettings (both true) and only
    // reflects the saved settings once its mount-time load resolves.
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /how to perform/i })).toBeNull();
      expect(screen.queryByRole('button', { name: /supporting lifts/i })).toBeNull();
    });
  });
});

describe('Home — rest timer', () => {
  it('renders the configured seconds when enabled and the display allows it, and Start begins the countdown', async () => {
    await seed();
    await settingsRepo.save({
      ...defaultSettings,
      restTimer: { enabled: true, defaultSeconds: 90, notify: false },
    });
    renderHome();

    await waitForLoaded();
    expect(await screen.findByText('1:30')).toBeTruthy();

    const startButton = screen.getByRole('button', { name: 'Start' });
    const pauseButton = screen.getByRole('button', { name: 'Pause' });
    expect(startButton).not.toBeDisabled();
    expect(pauseButton).toBeDisabled();

    fireEvent.click(startButton);

    expect(startButton).toBeDisabled();
    expect(pauseButton).not.toBeDisabled();
  });

  it('does not render the rest-timer widget when restTimer.enabled is false', async () => {
    await seed();
    await settingsRepo.save({
      ...defaultSettings,
      restTimer: { enabled: false, defaultSeconds: 90, notify: false },
    });
    renderHome();

    await waitForLoaded();
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Start' })).toBeNull();
    });
  });

  it('does not render the rest-timer widget when the display preset hides it', async () => {
    await seed();
    await settingsRepo.save({
      ...defaultSettings,
      displayPreset: 'simple',
      displayOverrides: {},
      restTimer: { enabled: true, defaultSeconds: 90, notify: false },
    });
    renderHome();

    await waitForLoaded();
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Start' })).toBeNull();
    });
  });
});
