import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { db } from '../../data/db';
import { profileRepo, liftRepo, cycleRepo, sessionRepo } from '../../data/repositories';
import History from './History';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

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

describe('History', () => {
  it('shows the empty-state prompt and bottom nav when no sessions are logged', async () => {
    await profileRepo.save({ id: 'me', units: 'kg', roundingIncrement: 2.5, tmPercent: 0.85 });

    render(
      <MemoryRouter>
        <History />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/log a few workouts and your progress shows up here/i)).toBeTruthy();
    expect(screen.getByText('Today')).toBeTruthy();
    expect(screen.getByText('Settings')).toBeTruthy();

    // No lift cards or cycle log when there's nothing to show.
    expect(screen.queryByRole('heading', { name: 'Overhead Press' })).toBeNull();
    expect(screen.queryByText('Cycle log')).toBeNull();
  });

  it('renders a card per lift, a PR badge for a lift with data, and a cycle-log entry', async () => {
    const cycleId = await seed();
    await sessionRepo.add({
      cycleId,
      week: 1,
      liftKey: 'press',
      date: '2026-01-05',
      status: 'done',
      sets: [{ targetReps: 1, weight: 85, actualReps: 7, done: true, isAmrap: true, kind: 'main' }],
      amrapReps: 7,
      estimated1RM: 106,
      rpe: null,
      notes: '',
    });

    render(
      <MemoryRouter>
        <History />
      </MemoryRouter>,
    );

    // A card for every lift in LIFT_ORDER, even lifts with no sessions.
    for (const name of ['Overhead Press', 'Bench Press', 'Squat', 'Deadlift']) {
      expect(await screen.findByRole('heading', { name })).toBeTruthy();
    }

    // PR callout for the lift that has a logged AMRAP session.
    expect(screen.getByText(/PR 106/)).toBeTruthy();

    // Cycle log section with the logged entry's top set.
    expect(screen.getByText('Cycle log')).toBeTruthy();
    expect(screen.getByText(/85 kg × 7/)).toBeTruthy();
  });

  it('always shows the PR callout and progress chart for a lift with data', async () => {
    // The PR callout and chart are the History tab's core content in v1, so
    // they must render unconditionally for a lift that has data — there is
    // no Settings screen yet to opt back into them if they were hidden.
    const cycleId = await seed();
    await sessionRepo.add({
      cycleId,
      week: 1,
      liftKey: 'press',
      date: '2026-01-05',
      status: 'done',
      sets: [{ targetReps: 1, weight: 85, actualReps: 7, done: true, isAmrap: true, kind: 'main' }],
      amrapReps: 7,
      estimated1RM: 106,
      rpe: null,
      notes: '',
    });

    render(
      <MemoryRouter>
        <History />
      </MemoryRouter>,
    );

    await screen.findByRole('heading', { name: 'Overhead Press' });
    expect(screen.getByText(/PR 106/)).toBeTruthy();
    // One "Est. 1RM" toggle button per lift card (chart renders unconditionally).
    expect(screen.getAllByRole('button', { name: /est\. 1rm/i }).length).toBe(4);
    expect(screen.getByText(/85 kg × 7/)).toBeTruthy();
  });
});
