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
  it('creates lifts with 85% TM and an active cycle', async () => {
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
    expect(lifts.every((l) => l.trainingMax === 85)).toBe(true);
    expect(await cycleRepo.active()).toBeTruthy();
  });

  it('disables Start training and persists nothing when a 1RM is blank or negative', async () => {
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
