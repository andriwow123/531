import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { db } from '../../data/db';
import { cycleRepo, sessionRepo } from '../../data/repositories';
import type { Cycle } from '../../data/repositories';
import { defaultSettings } from '../../settings/schema';
import { SettingsProvider } from '../settings/SettingsContext';
import LiftCard from './LiftCard';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

async function seedCycle(): Promise<Cycle> {
  const id = await cycleRepo.add({
    index: 1,
    startedAt: '2026-01-01',
    status: 'active',
    template: 'base',
    fivesPro: false,
    tm: { press: 100, bench: 100, squat: 150, deadlift: 140 },
  });
  const cycle = (await cycleRepo.active()) as Cycle;
  return { ...cycle, id };
}

function renderCard(cycle: Cycle, overrides: Partial<Parameters<typeof LiftCard>[0]> = {}) {
  return render(
    <SettingsProvider>
      <LiftCard
        liftKey="deadlift"
        week={1}
        cycle={cycle}
        unit="kg"
        roundingIncrement={2.5}
        dayNumber={2}
        settings={defaultSettings}
        {...overrides}
      />
    </SettingsProvider>,
  );
}

describe('LiftCard', () => {
  it('renders header, work weights/reps, and a plate breakdown; logs a session once all main sets are done', async () => {
    const cycle = await seedCycle();
    renderCard(cycle);

    // Header: lift name, day number, training max.
    expect(await screen.findByRole('heading', { name: 'Deadlift' })).toBeTruthy();
    expect(screen.getByText('Day 2')).toBeTruthy();
    expect(screen.getByText(/training max/i)).toBeTruthy();
    expect(screen.getByText('140 kg')).toBeTruthy();

    // Week 1 main sets for TM 140, roundingIncrement 2.5: 65% -> 90(?), 75% ->
    // 105, 85% -> 119(AMRAP). Assert reps markers instead of exact weights to
    // stay robust to rounding, and that at least one plate breakdown shows.
    expect(screen.getAllByText('×5').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('×5+')).toBeTruthy();
    expect(screen.getByText('as many reps as possible')).toBeTruthy();

    // A plate breakdown string (or "empty bar") renders for every row —
    // assert generically that at least one is present.
    const breakdowns = [...screen.queryAllByText(/·/), ...screen.queryAllByText('empty bar')];
    expect(breakdowns.length).toBeGreaterThan(0);

    // Mark the two non-AMRAP main ("work") sets done (the AMRAP row's own
    // "done" control is a differently-labeled button, handled separately below).
    const workToggles = screen.getAllByRole('button', {
      name: /^Mark work set \d+ \([\d.]+kg\) done$/,
    });
    expect(workToggles).toHaveLength(2);
    workToggles.forEach((btn) => fireEvent.click(btn));

    // Enter AMRAP reps and mark it done.
    fireEvent.change(screen.getByLabelText('Reps done'), { target: { value: '6' } });
    fireEvent.click(screen.getByRole('button', { name: /Mark work set \d.*AMRAP set done/i }));

    await waitFor(async () => {
      const sessions = await sessionRepo.forCycle(cycle.id as number);
      expect(sessions.some((s) => s.liftKey === 'deadlift' && s.week === 1)).toBe(true);
    });

    const [session] = await sessionRepo.forCycle(cycle.id as number);
    expect(session.amrapReps).toBe(6);
    expect(session.estimated1RM).toBeGreaterThan(0);
    expect(session.sets.filter((s) => s.kind === 'main')).toHaveLength(3);
  });

  it('shows a read-only logged state when a session already exists for this lift/week, with completed sets still visible', async () => {
    const cycle = await seedCycle();
    await sessionRepo.add({
      cycleId: cycle.id as number,
      week: 1,
      liftKey: 'deadlift',
      date: '2026-01-01',
      status: 'done',
      sets: [
        { targetReps: 5, weight: 90, actualReps: 5, done: true, isAmrap: false, kind: 'warmup' },
        { targetReps: 5, weight: 105, actualReps: 5, done: true, isAmrap: false, kind: 'main' },
        { targetReps: 5, weight: 112, actualReps: 5, done: true, isAmrap: false, kind: 'main' },
        { targetReps: 5, weight: 119, actualReps: 8, done: true, isAmrap: true, kind: 'main' },
      ],
      amrapReps: 8,
      estimated1RM: 180,
      rpe: null,
      notes: '',
    });

    renderCard(cycle);

    expect(await screen.findByText(/logged/i)).toBeTruthy();

    // The logged sets stay visible, read-only, not collapsed to a bare summary.
    expect(screen.getByText('90')).toBeTruthy();
    expect(screen.getByText('105')).toBeTruthy();
    expect(screen.getByText('112')).toBeTruthy();
    expect(screen.getByText('119')).toBeTruthy();
    expect(screen.getByText('8 reps')).toBeTruthy();

    // Each set shows a done/checkmark indicator.
    expect(screen.getAllByLabelText(/logged$/i)).toHaveLength(4);

    // No editable controls for a logged lift: no Done buttons, no reps input,
    // no training-max editor.
    expect(screen.queryAllByRole('button', { name: /Mark .* done/i })).toHaveLength(0);
    expect(screen.queryByLabelText('Reps done')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit training max' })).toBeNull();
  });

  it('shows an editable training max for an unlogged lift; saving persists the new tm and notifies the parent', async () => {
    const cycle = await seedCycle();
    const onTmChange = vi.fn();
    renderCard(cycle, { onTmChange });

    const editButton = await screen.findByRole('button', { name: 'Edit training max' });
    expect(editButton.textContent).toContain('140');

    fireEvent.click(editButton);

    const input = screen.getByLabelText('training-max-deadlift') as HTMLInputElement;
    expect(input.value).toBe('140');
    fireEvent.change(input, { target: { value: '145' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(onTmChange).toHaveBeenCalledTimes(1);
    });

    const updated = await cycleRepo.active();
    expect(updated?.tm.deadlift).toBe(145);
    expect(updated?.tm.press).toBe(100); // unaffected lift
  });

  it('cancelling the training max editor discards the change', async () => {
    const cycle = await seedCycle();
    renderCard(cycle);

    fireEvent.click(await screen.findByRole('button', { name: 'Edit training max' }));
    const input = screen.getByLabelText('training-max-deadlift') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '999' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByLabelText('training-max-deadlift')).toBeNull();
    expect(screen.getByRole('button', { name: 'Edit training max' }).textContent).toContain('140');
    const unchanged = await cycleRepo.active();
    expect(unchanged?.tm.deadlift).toBe(140);
  });

  it('renders the weight numbers with a fixed-width, right-aligned span for row alignment', async () => {
    const cycle = await seedCycle();
    const { container } = renderCard(cycle);
    await screen.findByRole('heading', { name: 'Deadlift' });

    const weightSpans = container.querySelectorAll('span.tabular-nums.text-right');
    expect(weightSpans.length).toBeGreaterThan(0);
  });

  it('shows exercise demo and supporting lifts affordances when enabled', async () => {
    const cycle = await seedCycle();
    renderCard(cycle, { settings: { ...defaultSettings, exerciseDemos: true, assistanceTracking: true } });

    expect(await screen.findByRole('button', { name: /how to perform/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /supporting lifts/i })).toBeTruthy();
  });

  it('hides exercise demo and supporting lifts affordances when disabled', async () => {
    const cycle = await seedCycle();
    renderCard(cycle, { settings: { ...defaultSettings, exerciseDemos: false, assistanceTracking: false } });

    await screen.findByRole('heading', { name: 'Deadlift' });
    expect(screen.queryByRole('button', { name: /how to perform/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /supporting lifts/i })).toBeNull();
  });

  it('keeps a warm-up row visible once marked done, even with hideCompletedWarmups set (retired setting)', async () => {
    const cycle = await seedCycle();
    renderCard(cycle, { settings: { ...defaultSettings, hideCompletedWarmups: true } });

    await screen.findByRole('heading', { name: 'Deadlift' });

    const warmupToggles = screen.getAllByRole('button', {
      name: /^Mark warm-up set \d+ \([\d.]+kg\) done$/,
    });
    expect(warmupToggles.length).toBeGreaterThan(0);
    const firstLabel = warmupToggles[0].getAttribute('aria-label') as string;

    fireEvent.click(warmupToggles[0]);

    // hideCompletedWarmups no longer hides anything — the row stays present,
    // now marked done.
    const stillThere = screen.getByRole('button', { name: firstLabel });
    expect(stillThere).toBeTruthy();
    expect(stillThere.getAttribute('aria-pressed')).toBe('true');
    // Work rows are unaffected.
    expect(screen.getAllByText('×5').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('×5+')).toBeTruthy();
  });

  it('renders no warm-up rows when display.warmups is off', async () => {
    const cycle = await seedCycle();
    renderCard(cycle, { settings: { ...defaultSettings, displayOverrides: { warmups: false } } });

    await screen.findByRole('heading', { name: 'Deadlift' });

    expect(screen.queryAllByRole('button', { name: /^Mark warm-up set/ })).toHaveLength(0);
    // Work + AMRAP rows still render.
    expect(screen.getAllByText('×5').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('×5+')).toBeTruthy();
  });

  it('shows a note control pre-log, and saves a typed note into the logged Session', async () => {
    const cycle = await seedCycle();
    renderCard(cycle, { settings: { ...defaultSettings, displayOverrides: { notes: true } } });

    await screen.findByRole('heading', { name: 'Deadlift' });

    fireEvent.click(screen.getByRole('button', { name: '+ Add note' }));
    const textarea = screen.getByLabelText('Notes') as HTMLTextAreaElement;
    expect(textarea.id).toBe('lift-note-deadlift');
    fireEvent.change(textarea, { target: { value: 'felt strong' } });

    const workToggles = screen.getAllByRole('button', {
      name: /^Mark work set \d+ \([\d.]+kg\) done$/,
    });
    workToggles.forEach((btn) => fireEvent.click(btn));
    fireEvent.change(screen.getByLabelText('Reps done'), { target: { value: '6' } });
    fireEvent.click(screen.getByRole('button', { name: /Mark work set \d.*AMRAP set done/i }));

    await waitFor(async () => {
      const sessions = await sessionRepo.forCycle(cycle.id as number);
      expect(sessions.some((s) => s.liftKey === 'deadlift' && s.week === 1)).toBe(true);
    });

    const [session] = await sessionRepo.forCycle(cycle.id as number);
    expect(session.notes).toBe('felt strong');
  });

  it('hides the note control when display.notes is off', async () => {
    const cycle = await seedCycle();
    renderCard(cycle, { settings: { ...defaultSettings, displayOverrides: { notes: false } } });

    await screen.findByRole('heading', { name: 'Deadlift' });
    expect(screen.queryByRole('button', { name: '+ Add note' })).toBeNull();
  });

  it('sources the workout template/fivesPro from the cycle snapshot, not live settings.template', async () => {
    const cycle = await seedCycle();
    const bbbCycle: Cycle = { ...cycle, template: 'bbb' };
    renderCard(bbbCycle, {
      settings: { ...defaultSettings, template: { ...defaultSettings.template, selected: 'base' } },
    });

    await screen.findByRole('heading', { name: 'Deadlift' });

    // BBB supplemental rows (5 x 10 @ 50% TM) render even though the live
    // settings' selected template is 'base' — buildWorkout must source the
    // template from the `cycle` prop, not `settings.template.selected`.
    expect(screen.getAllByText('supplemental')).toHaveLength(5);
  });
});
