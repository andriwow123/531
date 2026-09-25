import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { db } from '../../data/db';
import { cycleRepo, sessionRepo, workoutDayRepo } from '../../data/repositories';
import type { Cycle, Session } from '../../data/repositories';
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

function cardFor(cycle: Cycle, overrides: Partial<Parameters<typeof LiftCard>[0]> = {}) {
  return (
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
    </SettingsProvider>
  );
}

function renderCard(cycle: Cycle, overrides: Partial<Parameters<typeof LiftCard>[0]> = {}) {
  return render(cardFor(cycle, overrides));
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

  it('gives two same-kind/same-weight logged checkmarks distinct aria-labels', async () => {
    const cycle = await seedCycle();
    await sessionRepo.add({
      cycleId: cycle.id as number,
      week: 1,
      liftKey: 'deadlift',
      date: '2026-01-01',
      status: 'done',
      sets: [
        { targetReps: 5, weight: 100, actualReps: 5, done: true, isAmrap: false, kind: 'main' },
        { targetReps: 5, weight: 100, actualReps: 5, done: true, isAmrap: false, kind: 'main' },
      ],
      amrapReps: null,
      estimated1RM: null,
      rpe: null,
      notes: '',
    });

    renderCard(cycle);

    expect(await screen.findByText(/logged/i)).toBeTruthy();

    // Same kind, same weight — previously identical labels; now disambiguated
    // by row position, and each resolves to exactly one element.
    expect(screen.getByLabelText('work set 1 (100kg) logged')).toBeTruthy();
    expect(screen.getByLabelText('work set 2 (100kg) logged')).toBeTruthy();
    expect(screen.getAllByLabelText(/logged$/i)).toHaveLength(2);
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

  it('autofocuses the training max editor input on open and selects its content on focus', async () => {
    const cycle = await seedCycle();
    renderCard(cycle);

    const selectSpy = vi.spyOn(HTMLInputElement.prototype, 'select');

    fireEvent.click(await screen.findByRole('button', { name: 'Edit training max' }));

    const input = screen.getByLabelText('training-max-deadlift') as HTMLInputElement;

    // Opening the editor moves focus straight to the input (autoFocus).
    expect(document.activeElement).toBe(input);

    // Focusing it (whether via autoFocus or a later click) selects its
    // current value, so typing overwrites rather than appends.
    fireEvent.focus(input);
    expect(selectSpy).toHaveBeenCalled();

    selectSpy.mockRestore();
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

  it('renders every set row as a fixed-column grid so the weight lands in the same track on every row', async () => {
    const cycle = await seedCycle();
    const { container } = renderCard(cycle);
    await screen.findByRole('heading', { name: 'Deadlift' });

    // Every set row (kind/% · weight · reps+plates · check) shares the same
    // grid-column template, so the weight column is identically positioned
    // regardless of the reps/plate text length on any given row — that's
    // what makes the weight genuinely centered instead of drifting per row.
    const gridRows = [...container.querySelectorAll('li')].filter((li) =>
      li.className.includes('grid-cols-[4.25rem_1fr_6.5rem_1.75rem]'),
    );
    expect(gridRows.length).toBeGreaterThan(0);

    // The weight number itself is centered within that fixed track (not
    // right-aligned, and no longer a variable-width flex-1 span).
    const weightSpans = container.querySelectorAll('span.tabular-nums.text-center');
    expect(weightSpans.length).toBeGreaterThan(0);
    weightSpans.forEach((span) => {
      expect(span.className).not.toMatch(/w-\[(7\.5rem|5rem)\]/);
      expect(span.closest('.grid')).toBeTruthy();
    });
    expect(container.querySelectorAll('span.tabular-nums.text-right').length).toBe(0);

    // The old variable-width centering wrapper (`flex-1 justify-center`,
    // sized by the reps/plate column's content) is gone.
    expect(container.querySelectorAll('.flex-1.justify-center').length).toBe(0);
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

    const noteTrigger = screen.getByRole('button', { name: '+ Add note' });
    expect(noteTrigger.className).toMatch(/\bw-full\b/);
    fireEvent.click(noteTrigger);
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

  it('rebuilds the set list when the cycle template changes on an in-place rerender (e.g. a Settings edit to the active cycle)', async () => {
    const cycle = await seedCycle(); // template: 'base'
    const { rerender } = renderCard(cycle);

    await screen.findByRole('heading', { name: 'Deadlift' });
    expect(screen.queryAllByText('supplemental')).toHaveLength(0);

    const bbbCycle: Cycle = { ...cycle, template: 'bbb' };
    rerender(
      <SettingsProvider>
        <LiftCard
          liftKey="deadlift"
          week={1}
          cycle={bbbCycle}
          unit="kg"
          roundingIncrement={2.5}
          dayNumber={2}
          settings={defaultSettings}
        />
      </SettingsProvider>,
    );

    expect(screen.getAllByText('supplemental')).toHaveLength(5);
  });
});

// In-progress set checks, typed reps and the note are saved to the day's
// WorkoutDay row as you go and restored whenever the set list is (re)built.
// Overhead press, TM 100, 2.5 rounding, week 1: warm-ups 40/50/60, work sets
// 65/75/85+ (AMRAP = work set 3), BBB back-off 5x10 @ 50, FSL 5x5 @ 65.
describe('LiftCard in-progress drafts', () => {
  // Every workoutDayRepo.get issued (the card's draft load and its timer's),
  // so a test can wait until the day's draft has loaded: taps only save once
  // it has (a tap in the few ms before may be replaced by the restore).
  let getSpy: MockInstance<typeof workoutDayRepo.get>;
  // The real repo methods, for spies that hold or fail a call, then call through.
  const realGet = workoutDayRepo.get;
  const realAdd = sessionRepo.add;

  beforeEach(() => {
    getSpy = vi.spyOn(workoutDayRepo, 'get');
  });

  afterEach(() => {
    // The get spy, plus any sessionRepo.add spy a test installed.
    vi.restoreAllMocks();
  });

  async function draftsLoaded() {
    await act(async () => {
      await Promise.allSettled(getSpy.mock.results.map((r) => r.value));
    });
  }

  const check = (label: string) => screen.getByRole('button', { name: `Mark ${label} done` });

  // Every week-1 work set done, so the session auto-saves.
  function finishWeek1MainSets() {
    fireEvent.click(check('work set 1 (65kg)'));
    fireEvent.click(check('work set 2 (75kg)'));
    fireEvent.click(screen.getByRole('button', { name: 'Mark work set 3 (85kg) AMRAP set done' }));
  }

  it('keeps a checked set after the card unmounts and mounts again (navigating away and back, or a reload)', async () => {
    const cycle = await seedCycle();
    const first = render(cardFor(cycle, { liftKey: 'press' }));
    await draftsLoaded();

    fireEvent.click(check('warm-up set 1 (40kg)'));
    // Leave straight away (e.g. to Settings), while the save is still in flight.
    first.unmount();

    render(cardFor(cycle, { liftKey: 'press' }));
    await waitFor(() => expect(check('warm-up set 1 (40kg)')).toHaveAttribute('aria-pressed', 'true'));
    expect(check('warm-up set 2 (50kg)')).toHaveAttribute('aria-pressed', 'false');
  });

  it('restores typed AMRAP reps and the note after a remount', async () => {
    const cycle = await seedCycle();
    const first = render(cardFor(cycle, { liftKey: 'press' }));
    await draftsLoaded();

    fireEvent.change(screen.getByLabelText('Reps done'), { target: { value: '8' } });
    fireEvent.click(screen.getByRole('button', { name: '+ Add note' }));
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'grindy last rep' } });
    first.unmount();

    render(cardFor(cycle, { liftKey: 'press' }));
    await waitFor(() => expect(screen.getByLabelText('Reps done')).toHaveValue(8));
    // The collapsed note bar previews the restored note.
    expect(screen.getByRole('button', { name: 'grindy last rep' })).toBeTruthy();
    // Still unlogged: the AMRAP set itself hasn't been marked done.
    expect(screen.getByRole('button', { name: 'Mark work set 3 (85kg) AMRAP set done' })).toBeTruthy();
  });

  it('keeps BBB and FSL back-off progress apart across template switches, restoring each on the way back', async () => {
    const cycle = await seedCycle();
    const cycleId = cycle.id as number;
    const bbb: Cycle = { ...cycle, template: 'bbb' };
    const fsl: Cycle = { ...cycle, template: 'fsl' };
    const { rerender } = render(cardFor(bbb, { liftKey: 'press' }));
    await draftsLoaded();

    fireEvent.click(check('supplemental set 1 (50kg)'));
    fireEvent.click(check('warm-up set 1 (40kg)')); // warm-ups are shared by every template

    rerender(cardFor(fsl, { liftKey: 'press' }));
    expect(check('supplemental set 1 (65kg)')).toHaveAttribute('aria-pressed', 'false');
    expect(check('warm-up set 1 (40kg)')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(check('supplemental set 2 (65kg)'));

    rerender(cardFor(bbb, { liftKey: 'press' }));
    expect(check('supplemental set 1 (50kg)')).toHaveAttribute('aria-pressed', 'true');
    expect(check('supplemental set 2 (50kg)')).toHaveAttribute('aria-pressed', 'false');
    expect(check('warm-up set 1 (40kg)')).toHaveAttribute('aria-pressed', 'true');

    // Both templates' back-off progress is stored side by side.
    await waitFor(async () => {
      const day = await workoutDayRepo.get(cycleId, 1, 'press');
      expect(day?.progress['bbb:supplemental:1']?.done).toBe(true);
      expect(day?.progress['fsl:supplemental:2']?.done).toBe(true);
      expect(day?.progress['warmup:1']?.done).toBe(true);
    });
  });

  it('clears the saved progress but keeps the timer once every main set is done and the session auto-saves', async () => {
    const cycle = await seedCycle();
    const cycleId = cycle.id as number;
    const startedAt = new Date(2026, 8, 24, 18, 0).toISOString();
    await workoutDayRepo.setTimes(cycleId, 1, 'press', { startedAt, endedAt: null });
    render(cardFor(cycle, { liftKey: 'press' }));
    await draftsLoaded();

    // Saved as you go...
    fireEvent.click(check('work set 1 (65kg)'));
    await waitFor(async () => {
      expect((await workoutDayRepo.get(cycleId, 1, 'press'))?.progress['main:1']?.done).toBe(true);
    });

    // ...until the last main set is done and the session saves.
    fireEvent.click(check('work set 2 (75kg)'));
    fireEvent.change(screen.getByLabelText('Reps done'), { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: 'Mark work set 3 (85kg) AMRAP set done' }));

    await waitFor(async () => {
      const sessions = await sessionRepo.forCycle(cycleId);
      expect(sessions.filter((s) => s.liftKey === 'press' && s.week === 1)).toHaveLength(1);
      const day = await workoutDayRepo.get(cycleId, 1, 'press');
      expect(day?.progress).toEqual({});
      expect(day?.notes).toBe('');
      expect(day?.startedAt).toBe(startedAt);
      expect(day?.endedAt).toBeNull();
    });
    expect(await screen.findByText(/logged this week/i)).toBeTruthy();
    const [session] = await sessionRepo.forCycle(cycleId);
    expect(session.amrapReps).toBe(7);
  });

  it("keeps rendering a saved session's own logged sets after a template change, and never writes a draft for it", async () => {
    const cycle = await seedCycle();
    const cycleId = cycle.id as number;
    const logged: Session = {
      cycleId,
      week: 1,
      liftKey: 'press',
      date: '2026-09-20T18:40:00.000Z',
      status: 'done',
      sets: [
        { targetReps: 5, weight: 65, actualReps: 5, done: true, isAmrap: false, kind: 'main' },
        { targetReps: 5, weight: 75, actualReps: 5, done: true, isAmrap: false, kind: 'main' },
        { targetReps: 5, weight: 85, actualReps: 9, done: true, isAmrap: true, kind: 'main' },
      ],
      amrapReps: 9,
      estimated1RM: 110,
      rpe: null,
      notes: '',
    };
    const session: Session = { ...logged, id: await sessionRepo.add(logged) };

    const { rerender } = render(cardFor(cycle, { liftKey: 'press', session }));
    expect(await screen.findByText(/logged this week/i)).toBeTruthy();
    expect(screen.getAllByLabelText(/logged$/i)).toHaveLength(3);

    rerender(cardFor({ ...cycle, template: 'bbb' }, { liftKey: 'press', session }));
    await draftsLoaded();

    expect(screen.getAllByLabelText(/logged$/i)).toHaveLength(3);
    expect(screen.getByText('9 reps')).toBeTruthy();
    expect(screen.queryAllByText('supplemental')).toHaveLength(0);
    expect(screen.queryAllByRole('button', { name: /^Mark / })).toHaveLength(0);

    const [stored] = await sessionRepo.forCycle(cycleId);
    expect(stored.sets).toEqual(logged.sets);
    expect(await workoutDayRepo.get(cycleId, 1, 'press')).toBeUndefined();
  });

  // Home keeps every LiftCard mounted and just changes `week` when a week tab
  // is tapped, so nothing belonging to the day just left may leak into the
  // day now on screen — neither its display nor its stored row.
  describe('switching weeks on the same card', () => {
    it("never shows or stores a set checked on week 1 as week 2's, and restores it on week 1", async () => {
      const cycle = await seedCycle();
      const cycleId = cycle.id as number;
      const { rerender } = render(cardFor(cycle, { liftKey: 'press', week: 1 }));
      await draftsLoaded();

      fireEvent.click(check('warm-up set 1 (40kg)'));
      // Switch weeks immediately, before week 1's save lands (no await).
      rerender(cardFor(cycle, { liftKey: 'press', week: 2 }));

      // Once week 1's save has landed (and with it any continuation of it)
      // and week 2's own draft has loaded, week 2's view is final.
      await waitFor(async () => {
        expect((await workoutDayRepo.get(cycleId, 1, 'press'))?.progress['warmup:1']?.done).toBe(true);
      });
      await draftsLoaded();

      expect(screen.queryAllByRole('button', { pressed: true })).toHaveLength(0);
      expect((await workoutDayRepo.get(cycleId, 2, 'press'))?.progress['warmup:1']).toBeUndefined();

      rerender(cardFor(cycle, { liftKey: 'press', week: 1 }));
      await waitFor(() => expect(check('warm-up set 1 (40kg)')).toHaveAttribute('aria-pressed', 'true'));
    });

    it("never applies week 1's saved draft to week 2 when its load lands after the switch", async () => {
      const cycle = await seedCycle();
      const cycleId = cycle.id as number;
      await workoutDayRepo.saveProgress(
        cycleId,
        1,
        'press',
        { 'warmup:1': { done: true, actualReps: null } },
        'week one note',
      );

      const { rerender } = render(cardFor(cycle, { liftKey: 'press', week: 1 }));
      // Switch before week 1's draft has loaded.
      rerender(cardFor(cycle, { liftKey: 'press', week: 2 }));
      await draftsLoaded();

      expect(screen.queryAllByRole('button', { pressed: true })).toHaveLength(0);
      expect(screen.getByRole('button', { name: '+ Add note' })).toBeTruthy();

      rerender(cardFor(cycle, { liftKey: 'press', week: 1 }));
      await waitFor(() => expect(check('warm-up set 1 (40kg)')).toHaveAttribute('aria-pressed', 'true'));
      expect(screen.getByRole('button', { name: 'week one note' })).toBeTruthy();
    });

    it("finishing week 1 then switching before its session lands: week 2 stays interactive and week 1's draft is still cleared", async () => {
      const cycle = await seedCycle();
      const cycleId = cycle.id as number;
      // A parent-provided `session` (as Home passes it): not logged yet.
      const { rerender } = render(cardFor(cycle, { liftKey: 'press', week: 1, session: null }));
      await draftsLoaded();

      fireEvent.click(check('work set 1 (65kg)'));
      fireEvent.click(check('work set 2 (75kg)'));
      fireEvent.click(screen.getByRole('button', { name: 'Mark work set 3 (85kg) AMRAP set done' }));
      // The session auto-save is now in flight; switch before it lands.
      rerender(cardFor(cycle, { liftKey: 'press', week: 2, session: null }));

      await waitFor(async () => {
        const sessions = await sessionRepo.forCycle(cycleId);
        expect(sessions.filter((s) => s.liftKey === 'press' && s.week === 1)).toHaveLength(1);
        expect((await workoutDayRepo.get(cycleId, 1, 'press'))?.progress).toEqual({});
      });
      await draftsLoaded();

      expect(screen.queryByText(/logged this week/i)).toBeNull();
      expect(check('work set 1 (70kg)')).toHaveAttribute('aria-pressed', 'false');
      expect((await workoutDayRepo.get(cycleId, 2, 'press'))?.progress ?? {}).toEqual({});
    });

    it('never logs a day twice when you leave and come back while its session is still saving', async () => {
      const cycle = await seedCycle();
      const cycleId = cycle.id as number;
      // Hold every session write until released.
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const addSpy = vi.spyOn(sessionRepo, 'add').mockImplementation(async (s) => {
        await gate;
        return realAdd(s);
      });

      const { rerender } = render(cardFor(cycle, { liftKey: 'press', week: 1, session: null }));
      await draftsLoaded();
      finishWeek1MainSets();
      expect(addSpy).toHaveBeenCalledTimes(1); // week 1's session write, still pending

      // Leave and come straight back while it's still saving: week 1's draft
      // reloads with every main set done (nothing has cleared it yet).
      rerender(cardFor(cycle, { liftKey: 'press', week: 2, session: null }));
      await draftsLoaded();
      rerender(cardFor(cycle, { liftKey: 'press', week: 1, session: null }));
      await waitFor(() => expect(check('work set 1 (65kg)')).toHaveAttribute('aria-pressed', 'true'));
      await draftsLoaded();

      release();
      expect(await screen.findByText(/logged this week/i)).toBeTruthy();
      await act(async () => {
        await Promise.allSettled(addSpy.mock.results.map((r) => r.value));
      });

      expect(addSpy).toHaveBeenCalledTimes(1);
      const sessions = await sessionRepo.forCycle(cycleId);
      expect(sessions.filter((s) => s.liftKey === 'press' && s.week === 1)).toHaveLength(1);
    });

    it("coming back to a day logged while you were on another week restores its cleared draft, not the card's stale copy", async () => {
      const cycle = await seedCycle();
      const cycleId = cycle.id as number;
      // Week 2's draft is slow: it hasn't loaded yet when you come back.
      let releaseWeek2!: () => void;
      const week2Gate = new Promise<void>((resolve) => {
        releaseWeek2 = resolve;
      });
      getSpy.mockImplementation(async (cId, week, liftKey) => {
        if (week === 2) await week2Gate;
        return realGet(cId, week, liftKey);
      });

      const { rerender } = render(cardFor(cycle, { liftKey: 'press', week: 1, session: null }));
      await draftsLoaded();
      finishWeek1MainSets();
      rerender(cardFor(cycle, { liftKey: 'press', week: 2, session: null }));

      // Week 1's session lands, and its stored draft is cleared, while week 2 is on screen.
      await waitFor(async () => {
        const sessions = await sessionRepo.forCycle(cycleId);
        expect(sessions.filter((s) => s.liftKey === 'press' && s.week === 1)).toHaveLength(1);
        expect((await workoutDayRepo.get(cycleId, 1, 'press'))?.progress).toEqual({});
      });

      // Back to week 1 before week 2's draft loaded, and before the parent
      // re-queried its sessions (still `session: null`).
      rerender(cardFor(cycle, { liftKey: 'press', week: 1, session: null }));
      releaseWeek2();
      await draftsLoaded();

      expect(screen.queryAllByRole('button', { pressed: true })).toHaveLength(0);
      const sessions = await sessionRepo.forCycle(cycleId);
      expect(sessions.filter((s) => s.liftKey === 'press' && s.week === 1)).toHaveLength(1);
    });

    it("a save that fails after you switched weeks doesn't flag the week on screen, and coming back retries it", async () => {
      const cycle = await seedCycle();
      const cycleId = cycle.id as number;
      // The first session write fails once released; later ones go through.
      let fail!: () => void;
      const failing = new Promise<never>((_, reject) => {
        fail = () => reject(new Error('QuotaExceededError'));
      });
      const addSpy = vi.spyOn(sessionRepo, 'add').mockImplementationOnce(() => failing);

      const { rerender } = render(cardFor(cycle, { liftKey: 'press', week: 1, session: null }));
      await draftsLoaded();
      finishWeek1MainSets();
      rerender(cardFor(cycle, { liftKey: 'press', week: 2, session: null }));
      await draftsLoaded();

      // Week 1's save fails while week 2 is on screen.
      await act(async () => {
        fail();
        await Promise.allSettled(addSpy.mock.results.map((r) => r.value));
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      expect(screen.queryByText(/couldn't save/i)).toBeNull();

      // Week 1's stored draft still has every main set done, so coming back retries the save.
      rerender(cardFor(cycle, { liftKey: 'press', week: 1, session: null }));
      expect(await screen.findByText(/logged this week/i)).toBeTruthy();
      expect(addSpy).toHaveBeenCalledTimes(2);
      const sessions = await sessionRepo.forCycle(cycleId);
      expect(sessions.filter((s) => s.liftKey === 'press' && s.week === 1)).toHaveLength(1);
    });
  });

  it('saves both of two taps that land before the card re-renders', async () => {
    const cycle = await seedCycle();
    const cycleId = cycle.id as number;
    render(cardFor(cycle, { liftKey: 'press' }));
    await draftsLoaded();

    const warmup1 = check('warm-up set 1 (40kg)');
    const warmup2 = check('warm-up set 2 (50kg)');
    // One act batch: no re-render between the taps, so the second tap's
    // handler is the same (first-render) closure as the first's.
    act(() => {
      fireEvent.click(warmup1);
      fireEvent.click(warmup2);
    });

    expect(check('warm-up set 1 (40kg)')).toHaveAttribute('aria-pressed', 'true');
    expect(check('warm-up set 2 (50kg)')).toHaveAttribute('aria-pressed', 'true');
    await waitFor(async () => {
      const day = await workoutDayRepo.get(cycleId, 1, 'press');
      expect(day?.progress['warmup:2']?.done).toBe(true);
      expect(day?.progress['warmup:1']?.done).toBe(true);
    });
  });

  it('restores untouched reps from the current prescription but keeps reps you typed (5s PRO switched on mid-workout)', async () => {
    const cycle = await seedCycle();
    const cycleId = cycle.id as number;
    // Week 2: work sets 70/80/90 x3, the last an AMRAP (3+). With 5s PRO every
    // work set is x5 and there is no AMRAP.
    const { rerender } = render(cardFor(cycle, { liftKey: 'press', week: 2 }));
    await draftsLoaded();

    fireEvent.click(check('work set 1 (70kg)')); // reps left as prescribed (3)
    fireEvent.change(screen.getByLabelText('Reps done'), { target: { value: '7' } }); // typed on the AMRAP

    rerender(cardFor({ ...cycle, fivesPro: true }, { liftKey: 'press', week: 2 }));
    expect(check('work set 1 (70kg)')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(check('work set 2 (80kg)'));
    fireEvent.click(check('work set 3 (90kg)'));

    await waitFor(async () => {
      const sessions = await sessionRepo.forCycle(cycleId);
      expect(sessions.filter((s) => s.liftKey === 'press' && s.week === 2)).toHaveLength(1);
    });
    const [session] = await sessionRepo.forCycle(cycleId);
    const work = session.sets.filter((s) => s.kind === 'main');
    expect(work.map((s) => s.targetReps)).toEqual([5, 5, 5]);
    expect(work[0].actualReps).toBe(5); // untouched: the new prescription, not the old 3
    expect(work[2].actualReps).toBe(7); // typed: kept
  });
});
