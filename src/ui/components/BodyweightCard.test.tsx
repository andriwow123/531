import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { db } from '../../data/db';
import { bodyweightRepo, profileRepo } from '../../data/repositories';
import BodyweightCard from './BodyweightCard';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('BodyweightCard', () => {
  it('shows the empty state and "—" latest weight with no entries', async () => {
    await profileRepo.save({ id: 'me', units: 'kg', roundingIncrement: 2.5, tmPercent: 0.85 });

    render(<BodyweightCard />);

    expect(await screen.findByText('Log your bodyweight to see the trend.')).toBeTruthy();
    expect(screen.getByText(/—/)).toBeTruthy();
  });

  it('logs a new weight, persists it, and shows it as the latest', async () => {
    await profileRepo.save({ id: 'me', units: 'kg', roundingIncrement: 2.5, tmPercent: 0.85 });

    render(<BodyweightCard />);
    await screen.findByText('Log your bodyweight to see the trend.');

    const input = screen.getByLabelText(/log today/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '82.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log' }));

    await waitFor(async () => expect(await bodyweightRepo.all()).toHaveLength(1));
    expect(await screen.findByText(/82\.5\s?kg/)).toBeTruthy();
    expect(input.value).toBe('');
  });

  it('accepts a comma decimal separator (e.g. "80,5")', async () => {
    await profileRepo.save({ id: 'me', units: 'kg', roundingIncrement: 2.5, tmPercent: 0.85 });

    render(<BodyweightCard />);
    await screen.findByText('Log your bodyweight to see the trend.');

    const input = screen.getByLabelText(/log today/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '80,5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log' }));

    await waitFor(async () => expect(await bodyweightRepo.all()).toHaveLength(1));
    expect((await bodyweightRepo.all())[0].weight).toBe(80.5);
  });

  it('ignores empty and non-positive input (no write)', async () => {
    await profileRepo.save({ id: 'me', units: 'kg', roundingIncrement: 2.5, tmPercent: 0.85 });

    render(<BodyweightCard />);
    await screen.findByText('Log your bodyweight to see the trend.');

    const input = screen.getByLabelText(/log today/i) as HTMLInputElement;
    const logButton = screen.getByRole('button', { name: 'Log' });

    fireEvent.click(logButton); // empty input

    fireEvent.change(input, { target: { value: '0' } });
    fireEvent.click(logButton);

    fireEvent.change(input, { target: { value: '-5' } });
    fireEvent.click(logButton);

    expect(await bodyweightRepo.all()).toHaveLength(0);
    expect(screen.getByText('Log your bodyweight to see the trend.')).toBeTruthy();
    expect(screen.getByText(/—/)).toBeTruthy();
  });

  it('shows the unit-labeled latest weight and renders the trend chart with existing entries', async () => {
    await profileRepo.save({ id: 'me', units: 'lb', roundingIncrement: 5, tmPercent: 0.85 });
    await bodyweightRepo.add({ date: '2026-01-01', weight: 180 });
    await bodyweightRepo.add({ date: '2026-02-01', weight: 178 });

    render(<BodyweightCard />);

    expect(await screen.findByText(/178\s?lb/)).toBeTruthy();
    expect(screen.queryByText('Log your bodyweight to see the trend.')).toBeNull();
  });

  it('renders a most-recent-first table of all entries', async () => {
    await profileRepo.save({ id: 'me', units: 'kg', roundingIncrement: 2.5, tmPercent: 0.85 });
    await bodyweightRepo.add({ date: '2026-01-01', weight: 84 });
    await bodyweightRepo.add({ date: '2026-02-01', weight: 82.5 });

    render(<BodyweightCard />);

    const rows = await screen.findAllByRole('listitem');
    expect(rows).toHaveLength(2);
    // Most recent (Feb) entry first.
    expect(rows[0].textContent).toMatch(/Feb 1/);
    expect(rows[0].textContent).toMatch(/82\.5/);
    expect(rows[1].textContent).toMatch(/Jan 1/);
    expect(rows[1].textContent).toMatch(/84/);
  });

  it('edits an entry weight inline and persists it', async () => {
    await profileRepo.save({ id: 'me', units: 'kg', roundingIncrement: 2.5, tmPercent: 0.85 });
    const id = await bodyweightRepo.add({ date: '2026-01-01', weight: 84 });

    render(<BodyweightCard />);
    await screen.findAllByRole('listitem');

    fireEvent.click(screen.getByRole('button', { name: 'Edit 2026-01-01 weight' }));

    const editInput = screen.getByLabelText('Edit 2026-01-01 weight') as HTMLInputElement;
    expect(editInput.value).toBe('84');
    fireEvent.change(editInput, { target: { value: '85,5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(async () => {
      const all = await bodyweightRepo.all();
      expect(all.find((entry) => entry.id === id)?.weight).toBe(85.5);
    });
    const rows = screen.getAllByRole('listitem');
    expect(rows[0].textContent).toMatch(/85\.5/);
  });

  it('cancels an inline edit without persisting a change', async () => {
    await profileRepo.save({ id: 'me', units: 'kg', roundingIncrement: 2.5, tmPercent: 0.85 });
    await bodyweightRepo.add({ date: '2026-01-01', weight: 84 });

    render(<BodyweightCard />);
    await screen.findAllByRole('listitem');

    fireEvent.click(screen.getByRole('button', { name: 'Edit 2026-01-01 weight' }));
    const editInput = screen.getByLabelText('Edit 2026-01-01 weight') as HTMLInputElement;
    fireEvent.change(editInput, { target: { value: '999' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Edit 2026-01-01 weight' })).toBeTruthy();
    expect((await bodyweightRepo.all())[0].weight).toBe(84);
  });

  it('deletes an entry after inline confirmation', async () => {
    await profileRepo.save({ id: 'me', units: 'kg', roundingIncrement: 2.5, tmPercent: 0.85 });
    const id = await bodyweightRepo.add({ date: '2026-01-01', weight: 84 });

    render(<BodyweightCard />);
    await screen.findAllByRole('listitem');

    fireEvent.click(screen.getByRole('button', { name: 'Delete 2026-01-01 entry' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm delete 2026-01-01 entry' }));

    await waitFor(async () => {
      const all = await bodyweightRepo.all();
      expect(all.find((entry) => entry.id === id)).toBeUndefined();
    });
    expect(await screen.findByText('Log your bodyweight to see the trend.')).toBeTruthy();
  });
});
