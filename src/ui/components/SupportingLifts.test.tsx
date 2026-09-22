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

    const trigger = screen.getByRole('button', { name: /supporting lifts/i });
    expect(trigger.className).toMatch(/\bw-full\b/);
    fireEvent.click(trigger);

    const pushSection = await screen.findByRole('region', { name: 'Push' });
    expect(within(pushSection).getByText('Dips')).toBeTruthy();
  });

  it('shows the two zone headings', async () => {
    renderExpanded();

    expect(await screen.findByText("Today's supporting work")).toBeTruthy();
    expect(screen.getByText('Add exercises')).toBeTruthy();
  });

  it('shows a long exercise name in full, not truncated', async () => {
    renderExpanded();

    const pushSection = await screen.findByRole('region', { name: 'Push' });
    const nameEl = await within(pushSection).findByText('Close-grip bench press');
    expect(nameEl.textContent).toBe('Close-grip bench press');
  });

  it('shows the Boring But Big row with a suggested weight/reps', async () => {
    renderExpanded();

    await screen.findByText('Boring But Big');
    const weightInput = screen.getByLabelText(/boring but big weight/i) as HTMLInputElement;
    const repsInput = screen.getByLabelText(/boring but big reps/i) as HTMLInputElement;
    expect(weightInput.placeholder).toBe('50');
    expect(repsInput.placeholder).toBe('10');
  });

  it('shows an empty-state message in Today when nothing besides BBB is selected', async () => {
    renderExpanded();

    await screen.findByText('Boring But Big');
    expect(screen.getByText(/pick exercises below to build today's list/i)).toBeTruthy();
  });

  it('renders weight and reps inputs for a selected exercise and for Boring But Big', async () => {
    await supportingDoneRepo.select(today, 'press', 'push', 'Dips');
    renderExpanded();

    await screen.findByLabelText('Dips weight');
    expect(screen.getByLabelText('Dips weight')).toBeTruthy();
    expect(screen.getByLabelText('Dips reps')).toBeTruthy();
    expect(screen.getByLabelText(/boring but big weight/i)).toBeTruthy();
    expect(screen.getByLabelText(/boring but big reps/i)).toBeTruthy();
  });

  it('logs weight and reps on blur for a selected exercise, persisting per liftKey (without marking it done)', async () => {
    await supportingDoneRepo.select(today, 'press', 'push', 'Dips');
    renderExpanded();

    const weightInput = await screen.findByLabelText('Dips weight');
    fireEvent.change(weightInput, { target: { value: '40' } });
    fireEvent.blur(weightInput);

    await waitFor(async () => {
      const done = await supportingDoneRepo.forDate(today);
      const row = done.find((d) => d.liftKey === 'press' && d.category === 'push' && d.name === 'Dips');
      expect(row?.weight).toBe(40);
    });

    const repsInput = screen.getByLabelText('Dips reps');
    fireEvent.change(repsInput, { target: { value: '12' } });
    fireEvent.blur(repsInput);

    await waitFor(async () => {
      const done = await supportingDoneRepo.forDate(today);
      const row = done.find((d) => d.liftKey === 'press' && d.category === 'push' && d.name === 'Dips');
      expect(row?.weight).toBe(40);
      expect(row?.reps).toBe(12);
    });

    // logging weight/reps alone never flips the done flag — only the checkmark does
    expect(
      (screen.getByRole('checkbox', { name: /mark dips done/i }) as HTMLInputElement).checked,
    ).toBe(false);
  });

  it('does not create a BBB row when blurring untouched weight or reps inputs (tab-through, no typing)', async () => {
    renderExpanded();
    await screen.findByText('Boring But Big');

    const weightInput = screen.getByLabelText(/boring but big weight/i);
    const repsInput = screen.getByLabelText(/boring but big reps/i);

    // Simulate tab navigation with no typing.
    fireEvent.blur(weightInput);
    fireEvent.blur(repsInput);

    const done = await supportingDoneRepo.forDate(today);
    expect(done.some((d) => d.liftKey === 'press' && d.name === 'Boring But Big')).toBe(false);

    expect(
      (screen.getByRole('checkbox', { name: /mark boring but big done/i }) as HTMLInputElement).checked,
    ).toBe(false);
  });

  it('clearing a previously-logged value updates the persisted row instead of leaving it stale', async () => {
    await supportingDoneRepo.select(today, 'press', 'push', 'Dips');
    renderExpanded();

    const weightInput = (await screen.findByLabelText('Dips weight')) as HTMLInputElement;
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

  it('scopes weight/reps and selection state per liftKey', async () => {
    await supportingDoneRepo.select(today, 'press', 'push', 'Dips');

    render(<SupportingLifts liftKey="press" tm={100} unit="kg" roundingIncrement={5} />);
    fireEvent.click(screen.getAllByRole('button', { name: /supporting lifts/i })[0]);

    const pressWeight = await screen.findByLabelText('Dips weight');
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

    // Dips is still unselected under bench: it's in bench's catalog, not bench's Today.
    await within(benchPush).findByText('Dips');
    expect(within(benchPush).getByRole('button', { name: /^Add Dips$/i })).toBeTruthy();
    expect(screen.queryAllByLabelText('Dips weight')).toHaveLength(1);
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

  it('the add-exercise form shows "Sets × reps (optional)"', async () => {
    renderExpanded();

    const pushSection = await screen.findByRole('region', { name: 'Push' });
    fireEvent.click(within(pushSection).getByRole('button', { name: /add exercise/i }));

    const schemeInput = within(pushSection).getByLabelText('Sets × reps (optional)') as HTMLInputElement;
    expect(schemeInput).toBeTruthy();
    expect(schemeInput.placeholder).toBe('e.g. 3 × 8–12');
  });

  it('shows a confirm step before removing a built-in exercise, without deleting it yet', async () => {
    renderExpanded();

    const pushSection = await screen.findByRole('region', { name: 'Push' });
    await within(pushSection).findByText('Dips');

    fireEvent.click(within(pushSection).getByRole('button', { name: /^Remove Dips from list$/i }));

    expect(within(pushSection).getByText('Dips')).toBeTruthy();
    expect(within(pushSection).getByRole('button', { name: /cancel/i })).toBeTruthy();
    expect(within(pushSection).getByRole('button', { name: /confirm remove dips/i })).toBeTruthy();

    const hidden = await hiddenSupportingRepo.all();
    expect(hidden.some((h) => h.category === 'push' && h.name === 'Dips')).toBe(false);
  });

  it('cancels the remove confirm, leaving the exercise in place', async () => {
    renderExpanded();

    const pushSection = await screen.findByRole('region', { name: 'Push' });
    await within(pushSection).findByText('Dips');

    fireEvent.click(within(pushSection).getByRole('button', { name: /^Remove Dips from list$/i }));
    fireEvent.click(within(pushSection).getByRole('button', { name: /cancel/i }));

    expect(within(pushSection).getByText('Dips')).toBeTruthy();
    expect(within(pushSection).queryByRole('button', { name: /cancel/i })).toBeNull();
    expect(within(pushSection).getByRole('button', { name: /^Remove Dips from list$/i })).toBeTruthy();

    const hidden = await hiddenSupportingRepo.all();
    expect(hidden.some((h) => h.category === 'push' && h.name === 'Dips')).toBe(false);
  });

  it('removes a built-in exercise after confirming, hiding it and persisting the hide', async () => {
    renderExpanded();

    const pushSection = await screen.findByRole('region', { name: 'Push' });
    await within(pushSection).findByText('Dips');

    fireEvent.click(within(pushSection).getByRole('button', { name: /^Remove Dips from list$/i }));
    fireEvent.click(within(pushSection).getByRole('button', { name: /confirm remove dips/i }));

    await waitFor(() => {
      expect(within(pushSection).queryByText('Dips')).toBeNull();
    });

    await waitFor(async () => {
      const hidden = await hiddenSupportingRepo.all();
      expect(hidden.some((h) => h.category === 'push' && h.name === 'Dips')).toBe(true);
    });
  });

  it('removes a custom exercise after confirming, deleting it via customExerciseRepo', async () => {
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

    fireEvent.click(within(pushSection).getByRole('button', { name: /^Remove JM Press from list$/i }));
    fireEvent.click(within(pushSection).getByRole('button', { name: /confirm remove jm press/i }));

    await waitFor(() => {
      expect(within(pushSection).queryByText('JM Press')).toBeNull();
    });

    await waitFor(async () => {
      const customs = await customExerciseRepo.all();
      expect(customs.some((c) => c.category === 'push' && c.name === 'JM Press')).toBe(false);
    });
  });

  it('picking a catalog exercise moves it into Today and pre-fills from the last logged entry', async () => {
    await supportingDoneRepo.select('2020-01-01', 'press', 'push', 'Dips', { weight: 30, reps: 12 }); // a prior day

    renderExpanded();
    const pushSection = await screen.findByRole('region', { name: 'Push' });
    await within(pushSection).findByText('Dips');

    fireEvent.click(within(pushSection).getByRole('button', { name: /^Add Dips$/i }));

    await waitFor(() => {
      expect(within(pushSection).queryByText('Dips')).toBeNull();
    });

    const weightInput = (await screen.findByLabelText('Dips weight')) as HTMLInputElement;
    expect(weightInput.value).toBe('30');
    const repsInput = screen.getByLabelText('Dips reps') as HTMLInputElement;
    expect(repsInput.value).toBe('12');
  });

  it('the Today checkmark marks done without removing the row', async () => {
    await supportingDoneRepo.select(today, 'press', 'push', 'Dips');
    renderExpanded();

    const checkbox = (await screen.findByRole('checkbox', { name: /mark dips done/i })) as HTMLInputElement;
    expect(checkbox.checked).toBe(false);

    fireEvent.click(checkbox);

    await waitFor(async () => {
      const done = await supportingDoneRepo.forDate(today);
      const row = done.find((d) => d.liftKey === 'press' && d.category === 'push' && d.name === 'Dips');
      expect(row?.done).toBe(true);
    });

    await waitFor(() => {
      expect(
        (screen.getByRole('checkbox', { name: /mark dips done/i }) as HTMLInputElement).checked,
      ).toBe(true);
    });

    // still present, not removed
    expect(screen.getByText('Dips')).toBeTruthy();
    expect(screen.getByLabelText('Dips weight')).toBeTruthy();
  });

  it('remove-from-today deselects the exercise (row gone, back in catalog)', async () => {
    await supportingDoneRepo.select(today, 'press', 'push', 'Dips');
    renderExpanded();

    await screen.findByLabelText('Dips weight');

    fireEvent.click(screen.getByRole('button', { name: /remove dips from today/i }));

    await waitFor(async () => {
      const done = await supportingDoneRepo.forDate(today);
      expect(done.some((d) => d.liftKey === 'press' && d.category === 'push' && d.name === 'Dips')).toBe(false);
    });

    await waitFor(() => {
      expect(screen.queryByLabelText('Dips weight')).toBeNull();
    });

    const pushSection = await screen.findByRole('region', { name: 'Push' });
    expect(within(pushSection).getByText('Dips')).toBeTruthy();
    expect(within(pushSection).getByRole('button', { name: /^Add Dips$/i })).toBeTruthy();
  });

  it('a legacy row with no `done` field reads as done (backward-compatible default)', async () => {
    // Bypass supportingDoneRepo's typed methods to simulate a pre-migration
    // row that predates the `done` flag entirely.
    await db.supportingDone.add({
      date: today,
      liftKey: 'press',
      category: 'push',
      name: 'Dips',
      weight: 20,
      reps: 10,
    } as any);

    renderExpanded();

    const checkbox = (await screen.findByRole('checkbox', { name: /mark dips done/i })) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
  });
});
