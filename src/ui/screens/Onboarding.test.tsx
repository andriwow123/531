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
});
