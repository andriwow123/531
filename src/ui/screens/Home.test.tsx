import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { db } from '../../data/db';
import { profileRepo, liftRepo, cycleRepo, sessionRepo } from '../../data/repositories';
import { estimate1RM } from '../../domain';
import { defaultSettings } from '../../settings/schema';
import Home from './Home';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

async function seed() {
  await profileRepo.save({ id: 'me', units: 'kg', roundingIncrement: 2.5, tmPercent: 0.85 });
  await liftRepo.bulkSave([
    { key: 'press', name: 'Overhead Press', category: 'upper', oneRm: 100, trainingMax: 100, increment: 2.5 },
    { key: 'bench', name: 'Bench Press', category: 'upper', oneRm: 100, trainingMax: 100, increment: 2.5 },
    { key: 'squat', name: 'Squat', category: 'lower', oneRm: 100, trainingMax: 100, increment: 5 },
    { key: 'deadlift', name: 'Deadlift', category: 'lower', oneRm: 100, trainingMax: 100, increment: 5 },
  ]);
  const cycleId = await cycleRepo.add({
    index: 1,
    startedAt: '2026-01-01',
    status: 'active',
    template: 'base',
    fivesPro: false,
    tm: { press: 100, bench: 100, squat: 100, deadlift: 100 },
  });
  return cycleId;
}

describe('Home', () => {
  it('shows the current lift and its three main set weights', async () => {
    await seed();
    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );

    // Week 1 has no sessions logged yet -> nextUp is press.
    expect(await screen.findByText('Overhead Press')).toBeTruthy();

    // Week 1 main sets: 65%, 75%, 85% of a 100 TM.
    expect(screen.getByText('65')).toBeTruthy();
    expect(screen.getByText('75')).toBeTruthy();
    expect(screen.getByText('85')).toBeTruthy();
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

    render(
      <MemoryRouter>
        <Home settings={defaultSettings} />
      </MemoryRouter>,
    );

    await screen.findByText('Overhead Press');

    // base template would be 3 warm-ups + 3 main sets = 6 rows;
    // bbb adds 5 supplemental sets at 50% TM = 11 rows.
    expect(screen.getAllByRole('listitem')).toHaveLength(11);
  });

  it('logs a session with sets and a stored estimated1RM on Save', async () => {
    const cycleId = await seed();
    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );

    await screen.findByText('Overhead Press');

    // Toggle the first warm-up set done.
    fireEvent.click(screen.getByLabelText('Mark warm-up set 1 (40kg) done'));

    // Enter AMRAP reps and mark it done.
    fireEvent.change(screen.getByLabelText('Reps completed for main set 3 (85kg) AMRAP set'), {
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
  });

  it('keeps a completed warm-up row visible when hideCompletedWarmups is false', async () => {
    await seed();
    render(
      <MemoryRouter>
        <Home settings={{ ...defaultSettings, hideCompletedWarmups: false }} />
      </MemoryRouter>,
    );

    await screen.findByText('Overhead Press');
    fireEvent.click(screen.getByLabelText('Mark warm-up set 1 (40kg) done'));

    expect(screen.getByLabelText('Mark warm-up set 1 (40kg) done')).toBeTruthy();
  });

  it('hides a completed warm-up row once marked done when hideCompletedWarmups is true', async () => {
    await seed();
    render(
      <MemoryRouter>
        <Home settings={{ ...defaultSettings, hideCompletedWarmups: true }} />
      </MemoryRouter>,
    );

    await screen.findByText('Overhead Press');
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

    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );

    // Week 4 (deload) for press: warm-ups are 40/50/60% of TM and so are the
    // three main sets, at the same TM=100 -> both land on 40/50/60kg.
    await screen.findByText('Overhead Press');
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
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/cycle-end" element={<div>Cycle end screen</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Cycle end screen')).toBeTruthy();
  });
});
