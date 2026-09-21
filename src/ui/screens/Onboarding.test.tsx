import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { db } from '../../data/db';
import { liftRepo, cycleRepo } from '../../data/repositories';
import Onboarding from './Onboarding';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('Onboarding', () => {
  it('saves the entered training max directly (no 85% reduction) and creates an active cycle', async () => {
    render(
      <MemoryRouter>
        <Onboarding />
      </MemoryRouter>,
    );
    for (const key of ['press', 'bench', 'squat', 'deadlift']) {
      fireEvent.change(screen.getByLabelText(new RegExp(key, 'i')), { target: { value: '100' } });
    }
    fireEvent.click(screen.getByRole('button', { name: /start/i }));
    // allow async persistence
    await new Promise((r) => setTimeout(r, 0));
    const lifts = await liftRepo.all();
    expect(lifts).toHaveLength(4);
    expect(lifts.every((l) => l.trainingMax === 100)).toBe(true);
    const cycle = await cycleRepo.active();
    expect(cycle).toBeTruthy();
    expect(cycle?.tm.press).toBe(100);
    expect(cycle?.tm.bench).toBe(100);
    expect(cycle?.tm.squat).toBe(100);
    expect(cycle?.tm.deadlift).toBe(100);
  });

  it('accepts a comma decimal separator for the training max', async () => {
    render(
      <MemoryRouter>
        <Onboarding />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText(/press/i), { target: { value: '100,5' } });
    fireEvent.change(screen.getByLabelText(/bench/i), { target: { value: '100' } });
    fireEvent.change(screen.getByLabelText(/squat/i), { target: { value: '100' } });
    fireEvent.change(screen.getByLabelText(/deadlift/i), { target: { value: '100' } });

    const startButton = screen.getByRole('button', { name: /start/i });
    expect(startButton).not.toBeDisabled();

    fireEvent.click(startButton);
    await new Promise((r) => setTimeout(r, 0));

    const lifts = await liftRepo.all();
    const press = lifts.find((l) => l.key === 'press');
    // 100.5 rounded to the kg increment (2.5) resolves to 100.
    expect(press?.trainingMax).toBe(100);
  });

  it('disables Start training and persists nothing when a training max is blank or negative', async () => {
    render(
      <MemoryRouter>
        <Onboarding />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText(/press/i), { target: { value: '100' } });
    fireEvent.change(screen.getByLabelText(/bench/i), { target: { value: '100' } });
    fireEvent.change(screen.getByLabelText(/squat/i), { target: { value: '-10' } });
    fireEvent.change(screen.getByLabelText(/deadlift/i), { target: { value: '' } });

    const startButton = screen.getByRole('button', { name: /start/i });
    expect(startButton).toBeDisabled();

    fireEvent.click(startButton);
    await new Promise((r) => setTimeout(r, 0));

    expect(await liftRepo.all()).toHaveLength(0);
    expect(await cycleRepo.active()).toBeFalsy();
  });
});
