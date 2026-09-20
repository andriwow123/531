import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { db } from '../../data/db';
import { profileRepo, liftRepo, cycleRepo, sessionRepo, settingsRepo } from '../../data/repositories';
import { defaultSettings } from '../../settings/schema';
import { SettingsProvider } from '../settings/SettingsContext';
import CycleEnd from './CycleEnd';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

function renderCycleEnd() {
  return render(
    <SettingsProvider>
      <MemoryRouter>
        <CycleEnd />
      </MemoryRouter>
    </SettingsProvider>,
  );
}

async function seed(options?: { fivesPro?: boolean }) {
  const fivesPro = options?.fivesPro ?? false;
  await profileRepo.save({ id: 'me', units: 'kg', roundingIncrement: 2.5, tmPercent: 0.85 });
  await liftRepo.bulkSave([
    { key: 'press', name: 'Overhead Press', category: 'upper', oneRm: 100, trainingMax: 100, increment: 2.5 },
    { key: 'bench', name: 'Bench Press', category: 'upper', oneRm: 100, trainingMax: 100, increment: 2.5 },
    { key: 'squat', name: 'Squat', category: 'lower', oneRm: 100, trainingMax: 100, increment: 5 },
    { key: 'deadlift', name: 'Deadlift', category: 'lower', oneRm: 100, trainingMax: 100, increment: 5 },
  ]);
  const cycleId = await cycleRepo.add({
    index: 1,
    startedAt: '2026-01-01',
    status: 'active',
    template: 'base',
    fivesPro,
    tm: { press: 100, bench: 100, squat: 100, deadlift: 100 },
  });

  const liftKeys = ['press', 'bench', 'squat', 'deadlift'] as const;
  for (const liftKey of liftKeys) {
    if (fivesPro) {
      await sessionRepo.add({
        cycleId,
        week: 3,
        liftKey,
        date: '2026-02-01',
        status: 'done',
        sets: [
          {
            targetReps: 5,
            weight: 95,
            actualReps: 5,
            done: true,
            isAmrap: false,
            kind: 'main',
          },
        ],
        amrapReps: null,
        estimated1RM: null,
        rpe: 8,
        notes: '',
      });
    } else {
      await sessionRepo.add({
        cycleId,
        week: 3,
        liftKey,
        date: '2026-02-01',
        status: 'done',
        sets: [
          {
            targetReps: 1,
            weight: 95,
            actualReps: 5,
            done: true,
            isAmrap: true,
            kind: 'main',
          },
        ],
        amrapReps: 5,
        estimated1RM: null,
        rpe: 8,
        notes: '',
      });
    }
  }

  return cycleId;
}

describe('CycleEnd', () => {
  it('suggests a bump for every lift after a completed week-3 top set at RPE 8', async () => {
    await seed();
    renderCycleEnd();

    await screen.findByText('Overhead Press');

    expect(screen.getAllByText('Bump')).toHaveLength(4);

    expect((screen.getByLabelText('New training max for Overhead Press') as HTMLInputElement).value).toBe(
      '102.5',
    );
    expect((screen.getByLabelText('New training max for Bench Press') as HTMLInputElement).value).toBe(
      '102.5',
    );
    expect((screen.getByLabelText('New training max for Squat') as HTMLInputElement).value).toBe('105');
    expect((screen.getByLabelText('New training max for Deadlift') as HTMLInputElement).value).toBe('105');
  });

  it('suggests a bump for a 5s-PRO top set (no AMRAP, straight 5 completed) instead of a reset', async () => {
    await seed({ fivesPro: true });
    renderCycleEnd();

    await screen.findByText('Overhead Press');

    expect(screen.getAllByText('Bump')).toHaveLength(4);
    expect(screen.queryByText('Reset')).not.toBeInTheDocument();
  });

  it('applies accepted TMs, completes the old cycle, and starts the next one', async () => {
    const cycleId = await seed();
    renderCycleEnd();

    await screen.findByText('Overhead Press');

    fireEvent.click(screen.getByRole('button', { name: /apply/i }));

    await waitFor(async () => {
      const lifts = await liftRepo.all();
      const press = lifts.find((l) => l.key === 'press');
      expect(press?.trainingMax).toBe(102.5);
    });

    const lifts = await liftRepo.all();
    expect(lifts.find((l) => l.key === 'bench')?.trainingMax).toBe(102.5);
    expect(lifts.find((l) => l.key === 'squat')?.trainingMax).toBe(105);
    expect(lifts.find((l) => l.key === 'deadlift')?.trainingMax).toBe(105);

    const oldCycle = await db.cycles.get(cycleId);
    expect(oldCycle?.status).toBe('completed');

    const active = await cycleRepo.active();
    expect(active?.index).toBe(2);
    expect(active?.tm).toEqual({ press: 102.5, bench: 102.5, squat: 105, deadlift: 105 });
  });

  it('snapshots the CURRENT settings template/fivesPro into the next cycle, not the old cycle\'s', async () => {
    await settingsRepo.save({
      ...defaultSettings,
      template: { ...defaultSettings.template, selected: 'bbb', fivesPro: true },
    });
    await seed(); // old cycle is template:'base', fivesPro:false
    renderCycleEnd();

    await screen.findByText('Overhead Press');

    fireEvent.click(screen.getByRole('button', { name: /apply/i }));

    await waitFor(async () => {
      const active = await cycleRepo.active();
      expect(active?.index).toBe(2);
    });

    const active = await cycleRepo.active();
    expect(active?.template).toBe('bbb');
    expect(active?.fivesPro).toBe(true);
  });

  it('disables Apply and refuses to write when a New-TM is cleared to 0, and re-enables once fixed', async () => {
    const cycleId = await seed();
    renderCycleEnd();

    await screen.findByText('Overhead Press');

    const pressTmInput = screen.getByLabelText('New training max for Overhead Press');
    fireEvent.change(pressTmInput, { target: { value: '' } });

    const applyButton = screen.getByRole('button', { name: /apply/i });
    expect(applyButton).toBeDisabled();

    fireEvent.click(applyButton);

    // Give any (erroneous) async write a chance to land, then confirm nothing changed.
    await new Promise((r) => setTimeout(r, 0));
    const liftsAfterAttempt = await liftRepo.all();
    expect(liftsAfterAttempt.find((l) => l.key === 'press')?.trainingMax).toBe(100);
    expect(await cycleRepo.active()).toMatchObject({ id: cycleId, index: 1 });

    fireEvent.change(pressTmInput, { target: { value: '102.5' } });
    expect(applyButton).not.toBeDisabled();

    fireEvent.click(applyButton);

    await waitFor(async () => {
      const lifts = await liftRepo.all();
      expect(lifts.find((l) => l.key === 'press')?.trainingMax).toBe(102.5);
    });

    await waitFor(async () => {
      const active = await cycleRepo.active();
      expect(active?.index).toBe(2);
    });
  });
});
