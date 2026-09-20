import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { db } from '../../data/db';
import { profileRepo, liftRepo, cycleRepo, sessionRepo, settingsRepo } from '../../data/repositories';
import { estimate1RM } from '../../domain';
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
    // Deliberately varied TMs across lifts so switching the selected lift
    // produces a visibly different set of weights.
    tm: { press: 100, bench: 100, squat: 150, deadlift: 140 },
  });
  return cycleId;
}

describe('Home', () => {
  it('shows the current lift and its three main set weights', async () => {
    await seed();
    renderHome();

    // Week 1 has no sessions logged yet -> nextUp is press.
    expect(await screen.findByRole('heading', { name: 'Overhead Press' })).toBeTruthy();

    // Week 1 main sets: 65%, 75%, 85% of a 100 TM.
    expect(screen.getByText('65')).toBeTruthy();
    expect(screen.getByText('75')).toBeTruthy();
    expect(screen.getByText('85')).toBeTruthy();
  });

  it('renders all 4 lifts as selectable chips, pre-selecting the suggested lift', async () => {
    await seed();
    renderHome();

    await screen.findByRole('heading', { name: 'Overhead Press' });

    for (const name of ['Overhead Press', 'Bench Press', 'Squat', 'Deadlift']) {
      expect(screen.getByRole('button', { name })).toBeTruthy();
    }

    // press is nextUp -> its chip should be the selected one; the others aren't.
    expect(screen.getByRole('button', { name: 'Overhead Press' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getByRole('button', { name: 'Bench Press' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
  });

  it('changes the shown set weights when a different lift is selected', async () => {
    await seed();
    renderHome();

    // Default view is press (TM 100): week 1 top set is 85.
    await screen.findByRole('heading', { name: 'Overhead Press' });
    expect(screen.getByText('85')).toBeTruthy();

    // Squat has TM 150 -> week 1 top set (85% of 150) is 127.5.
    fireEvent.click(screen.getByRole('button', { name: 'Squat' }));

    await screen.findByRole('heading', { name: 'Squat' });
    expect(screen.getByText('127.5')).toBeTruthy();
    expect(screen.queryByText('85')).toBeNull();
  });

  it('marks a lift already done this week and hides Save for it', async () => {
    const cycleId = await seed();
    await sessionRepo.add({
      cycleId,
      week: 1,
      liftKey: 'press',
      date: '2026-01-01',
      status: 'done',
      sets: [],
      amrapReps: 5,
      estimated1RM: 100,
      rpe: null,
      notes: '',
    });

    renderHome();

    // nextUp now suggests bench (press done in week 1); it becomes selected.
    await screen.findByRole('heading', { name: 'Bench Press' });

    const pressChip = screen
      .getAllByRole('button')
      .find((b) => b.textContent?.startsWith('Overhead Press')) as HTMLElement;
    expect(pressChip).toBeTruthy();
    expect(within(pressChip).getByLabelText('Done this week')).toBeTruthy();

    // Selecting the already-done lift shows a badge and no Save button.
    fireEvent.click(pressChip);
    expect(await screen.findByText('Already logged this week')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /save/i })).toBeNull();
  });

  it('builds the workout from the active cycle\'s template snapshot, not live settings', async () => {
    // Cycle was started under the BBB template even though current settings
    // (which the user may have changed since) still default to 'base'.
    await profileRepo.save({ id: 'me', units: 'kg', roundingIncrement: 2.5, tmPercent: 0.85 });
    await liftRepo.bulkSave([
      { key: 'press', name: 'Overhead Press', category: 'upper', oneRm: 100, trainingMax: 100, increment: 2.5 },
      { key: 'bench', name: 'Bench Press', category: 'upper', oneRm: 100, trainingMax: 100, increment: 2.5 },
      { key: 'squat', name: 'Squat', category: 'lower', oneRm: 100, trainingMax: 100, increment: 5 },
      { key: 'deadlift', name: 'Deadlift', category: 'lower', oneRm: 100, trainingMax: 100, increment: 5 },
    ]);
    await cycleRepo.add({
      index: 1,
      startedAt: '2026-01-01',
      status: 'active',
      template: 'bbb',
      fivesPro: false,
      tm: { press: 100, bench: 100, squat: 100, deadlift: 100 },
    });

    renderHome();

    await screen.findByRole('heading', { name: 'Overhead Press' });

    // base template would be 3 warm-ups + 3 main sets = 6 rows;
    // bbb adds 5 supplemental sets at 50% TM = 11 rows.
    expect(screen.getAllByRole('listitem')).toHaveLength(11);

    // The header label must reflect the cycle's own template snapshot
    // ('bbb' -> "Boring But Big"), not live settings (which default to
    // 'base' -> "5/3/1 week") — template changes apply to the NEXT cycle.
    expect(screen.getByText('Boring But Big')).toBeTruthy();
    expect(screen.queryByText('5/3/1 week')).toBeNull();
  });

  it('logs a session with sets and a stored estimated1RM on Save', async () => {
    const cycleId = await seed();
    renderHome();

    await screen.findByRole('heading', { name: 'Overhead Press' });

    // Toggle the first warm-up set done.
    fireEvent.click(screen.getByLabelText('Mark warm-up set 1 (40kg) done'));

    // Enter AMRAP reps and mark it done.
    fireEvent.change(screen.getByLabelText('Reps done'), {
      target: { value: '7' },
    });
    fireEvent.click(screen.getByLabelText('Mark main set 3 (85kg) AMRAP set done'));

    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(async () => {
      const sessions = await sessionRepo.forCycle(cycleId);
      expect(sessions).toHaveLength(1);
    });

    const [session] = await sessionRepo.forCycle(cycleId);
    expect(session.liftKey).toBe('press');
    expect(session.week).toBe(1);
    expect(session.sets.length).toBeGreaterThan(0);

    const warmup = session.sets.find((s) => s.kind === 'warmup' && s.weight === 40);
    expect(warmup?.done).toBe(true);

    const amrapSet = session.sets.find((s) => s.isAmrap);
    expect(amrapSet?.actualReps).toBe(7);
    expect(amrapSet?.done).toBe(true);

    expect(session.amrapReps).toBe(7);
    expect(session.estimated1RM).toBeCloseTo(estimate1RM(85, 7), 5);

    // After saving, the default selection moves on to the next suggested lift.
    await screen.findByRole('heading', { name: 'Bench Press' });
  });

  it('keeps a completed warm-up row visible when hideCompletedWarmups is false', async () => {
    await seed();
    await settingsRepo.save({ ...defaultSettings, hideCompletedWarmups: false });
    renderHome();

    await screen.findByRole('heading', { name: 'Overhead Press' });
    fireEvent.click(screen.getByLabelText('Mark warm-up set 1 (40kg) done'));

    expect(screen.getByLabelText('Mark warm-up set 1 (40kg) done')).toBeTruthy();
  });

  it('hides a completed warm-up row once marked done when hideCompletedWarmups is true', async () => {
    await seed();
    await settingsRepo.save({ ...defaultSettings, hideCompletedWarmups: true });
    renderHome();

    await screen.findByRole('heading', { name: 'Overhead Press' });
    // Still visible before it's marked done.
    expect(screen.getByLabelText('Mark warm-up set 1 (40kg) done')).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Mark warm-up set 1 (40kg) done'));

    expect(screen.queryByLabelText('Mark warm-up set 1 (40kg) done')).toBeNull();
  });

  it('gives warm-up and main sets distinct aria-labels on the base deload week, where both hit 40/50/60kg', async () => {
    const cycleId = await seed();
    const liftKeys = ['press', 'bench', 'squat', 'deadlift'] as const;
    for (const liftKey of liftKeys) {
      await sessionRepo.add({
        cycleId,
        week: 3,
        liftKey,
        date: '2026-01-21',
        status: 'done',
        sets: [],
        amrapReps: null,
        estimated1RM: null,
        rpe: null,
        notes: '',
      });
    }

    renderHome();

    // Week 4 (deload) for press: warm-ups are 40/50/60% of TM and so are the
    // three main sets, at the same TM=100 -> both land on 40/50/60kg.
    await screen.findByRole('heading', { name: 'Overhead Press' });
    expect(screen.getByText('Week 4', { exact: false })).toBeTruthy();

    const warmup1 = screen.getByLabelText('Mark warm-up set 1 (40kg) done');
    const main1 = screen.getByLabelText('Mark main set 1 (40kg) done');
    expect(warmup1).toBeTruthy();
    expect(main1).toBeTruthy();
    expect(warmup1).not.toBe(main1);

    expect(screen.getByLabelText('Mark warm-up set 2 (50kg) done')).toBeTruthy();
    expect(screen.getByLabelText('Mark main set 2 (50kg) done')).toBeTruthy();
    expect(screen.getByLabelText('Mark warm-up set 3 (60kg) done')).toBeTruthy();
    expect(screen.getByLabelText('Mark main set 3 (60kg) done')).toBeTruthy();
  });

  it('labels warm-up rows with a "Warm-up" badge', async () => {
    await seed();
    renderHome();

    await screen.findByRole('heading', { name: 'Overhead Press' });
    // base template week 1: 3 warm-up rows, each carrying the badge.
    expect(screen.getAllByText('Warm-up')).toHaveLength(3);
  });

  it('keeps the notes textarea collapsed until "Add note" is clicked', async () => {
    await seed();
    renderHome();

    await screen.findByRole('heading', { name: 'Overhead Press' });
    expect(screen.queryByLabelText('Notes')).toBeNull();

    fireEvent.click(screen.getByText('+ Add note'));

    expect(screen.getByLabelText('Notes')).toBeTruthy();
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

describe('Home — live display settings', () => {
  it('shows plate breakdown and notes controls when displayPreset is detailed', async () => {
    await seed();
    await settingsRepo.save({ ...defaultSettings, displayPreset: 'detailed' });
    renderHome();

    await screen.findByRole('heading', { name: 'Overhead Press' });
    expect(await screen.findByText('Per side')).toBeTruthy();
    expect(screen.getByText('+ Add note')).toBeTruthy();
  });

  it('hides plate breakdown and notes controls when displayPreset is simple', async () => {
    await seed();
    await settingsRepo.save({ ...defaultSettings, displayPreset: 'simple' });
    renderHome();

    await screen.findByRole('heading', { name: 'Overhead Press' });
    await waitFor(() => {
      expect(screen.queryByText('Per side')).toBeNull();
      expect(screen.queryByText('+ Add note')).toBeNull();
    });
  });
});

describe('Home — running rest timer', () => {
  it('renders the configured seconds when enabled and the display allows it, and Start begins the countdown', async () => {
    await seed();
    await settingsRepo.save({
      ...defaultSettings,
      restTimer: { enabled: true, defaultSeconds: 90, notify: false },
    });
    renderHome();

    await screen.findByRole('heading', { name: 'Overhead Press' });
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

    await screen.findByRole('heading', { name: 'Overhead Press' });
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

    await screen.findByRole('heading', { name: 'Overhead Press' });
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Start' })).toBeNull();
    });
  });
});

describe('Home — assistance tracking', () => {
  it('shows the Assistance section when assistanceTracking is on (default)', async () => {
    await seed();
    renderHome();

    await screen.findByRole('heading', { name: 'Overhead Press' });

    expect(await screen.findByRole('heading', { name: /assistance/i })).toBeTruthy();
  });

  it('hides the Assistance section when assistanceTracking is off', async () => {
    await seed();
    await settingsRepo.save({ ...defaultSettings, assistanceTracking: false });
    renderHome();

    await screen.findByRole('heading', { name: 'Overhead Press' });

    // SettingsProvider starts with defaultSettings (assistanceTracking: true)
    // and only reflects the saved value once its mount-time load resolves,
    // so assert via waitFor rather than a synchronous query.
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: /assistance/i })).toBeNull();
    });
  });
});

describe('Home — exercise demos', () => {
  it('shows the "How to perform" affordance when exerciseDemos is enabled', async () => {
    await seed();
    // defaultSettings.exerciseDemos is true; seed explicitly so the assertion
    // doesn't depend on that default staying true.
    await settingsRepo.save({ ...defaultSettings, exerciseDemos: true });
    renderHome();

    await screen.findByRole('heading', { name: 'Overhead Press' });

    expect(await screen.findByRole('button', { name: /how to perform/i })).toBeTruthy();
  });

  it('hides the "How to perform" affordance when exerciseDemos is disabled', async () => {
    await seed();
    await settingsRepo.save({ ...defaultSettings, exerciseDemos: false });
    renderHome();

    await screen.findByRole('heading', { name: 'Overhead Press' });

    // SettingsProvider seeds state with defaultSettings (exerciseDemos: true)
    // and only reflects the saved settings (exerciseDemos: false) once its
    // mount-time load resolves, so assert via waitFor rather than a
    // synchronous query (see other "Home —" describes above for the same race).
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /how to perform/i })).toBeNull();
    });
  });
});
