import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { getExerciseDemo } from '../../domain';
import ExerciseDemo from './ExerciseDemo';

describe('ExerciseDemo', () => {
  it('is collapsed by default and reveals the demo when "How to perform" is clicked', () => {
    const demo = getExerciseDemo('deadlift');
    render(<ExerciseDemo liftKey="deadlift" />);

    // Collapsed: instructions aren't in the DOM yet.
    expect(screen.queryByText(demo.instructions[0])).toBeNull();

    const trigger = screen.getByRole('button', { name: /how to perform/i });
    expect(trigger.className).toMatch(/\bw-full\b/);
    fireEvent.click(trigger);

    expect(screen.getByText(demo.name)).toBeTruthy();
    expect(screen.getByAltText(/start/i)).toBeTruthy();
    expect(screen.getByAltText(/finish/i)).toBeTruthy();
    expect(screen.getByText(demo.instructions[0])).toBeTruthy();
  });
});
