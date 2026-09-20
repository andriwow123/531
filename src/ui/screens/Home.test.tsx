import { describe, it, expect, beforeEach } from 'vitest';
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
