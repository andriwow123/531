import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { db } from '../../data/db';
import { assistanceRepo, customExerciseRepo } from '../../data/repositories';
import AssistanceSection from './AssistanceSection';

const today = new Date().toISOString().slice(0, 10);

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('AssistanceSection', () => {
  it('shows catalog items for the selected category', async () => {
    render(<AssistanceSection />);

    await screen.findByRole('heading', { name: /assistance/i });

    fireEvent.click(screen.getByRole('button', { name: 'Pull' }));

    const select = screen.getByRole('combobox', { name: /exercise/i }) as HTMLSelectElement;
    const optionValues = Array.from(select.options).map((o) => o.value);
    expect(optionValues).toContain('Pull-ups');
  });

  it('adds a custom exercise, making it selectable and persisted', async () => {
    render(<AssistanceSection />);
    await screen.findByRole('heading', { name: /assistance/i });

    fireEvent.click(screen.getByRole('button', { name: 'Pull' }));

    const select = screen.getByRole('combobox', { name: /exercise/i }) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: '__add_custom__' } });

    const customInput = screen.getByLabelText(/custom exercise name/i);
    fireEvent.change(customInput, { target: { value: 'Meadows Row' } });
    fireEvent.click(screen.getByRole('button', { name: /add exercise/i }));

    await waitFor(async () => {
      const customs = await customExerciseRepo.all();
      expect(customs.some((c) => c.name === 'Meadows Row' && c.category === 'pull')).toBe(true);
    });

    await waitFor(() => {
      const selectAfter = screen.getByRole('combobox', { name: /exercise/i }) as HTMLSelectElement;
      expect(selectAfter.value).toBe('Meadows Row');
    });

    const optionValues = Array.from(
      (screen.getByRole('combobox', { name: /exercise/i }) as HTMLSelectElement).options,
    ).map((o) => o.value);
    expect(optionValues).toContain('Meadows Row');
  });

  it("logs an entry with sets x reps and shows it in today's list", async () => {
    render(<AssistanceSection />);
    await screen.findByRole('heading', { name: /assistance/i });

    fireEvent.click(screen.getByRole('button', { name: 'Pull' }));

    const select = screen.getByRole('combobox', { name: /exercise/i }) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'Pull-ups' } });

    fireEvent.change(screen.getByLabelText(/^sets$/i), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText(/^reps$/i), { target: { value: '10' } });

    fireEvent.click(screen.getByRole('button', { name: /^add$/i }));

    await waitFor(async () => expect(await assistanceRepo.forDate(today)).toHaveLength(1));

    const list = await screen.findByRole('list');
    expect(within(list).getByText(/pull-ups/i)).toBeTruthy();
    expect(within(list).getByText(/3\s*×\s*10/)).toBeTruthy();
  });

  it('ignores incomplete adds (no exercise selected, or sets/reps <= 0)', async () => {
    render(<AssistanceSection />);
    await screen.findByRole('heading', { name: /assistance/i });

    fireEvent.click(screen.getByRole('button', { name: 'Pull' }));
    // No exercise selected (placeholder), sets/reps empty.
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }));

    expect(await assistanceRepo.forDate(today)).toHaveLength(0);

    const select = screen.getByRole('combobox', { name: /exercise/i }) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'Pull-ups' } });
    fireEvent.change(screen.getByLabelText(/^sets$/i), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText(/^reps$/i), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }));

    expect(await assistanceRepo.forDate(today)).toHaveLength(0);
  });

  it('shows an empty state when no entries are logged today', async () => {
    render(<AssistanceSection />);
    await screen.findByRole('heading', { name: /assistance/i });

    expect(await screen.findByText(/no assistance/i)).toBeTruthy();
  });

  it('includes an optional weight in the logged entry and list display', async () => {
    render(<AssistanceSection />);
    await screen.findByRole('heading', { name: /assistance/i });

    fireEvent.click(screen.getByRole('button', { name: 'Push' }));
    const select = screen.getByRole('combobox', { name: /exercise/i }) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'Dips' } });
    fireEvent.change(screen.getByLabelText(/^sets$/i), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText(/^reps$/i), { target: { value: '8' } });
    fireEvent.change(screen.getByLabelText(/^weight/i), { target: { value: '20' } });
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }));

    await waitFor(async () => expect(await assistanceRepo.forDate(today)).toHaveLength(1));
    const [entry] = await assistanceRepo.forDate(today);
    expect(entry.weight).toBe(20);

    const list = await screen.findByRole('list');
    expect(within(list).getByText(/4\s*×\s*8/)).toBeTruthy();
    expect(within(list).getByText(/20/)).toBeTruthy();
  });
});
