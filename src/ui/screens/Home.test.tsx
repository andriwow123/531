import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { db } from '../../data/db';
import { profileRepo, liftRepo, cycleRepo, sessionRepo } from '../../data/repositories';
import { estimate1RM } from '../../domain';
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

  it('logs a session with sets and a stored estimated1RM on Save', async () => {
    const cycleId = await seed();
    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );

    await screen.findByText('Overhead Press');

    // Toggle the first warm-up set done.
    fireEvent.click(screen.getByLabelText('Mark 40kg set done'));

    // Enter AMRAP reps and mark it done.
    fireEvent.change(screen.getByLabelText('Reps completed for 85kg AMRAP set'), {
      target: { value: '7' },
    });
    fireEvent.click(screen.getByLabelText('Mark 85kg AMRAP set done'));

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
});
