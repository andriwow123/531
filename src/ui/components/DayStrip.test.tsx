import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import DayStrip from './DayStrip';

const LIFTS = [
  { key: 'press' as const, label: 'Press' },
  { key: 'bench' as const, label: 'Bench' },
  { key: 'squat' as const, label: 'Squat' },
  { key: 'deadlift' as const, label: 'Deadlift' },
];

describe('DayStrip', () => {
  it('renders 4 labelled day buttons', () => {
    render(<DayStrip lifts={LIFTS} activeDay={0} doneKeys={new Set()} onSelect={() => {}} />);

    for (const label of ['Press', 'Bench', 'Squat', 'Deadlift']) {
      expect(screen.getByRole('button', { name: new RegExp(label) })).toBeTruthy();
    }
  });

  it('marks the activeDay button with aria-current, not the others', () => {
    render(<DayStrip lifts={LIFTS} activeDay={2} doneKeys={new Set()} onSelect={() => {}} />);

    const squatButton = screen.getByRole('button', { name: /Squat/ });
    expect(squatButton.getAttribute('aria-current')).toBe('true');

    for (const label of ['Press', 'Bench', 'Deadlift']) {
      const button = screen.getByRole('button', { name: new RegExp(label) });
      expect(button.getAttribute('aria-current')).toBeNull();
    }
  });

  it('calls onSelect with the clicked day index', () => {
    const onSelect = vi.fn();
    render(<DayStrip lifts={LIFTS} activeDay={0} doneKeys={new Set()} onSelect={onSelect} />);

    screen.getByRole('button', { name: /Deadlift/ }).click();

    expect(onSelect).toHaveBeenCalledWith(3);
  });

  it('shows a done marker only on buttons in doneKeys', () => {
    render(
      <DayStrip
        lifts={LIFTS}
        activeDay={0}
        doneKeys={new Set(['bench'])}
        onSelect={() => {}}
      />,
    );

    const benchButton = screen.getByRole('button', { name: /Bench/ });
    expect(within(benchButton).getByLabelText('done')).toBeTruthy();

    const pressButton = screen.getByRole('button', { name: /Press/ });
    expect(within(pressButton).queryByLabelText('done')).toBeNull();
  });
});
