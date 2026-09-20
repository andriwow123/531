import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { db } from '../../data/db';
import { customExerciseRepo, hiddenSupportingRepo, supportingDoneRepo } from '../../data/repositories';
import SupportingLifts from './SupportingLifts';

const today = new Date().toISOString().slice(0, 10);

beforeEach(async () => {
  await db.delete();
  await db.open();
});

function renderExpanded() {
  render(<SupportingLifts liftKey="press" tm={100} unit="kg" roundingIncrement={5} />);
  fireEvent.click(screen.getByRole('button', { name: /supporting lifts/i }));
}

describe('SupportingLifts', () => {
  it('is collapsed by default and expands to show catalog items by category', async () => {
    render(<SupportingLifts liftKey="press" tm={100} unit="kg" roundingIncrement={5} />);

    expect(screen.queryByText('Dips')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /supporting lifts/i }));

    const pushSection = await screen.findByRole('region', { name: 'Push' });
    expect(within(pushSection).getByText('Dips')).toBeTruthy();
  });

  it('shows the Boring But Big row with computed weight', async () => {
    renderExpanded();

    await screen.findByText('Boring But Big');
    expect(screen.getByText(/5 × 10 @ 50 kg/)).toBeTruthy();
  });

  it('adds a custom exercise under a category, persisting it', async () => {
    renderExpanded();

    const pushSection = await screen.findByRole('region', { name: 'Push' });
    fireEvent.click(within(pushSection).getByRole('button', { name: /add exercise/i }));

    fireEvent.change(within(pushSection).getByLabelText(/exercise name/i), {
      target: { value: 'JM Press' },
    });
    fireEvent.click(within(pushSection).getByRole('button', { name: /^add$/i }));

    await waitFor(() => {
      expect(within(pushSection).getByText('JM Press')).toBeTruthy();
    });

    await waitFor(async () => {
      const customs = await customExerciseRepo.all();
      expect(customs.some((c) => c.category === 'push' && c.name === 'JM Press')).toBe(true);
    });
  });

  it('removes a built-in exercise, hiding it and persisting the hide', async () => {
    renderExpanded();

    const pushSection = await screen.findByRole('region', { name: 'Push' });
    await within(pushSection).findByText('Dips');

    fireEvent.click(within(pushSection).getByRole('button', { name: /remove dips/i }));

    await waitFor(() => {
      expect(within(pushSection).queryByText('Dips')).toBeNull();
    });

    await waitFor(async () => {
      const hidden = await hiddenSupportingRepo.all();
      expect(hidden.some((h) => h.category === 'push' && h.name === 'Dips')).toBe(true);
    });
  });

  it('toggles an item done, persisting and clearing via supportingDoneRepo', async () => {
    renderExpanded();

    const pushSection = await screen.findByRole('region', { name: 'Push' });
    const checkbox = within(pushSection).getByRole('checkbox', { name: /mark dips done/i });

    fireEvent.click(checkbox);

    await waitFor(async () => {
      const done = await supportingDoneRepo.forDate(today);
      expect(done.some((d) => d.category === 'push' && d.name === 'Dips')).toBe(true);
    });

    await waitFor(() => {
      expect(
        (within(pushSection).getByRole('checkbox', { name: /mark dips done/i }) as HTMLInputElement).checked,
      ).toBe(true);
    });

    fireEvent.click(within(pushSection).getByRole('checkbox', { name: /mark dips done/i }));

    await waitFor(async () => {
      const done = await supportingDoneRepo.forDate(today);
      expect(done.some((d) => d.category === 'push' && d.name === 'Dips')).toBe(false);
    });
  });
});
