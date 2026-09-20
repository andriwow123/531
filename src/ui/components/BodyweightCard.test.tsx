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
});
