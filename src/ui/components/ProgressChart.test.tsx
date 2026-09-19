import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ProgressChart from './ProgressChart';

const oneRm = [
  { date: '2026-01-01', weight: 100, reps: 5, est1RM: 116 },
  { date: '2026-02-01', weight: 100, reps: 6, est1RM: 120 },
];
const tm = [
  { cycleIndex: 1, startedAt: '2026-01-01', tm: 100 },
  { cycleIndex: 2, startedAt: '2026-02-01', tm: 102.5 },
];

describe('ProgressChart', () => {
  it('renders both toggle buttons with Est. 1RM active by default', () => {
    render(<ProgressChart unit="kg" oneRm={oneRm} tm={tm} />);
    const oneRmBtn = screen.getByRole('button', { name: /est\. 1rm/i });
    const tmBtn = screen.getByRole('button', { name: /training max/i });
    expect(oneRmBtn).toHaveAttribute('aria-pressed', 'true');
    expect(tmBtn).toHaveAttribute('aria-pressed', 'false');
  });

  it('toggles the headline metric', () => {
    render(
      <ProgressChart
        unit="kg"
        oneRm={[
          { date: '2026-01-01', weight: 100, reps: 5, est1RM: 116 },
          { date: '2026-02-01', weight: 100, reps: 6, est1RM: 120 },
        ]}
        tm={[
          { cycleIndex: 1, startedAt: '2026-01-01', tm: 100 },
          { cycleIndex: 2, startedAt: '2026-02-01', tm: 102.5 },
        ]}
      />
    );
    const tmBtn = screen.getByRole('button', { name: /training max/i });
    fireEvent.click(tmBtn);
    expect(tmBtn).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /est\. 1rm/i })).toHaveAttribute('aria-pressed', 'false');
  });

  it('renders gracefully with empty series (no crash)', () => {
    expect(() => render(<ProgressChart unit="kg" oneRm={[]} tm={[]} />)).not.toThrow();
    expect(screen.getByRole('button', { name: /est\. 1rm/i })).toBeInTheDocument();
  });

  it('renders gracefully with a single point in each series', () => {
    expect(() =>
      render(
        <ProgressChart
          unit="lb"
          oneRm={[{ date: '2026-01-01', weight: 200, reps: 5, est1RM: 230 }]}
          tm={[{ cycleIndex: 1, startedAt: '2026-01-01', tm: 200 }]}
        />
      )
    ).not.toThrow();
  });
});
