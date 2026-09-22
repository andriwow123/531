import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { db } from '../../data/db';
import { supportingDoneRepo } from '../../data/repositories';
import SupportingHistory from './SupportingHistory';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('SupportingHistory', () => {
  it('renders each logged supporting exercise with its recent weight×reps', async () => {
    await supportingDoneRepo.select('2026-03-03', 'press', 'push', 'Dips', { weight: 30, reps: 8 });
    await supportingDoneRepo.select('2026-03-01', 'press', 'push', 'Dips', { weight: 25, reps: 10 });

    render(<SupportingHistory />);

    const heading = await screen.findByText('Dips');
    const card = heading.closest('li') as HTMLElement;
    const entryRows = within(card).getAllByRole('listitem');

    expect(entryRows).toHaveLength(2);
    // Most recent (Mar 3) entry first.
    expect(entryRows[0].textContent).toMatch(/2026-03-03/);
    expect(entryRows[0].textContent).toMatch(/30/);
    expect(entryRows[0].textContent).toMatch(/8/);
    expect(entryRows[1].textContent).toMatch(/2026-03-01/);
    expect(entryRows[1].textContent).toMatch(/25/);
    expect(entryRows[1].textContent).toMatch(/10/);
  });

  it('shows an empty state when nothing is logged', async () => {
    render(<SupportingHistory />);

    expect(await screen.findByText(/log supporting exercises/i)).toBeTruthy();
  });
});
