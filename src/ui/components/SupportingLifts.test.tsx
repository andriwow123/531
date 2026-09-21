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

  it('shows the Boring But Big row with a suggested weight/reps', async () => {
    renderExpanded();

    await screen.findByText('Boring But Big');
    const weightInput = screen.getByLabelText(/boring but big weight/i) as HTMLInputElement;
    const repsInput = screen.getByLabelText(/boring but big reps/i) as HTMLInputElement;
    expect(weightInput.placeholder).toBe('50');
    expect(repsInput.placeholder).toBe('10');
  });

  it('renders weight and reps inputs for a catalog exercise and for Boring But Big', async () => {
    renderExpanded();

    const pushSection = await screen.findByRole('region', { name: 'Push' });
    await within(pushSection).findByText('Dips');

    expect(within(pushSection).getByLabelText('Dips weight')).toBeTruthy();
    expect(within(pushSection).getByLabelText('Dips reps')).toBeTruthy();
    expect(screen.getByLabelText(/boring but big weight/i)).toBeTruthy();
    expect(screen.getByLabelText(/boring but big reps/i)).toBeTruthy();
  });

  it('logs weight and reps on blur, persisting per liftKey and marking the row done', async () => {
    renderExpanded();

    const pushSection = await screen.findByRole('region', { name: 'Push' });
    await within(pushSection).findByText('Dips');

    const weightInput = within(pushSection).getByLabelText('Dips weight');
    fireEvent.change(weightInput, { target: { value: '40' } });
    fireEvent.blur(weightInput);

    await waitFor(async () => {
      const done = await supportingDoneRepo.forDate(today);
      const row = done.find((d) => d.liftKey === 'press' && d.category === 'push' && d.name === 'Dips');
      expect(row?.weight).toBe(40);
    });

    const repsInput = within(pushSection).getByLabelText('Dips reps');
    fireEvent.change(repsInput, { target: { value: '12' } });
    fireEvent.blur(repsInput);

    await waitFor(async () => {
      const done = await supportingDoneRepo.forDate(today);
      const row = done.find((d) => d.liftKey === 'press' && d.category === 'push' && d.name === 'Dips');
      expect(row?.weight).toBe(40);
      expect(row?.reps).toBe(12);
    });

    await waitFor(() => {
      expect(
        (within(pushSection).getByRole('checkbox', { name: /mark dips done/i }) as HTMLInputElement).checked,
      ).toBe(true);
    });
  });

  it('does not create a row when blurring an untouched weight or reps input (tab-through, no typing)', async () => {
    renderExpanded();

    const pushSection = await screen.findByRole('region', { name: 'Push' });
    await within(pushSection).findByText('Dips');

    const weightInput = within(pushSection).getByLabelText('Dips weight');
    const repsInput = within(pushSection).getByLabelText('Dips reps');

    // Simulate checkbox -> weight -> reps -> next row tab navigation with no typing.
    fireEvent.blur(weightInput);
    fireEvent.blur(repsInput);

    const done = await supportingDoneRepo.forDate(today);
    expect(done.some((d) => d.liftKey === 'press' && d.category === 'push' && d.name === 'Dips')).toBe(false);
    expect(done).toHaveLength(0);

    expect(
      (within(pushSection).getByRole('checkbox', { name: /mark dips done/i }) as HTMLInputElement).checked,
    ).toBe(false);
  });

  it('clearing a previously-logged value updates the persisted row instead of leaving it stale', async () => {
    renderExpanded();

    const pushSection = await screen.findByRole('region', { name: 'Push' });
    await within(pushSection).findByText('Dips');

    const weightInput = within(pushSection).getByLabelText('Dips weight');
    fireEvent.change(weightInput, { target: { value: '40' } });
    fireEvent.blur(weightInput);

    await waitFor(async () => {
      const done = await supportingDoneRepo.forDate(today);
      const row = done.find((d) => d.liftKey === 'press' && d.category === 'push' && d.name === 'Dips');
      expect(row?.weight).toBe(40);
    });

    fireEvent.change(weightInput, { target: { value: '' } });
    fireEvent.blur(weightInput);

    await waitFor(async () => {
      const done = await supportingDoneRepo.forDate(today);
      const row = done.find((d) => d.liftKey === 'press' && d.category === 'push' && d.name === 'Dips');
      expect(row).toBeTruthy();
      expect(row?.weight).toBeNull();
    });
  });

  it('scopes weight/reps and done state per liftKey', async () => {
    render(<SupportingLifts liftKey="press" tm={100} unit="kg" roundingIncrement={5} />);
    fireEvent.click(screen.getAllByRole('button', { name: /supporting lifts/i })[0]);

    const pressPush = await screen.findByRole('region', { name: 'Push' });
    const pressWeight = within(pressPush).getByLabelText('Dips weight');
    fireEvent.change(pressWeight, { target: { value: '40' } });
    fireEvent.blur(pressWeight);

    await waitFor(async () => {
      const done = await supportingDoneRepo.forDate(today);
      expect(done.some((d) => d.liftKey === 'press' && d.name === 'Dips' && d.weight === 40)).toBe(true);
    });

    render(<SupportingLifts liftKey="bench" tm={100} unit="kg" roundingIncrement={5} />);
    const benchButtons = screen.getAllByRole('button', { name: /supporting lifts/i });
    fireEvent.click(benchButtons[benchButtons.length - 1]);

    const benchSections = await screen.findAllByRole('region', { name: 'Push' });
    const benchPush = benchSections[benchSections.length - 1];

    await within(benchPush).findByText('Dips');
    const benchWeightInput = within(benchPush).getByLabelText('Dips weight') as HTMLInputElement;
    const benchCheckbox = within(benchPush).getByRole('checkbox', { name: /mark dips done/i }) as HTMLInputElement;

    expect(benchWeightInput.value).toBe('');
    expect(benchCheckbox.checked).toBe(false);
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
