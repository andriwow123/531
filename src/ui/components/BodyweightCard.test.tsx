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

  it('tapping an entry row opens the editor below it, prefilled with the current weight', async () => {
    await profileRepo.save({ id: 'me', units: 'kg', roundingIncrement: 2.5, tmPercent: 0.85 });
    await bodyweightRepo.add({ date: '2026-01-01', weight: 84 });

    render(<BodyweightCard />);
    await screen.findAllByRole('listitem');

    const row = screen.getByRole('button', { name: /Jan 1/ });
    expect(row).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByLabelText('Weight for Jan 1')).toBeNull();

    fireEvent.click(row);

    expect(row).toHaveAttribute('aria-expanded', 'true');
    const editInput = screen.getByLabelText('Weight for Jan 1') as HTMLInputElement;
    expect(editInput.value).toBe('84');
  });

  it('tapping the open row again closes the editor', async () => {
    await profileRepo.save({ id: 'me', units: 'kg', roundingIncrement: 2.5, tmPercent: 0.85 });
    await bodyweightRepo.add({ date: '2026-01-01', weight: 84 });

    render(<BodyweightCard />);
    await screen.findAllByRole('listitem');

    const row = screen.getByRole('button', { name: /Jan 1/ });
    fireEvent.click(row);
    expect(screen.getByLabelText('Weight for Jan 1')).toBeTruthy();

    fireEvent.click(row);

    expect(row).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByLabelText('Weight for Jan 1')).toBeNull();
  });

  it('editing the weight and saving persists the new value and closes the editor', async () => {
    await profileRepo.save({ id: 'me', units: 'kg', roundingIncrement: 2.5, tmPercent: 0.85 });
    const id = await bodyweightRepo.add({ date: '2026-01-01', weight: 84 });

    render(<BodyweightCard />);
    await screen.findAllByRole('listitem');

    fireEvent.click(screen.getByRole('button', { name: /Jan 1/ }));
    const editInput = screen.getByLabelText('Weight for Jan 1') as HTMLInputElement;
    fireEvent.change(editInput, { target: { value: '83,5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(async () => {
      const all = await bodyweightRepo.all();
      expect(all.find((entry) => entry.id === id)?.weight).toBe(83.5);
    });
    expect(screen.queryByLabelText('Weight for Jan 1')).toBeNull();
    const rows = screen.getAllByRole('listitem');
    expect(rows[0].textContent).toMatch(/83\.5/);
  });

  it('disables Save when the entered weight is not a valid positive number', async () => {
    await profileRepo.save({ id: 'me', units: 'kg', roundingIncrement: 2.5, tmPercent: 0.85 });
    await bodyweightRepo.add({ date: '2026-01-01', weight: 84 });

    render(<BodyweightCard />);
    await screen.findAllByRole('listitem');

    fireEvent.click(screen.getByRole('button', { name: /Jan 1/ }));
    const editInput = screen.getByLabelText('Weight for Jan 1') as HTMLInputElement;

    fireEvent.change(editInput, { target: { value: '0' } });
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

    fireEvent.change(editInput, { target: { value: '' } });
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

    fireEvent.change(editInput, { target: { value: '85' } });
    expect(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled();
  });

  it('cancels an edit without persisting a change, closing the editor', async () => {
    await profileRepo.save({ id: 'me', units: 'kg', roundingIncrement: 2.5, tmPercent: 0.85 });
    await bodyweightRepo.add({ date: '2026-01-01', weight: 84 });

    render(<BodyweightCard />);
    await screen.findAllByRole('listitem');

    fireEvent.click(screen.getByRole('button', { name: /Jan 1/ }));
    const editInput = screen.getByLabelText('Weight for Jan 1') as HTMLInputElement;
    fireEvent.change(editInput, { target: { value: '999' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByLabelText('Weight for Jan 1')).toBeNull();
    expect((await bodyweightRepo.all())[0].weight).toBe(84);
  });

  it('"Delete entry" asks for confirmation, then Delete removes the entry', async () => {
    await profileRepo.save({ id: 'me', units: 'kg', roundingIncrement: 2.5, tmPercent: 0.85 });
    const id = await bodyweightRepo.add({ date: '2026-01-01', weight: 84 });

    render(<BodyweightCard />);
    await screen.findAllByRole('listitem');

    fireEvent.click(screen.getByRole('button', { name: /Jan 1/ }));
    expect(screen.queryByText('Delete this entry?')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Delete entry' }));

    expect(screen.getByText('Delete this entry?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm delete 2026-01-01 entry' }));

    await waitFor(async () => {
      const all = await bodyweightRepo.all();
      expect(all.find((entry) => entry.id === id)).toBeUndefined();
    });
    expect(await screen.findByText('Log your bodyweight to see the trend.')).toBeTruthy();
  });

  it('tapping the row header while confirming delete fully closes the editor', async () => {
    await profileRepo.save({ id: 'me', units: 'kg', roundingIncrement: 2.5, tmPercent: 0.85 });
    const id = await bodyweightRepo.add({ date: '2026-01-01', weight: 84 });

    render(<BodyweightCard />);
    await screen.findAllByRole('listitem');

    const row = screen.getByRole('button', { name: /Jan 1/ });
    fireEvent.click(row);
    fireEvent.click(screen.getByRole('button', { name: 'Delete entry' }));
    expect(screen.getByText('Delete this entry?')).toBeTruthy();

    fireEvent.click(row);

    expect(row).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Delete this entry?')).toBeNull();
    expect(screen.queryByLabelText('Weight for Jan 1')).toBeNull();
    expect((await bodyweightRepo.all()).find((entry) => entry.id === id)?.weight).toBe(84);
  });

  it('opening a second row closes the first', async () => {
    await profileRepo.save({ id: 'me', units: 'kg', roundingIncrement: 2.5, tmPercent: 0.85 });
    await bodyweightRepo.add({ date: '2026-01-01', weight: 84 });
    await bodyweightRepo.add({ date: '2026-02-01', weight: 82.5 });

    render(<BodyweightCard />);
    await screen.findAllByRole('listitem');

    fireEvent.click(screen.getByRole('button', { name: /Jan 1/ }));
    expect(screen.getByLabelText('Weight for Jan 1')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Feb 1/ }));

    expect(screen.queryByLabelText('Weight for Jan 1')).toBeNull();
    expect(screen.getByLabelText('Weight for Feb 1')).toBeTruthy();
  });
});
