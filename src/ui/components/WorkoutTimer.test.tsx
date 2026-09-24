import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { db } from '../../data/db';
import { workoutDayRepo } from '../../data/repositories';
import WorkoutTimer from './WorkoutTimer';

const at = (h: number, m: number, day = 24) => new Date(2026, 8, day, h, m);

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('WorkoutTimer', () => {
  it('not started: Start workout begins the timer and stores startedAt', async () => {
    const clock = at(18, 0);
    render(<WorkoutTimer cycleId={1} week={1} liftKey="press" now={() => clock} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Start workout' }));

    expect(await screen.findByRole('button', { name: 'End workout' })).toBeTruthy();
    await waitFor(async () => {
      const day = await workoutDayRepo.get(1, 1, 'press');
      expect(day?.startedAt).toBe(clock.toISOString());
    });
  });

  it('running: End workout stops the timer and shows/stores the duration', async () => {
    await workoutDayRepo.setTimes(1, 1, 'press', { startedAt: at(18, 0).toISOString(), endedAt: null });
    const clock = at(18, 52);
    render(<WorkoutTimer cycleId={1} week={1} liftKey="press" now={() => clock} />);

    fireEvent.click(await screen.findByRole('button', { name: 'End workout' }));

    expect(await screen.findByText(/52 min/)).toBeTruthy();
    await waitFor(async () => {
      const day = await workoutDayRepo.get(1, 1, 'press');
      expect(day?.endedAt).toBe(clock.toISOString());
    });
  });

  it('left running (>3h): "forgot to end it?" prompt -> Set finish time -> prefilled guess -> Save -> ends with that time', async () => {
    await workoutDayRepo.setTimes(1, 1, 'press', { startedAt: at(18, 0).toISOString(), endedAt: null });
    const clock = at(22, 30);
    render(<WorkoutTimer cycleId={1} week={1} liftKey="press" now={() => clock} />);

    expect(await screen.findByText(/forgot to end it\?/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Set finish time' }));

    const input = screen.getByLabelText('Finish time') as HTMLInputElement;
    expect(input.value).toBe('19:00');

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText(/1 h\b/)).toBeTruthy();
    await waitFor(async () => {
      const day = await workoutDayRepo.get(1, 1, 'press');
      expect(day?.endedAt).toBe(at(19, 0).toISOString());
    });
  });

  it('prefills the finish time from sessionSavedAt when it is after the start', async () => {
    await workoutDayRepo.setTimes(1, 1, 'press', { startedAt: at(18, 0).toISOString(), endedAt: null });
    const clock = at(22, 30);
    render(
      <WorkoutTimer
        cycleId={1}
        week={1}
        liftKey="press"
        sessionSavedAt={at(18, 50).toISOString()}
        now={() => clock}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Set finish time' }));
    const input = screen.getByLabelText('Finish time') as HTMLInputElement;
    expect(input.value).toBe('18:50');
  });

  it('rejects a finish time that is not between the start and now, and stores nothing', async () => {
    await workoutDayRepo.setTimes(1, 1, 'press', { startedAt: at(18, 0).toISOString(), endedAt: null });
    const clock = at(18, 30);
    render(<WorkoutTimer cycleId={1} week={1} liftKey="press" now={() => clock} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Forgot to end it?' }));
    const input = screen.getByLabelText('Finish time') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '19:30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('Pick a time between your start and now.');

    const day = await workoutDayRepo.get(1, 1, 'press');
    expect(day?.endedAt).toBeNull();
  });

  it('ended: Edit changes the stored times, and Reset timer clears them', async () => {
    await workoutDayRepo.setTimes(1, 1, 'press', {
      startedAt: at(18, 0).toISOString(),
      endedAt: at(18, 52).toISOString(),
    });
    const clock = at(20, 0);
    render(<WorkoutTimer cycleId={1} week={1} liftKey="press" now={() => clock} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    const endInput = screen.getByLabelText('End time') as HTMLInputElement;
    fireEvent.change(endInput, { target: { value: '19:10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText(/1 h 10 min/)).toBeTruthy();
    await waitFor(async () => {
      const day = await workoutDayRepo.get(1, 1, 'press');
      expect(day?.endedAt).toBe(at(19, 10).toISOString());
    });

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset timer' }));

    expect(await screen.findByRole('button', { name: 'Start workout' })).toBeTruthy();
    const day = await workoutDayRepo.get(1, 1, 'press');
    expect(day?.startedAt).toBeNull();
    expect(day?.endedAt).toBeNull();
  });

  it('shows the normal running view (not the forgotten prompt) at exactly 2h elapsed', async () => {
    await workoutDayRepo.setTimes(1, 1, 'press', { startedAt: at(18, 0).toISOString(), endedAt: null });
    const clock = at(20, 0);
    render(<WorkoutTimer cycleId={1} week={1} liftKey="press" now={() => clock} />);

    expect(await screen.findByText(/2:00:00/)).toBeTruthy();
    // The emphasized "left running" prompt (distinct from the normal view's
    // own "Forgot to end it?" button) must not appear before 3h.
    expect(screen.queryByText(/still running since/i)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Set finish time' })).toBeNull();
  });

  it('renders nothing until the initial load completes', async () => {
    const clock = at(18, 0);
    const { container } = render(<WorkoutTimer cycleId={1} week={1} liftKey="press" now={() => clock} />);

    // Immediately after the synchronous render, the async repo load hasn't
    // resolved yet, so nothing should be in the DOM.
    expect(container).toBeEmptyDOMElement();

    expect(await screen.findByRole('button', { name: 'Start workout' })).toBeTruthy();
  });

  // Home keeps every LiftCard (and its WorkoutTimer) mounted and just changes
  // the `week` prop when the user taps a week tab — the timer never remounts.
  // These guard against a stale in-flight write/read for the day you just
  // left leaking into the day you switched to (display or the stored row).
  describe('switching days mid-write', () => {
    it('does not show a leaked running timer from the day you switched away from', async () => {
      const clock = at(18, 0);
      const { rerender } = render(<WorkoutTimer cycleId={1} week={1} liftKey="press" now={() => clock} />);

      fireEvent.click(await screen.findByRole('button', { name: 'Start workout' }));
      // Switch weeks immediately — before the week-1 write settles (no await).
      rerender(<WorkoutTimer cycleId={1} week={2} liftKey="press" now={() => clock} />);

      // Once week 1's write has landed in the DB, its (possibly stale)
      // continuation has also already run — so the DOM state checked below
      // is final, not a transient mid-race snapshot.
      await waitFor(async () => {
        const week1Day = await workoutDayRepo.get(1, 1, 'press');
        expect(week1Day?.startedAt).toBe(clock.toISOString());
      });

      expect(await screen.findByRole('button', { name: 'Start workout' })).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'End workout' })).toBeNull();
      expect(await workoutDayRepo.get(1, 2, 'press')).toBeUndefined();
    });

    it('starting the new day after such a switch writes its own row and leaves the old one untouched', async () => {
      let clock = at(18, 0);
      const { rerender } = render(<WorkoutTimer cycleId={1} week={1} liftKey="press" now={() => clock} />);

      fireEvent.click(await screen.findByRole('button', { name: 'Start workout' }));
      rerender(<WorkoutTimer cycleId={1} week={2} liftKey="press" now={() => clock} />);

      await waitFor(async () => {
        const week1Day = await workoutDayRepo.get(1, 1, 'press');
        expect(week1Day?.startedAt).toBe(clock.toISOString());
      });

      clock = at(18, 5);
      fireEvent.click(await screen.findByRole('button', { name: 'Start workout' }));

      await waitFor(async () => {
        const week2Day = await workoutDayRepo.get(1, 2, 'press');
        expect(week2Day?.startedAt).toBe(clock.toISOString());
      });

      const week1Day = await workoutDayRepo.get(1, 1, 'press');
      expect(week1Day?.startedAt).toBe(at(18, 0).toISOString());
      expect(week1Day?.endedAt).toBeNull();
    });

    it('leaves edit mode (and its inputs/errors) behind when switching to a different day', async () => {
      await workoutDayRepo.setTimes(1, 1, 'press', {
        startedAt: at(18, 0).toISOString(),
        endedAt: at(18, 52).toISOString(),
      });
      const clock = at(20, 0);
      const { rerender } = render(<WorkoutTimer cycleId={1} week={1} liftKey="press" now={() => clock} />);

      fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
      expect(screen.getByLabelText('Start time')).toBeTruthy();

      rerender(<WorkoutTimer cycleId={1} week={2} liftKey="press" now={() => clock} />);

      expect(await screen.findByRole('button', { name: 'Start workout' })).toBeTruthy();
      expect(screen.queryByLabelText('Start time')).toBeNull();
      expect(screen.queryByLabelText('End time')).toBeNull();
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });
});
