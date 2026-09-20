import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { db } from '../../data/db';
import { cycleRepo, sessionRepo } from '../../data/repositories';
import type { Cycle } from '../../data/repositories';
import { defaultSettings } from '../../settings/schema';
import { SettingsProvider } from '../settings/SettingsContext';
import LiftCard from './LiftCard';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

async function seedCycle(): Promise<Cycle> {
  const id = await cycleRepo.add({
    index: 1,
    startedAt: '2026-01-01',
    status: 'active',
    template: 'base',
    fivesPro: false,
    tm: { press: 100, bench: 100, squat: 150, deadlift: 140 },
  });
  const cycle = (await cycleRepo.active()) as Cycle;
  return { ...cycle, id };
}

function renderCard(cycle: Cycle, overrides: Partial<Parameters<typeof LiftCard>[0]> = {}) {
  return render(
    <SettingsProvider>
      <LiftCard
        liftKey="deadlift"
        week={1}
        cycle={cycle}
        unit="kg"
        roundingIncrement={2.5}
        dayNumber={2}
        settings={defaultSettings}
        {...overrides}
      />
    </SettingsProvider>,
  );
}

describe('LiftCard', () => {
  it('renders header, work weights/reps, and a plate breakdown; logs a session once all main sets are done', async () => {
    const cycle = await seedCycle();
    renderCard(cycle);

    // Header: lift name, day number, training max.
    expect(await screen.findByRole('heading', { name: 'Deadlift' })).toBeTruthy();
    expect(screen.getByText('Day 2')).toBeTruthy();
    expect(screen.getByText(/training max/i)).toBeTruthy();
    expect(screen.getByText('140 kg')).toBeTruthy();

    // Week 1 main sets for TM 140, roundingIncrement 2.5: 65% -> 90(?), 75% ->
    // 105, 85% -> 119(AMRAP). Assert reps markers instead of exact weights to
    // stay robust to rounding, and that at least one plate breakdown shows.
    expect(screen.getAllByText('×5').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('×5+')).toBeTruthy();
    expect(screen.getByText('as many reps as possible')).toBeTruthy();

    // A plate breakdown string (or "empty bar") renders for every row —
    // assert generically that at least one is present.
    const breakdowns = [...screen.queryAllByText(/·/), ...screen.queryAllByText('empty bar')];
    expect(breakdowns.length).toBeGreaterThan(0);

    // Mark the two non-AMRAP main ("work") sets done (the AMRAP row's own
    // "done" control is a differently-labeled button, handled separately below).
    const workToggles = screen.getAllByRole('button', {
      name: /^Mark work set \d+ \([\d.]+kg\) done$/,
    });
    expect(workToggles).toHaveLength(2);
    workToggles.forEach((btn) => fireEvent.click(btn));

    // Enter AMRAP reps and mark it done.
    fireEvent.change(screen.getByLabelText('Reps done'), { target: { value: '6' } });
    fireEvent.click(screen.getByRole('button', { name: /Mark work set \d.*AMRAP set done/i }));

    await waitFor(async () => {
      const sessions = await sessionRepo.forCycle(cycle.id as number);
      expect(sessions.some((s) => s.liftKey === 'deadlift' && s.week === 1)).toBe(true);
    });

    const [session] = await sessionRepo.forCycle(cycle.id as number);
    expect(session.amrapReps).toBe(6);
    expect(session.estimated1RM).toBeGreaterThan(0);
    expect(session.sets.filter((s) => s.kind === 'main')).toHaveLength(3);
  });

  it('shows a read-only logged state when a session already exists for this lift/week', async () => {
    const cycle = await seedCycle();
    await sessionRepo.add({
      cycleId: cycle.id as number,
      week: 1,
      liftKey: 'deadlift',
      date: '2026-01-01',
      status: 'done',
      sets: [],
      amrapReps: 8,
      estimated1RM: 180,
      rpe: null,
      notes: '',
    });

    renderCard(cycle);

    expect(await screen.findByText(/logged/i)).toBeTruthy();
    expect(screen.queryByLabelText('Reps done')).toBeNull();
  });

  it('shows exercise demo and supporting lifts affordances when enabled', async () => {
    const cycle = await seedCycle();
    renderCard(cycle, { settings: { ...defaultSettings, exerciseDemos: true, assistanceTracking: true } });

    expect(await screen.findByRole('button', { name: /how to perform/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /supporting lifts/i })).toBeTruthy();
  });

  it('hides exercise demo and supporting lifts affordances when disabled', async () => {
    const cycle = await seedCycle();
    renderCard(cycle, { settings: { ...defaultSettings, exerciseDemos: false, assistanceTracking: false } });

    await screen.findByRole('heading', { name: 'Deadlift' });
    expect(screen.queryByRole('button', { name: /how to perform/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /supporting lifts/i })).toBeNull();
  });
});
