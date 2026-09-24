import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { db } from '../../data/db';
import { cycleRepo, profileRepo, settingsRepo, liftRepo } from '../../data/repositories';
import type { Cycle } from '../../data/repositories';
import { defaultSettings } from '../../settings/schema';
import { SettingsProvider } from '../settings/SettingsContext';
import { convertUnits } from '../../data/units';
import Settings from './Settings';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

function renderSettings() {
  return render(
    <SettingsProvider>
      <MemoryRouter>
        <Settings />
      </MemoryRouter>
    </SettingsProvider>,
  );
}

async function seedProfile() {
  await profileRepo.save({ id: 'me', units: 'kg', roundingIncrement: 2.5, tmPercent: 0.85 });
}

/** 4 lifts; only squat carries an explicit roundingIncrement (5) — the rest
 *  fall back to the profile's roundingIncrement (2.5, per seedProfile). */
async function seedLifts() {
  await liftRepo.bulkSave([
    { key: 'press', name: 'Overhead Press', category: 'upper', oneRm: 100, trainingMax: 100, increment: 2.5 },
    { key: 'bench', name: 'Bench Press', category: 'upper', oneRm: 100, trainingMax: 100, increment: 2.5 },
    { key: 'squat', name: 'Squat', category: 'lower', oneRm: 100, trainingMax: 100, increment: 5, roundingIncrement: 5 },
    { key: 'deadlift', name: 'Deadlift', category: 'lower', oneRm: 100, trainingMax: 100, increment: 5 },
  ]);
}

async function seedCycle(): Promise<Cycle> {
  const id = await cycleRepo.add({
    index: 1,
    startedAt: '2026-01-01',
    status: 'active',
    template: 'base',
    fivesPro: false,
    tm: { press: 50, bench: 72.5, squat: 120, deadlift: 152.5 },
  });
  return { ...(await cycleRepo.active()), id } as Cycle;
}

describe('Settings', () => {
  it('shows a top-left Home link and top-right History + active Settings icon links', async () => {
    await seedProfile();
    renderSettings();

    await screen.findByRole('heading', { name: /settings/i });

    const homeLink = screen.getByRole('link', { name: 'Home' });
    expect(homeLink.getAttribute('href')).toBe('/');
    // Reads as a tappable button: home icon alongside the wordmark.
    expect(homeLink.querySelector('svg')).toBeTruthy();
    expect(homeLink.textContent).toContain('5/3/1');

    const historyLink = screen.getByRole('link', { name: 'History' });
    expect(historyLink.getAttribute('href')).toBe('/history');
    expect(historyLink.getAttribute('aria-current')).toBeNull();

    const settingsLink = screen.getByRole('link', { name: 'Settings' });
    expect(settingsLink.getAttribute('href')).toBe('/settings');
    expect(settingsLink.getAttribute('aria-current')).toBe('page');

    expect(screen.queryByRole('link', { name: 'Today' })).toBeNull();
  });

  it('changing Theme to Dark calls through updateSettings and persists', async () => {
    await seedProfile();
    renderSettings();

    await screen.findByRole('heading', { name: /settings/i });

    fireEvent.click(screen.getByRole('button', { name: 'Dark' }));

    await waitFor(async () => expect((await settingsRepo.get()).theme).toBe('dark'));
  });

  it('changing Templates to BBB persists template.selected', async () => {
    await seedProfile();
    renderSettings();

    await screen.findByRole('heading', { name: /settings/i });

    fireEvent.click(screen.getByRole('button', { name: 'BBB' }));

    await waitFor(async () => expect((await settingsRepo.get()).template.selected).toBe('bbb'));
  });

  it('changing the display preset persists displayPreset', async () => {
    await seedProfile();
    renderSettings();

    await screen.findByRole('heading', { name: /settings/i });

    fireEvent.click(screen.getByRole('button', { name: 'Detailed' }));

    await waitFor(async () => expect((await settingsRepo.get()).displayPreset).toBe('detailed'));
  });

  it('toggling Exercise demos persists exerciseDemos', async () => {
    await seedProfile();
    renderSettings();

    await screen.findByRole('heading', { name: /settings/i });

    // SettingsProvider seeds state with defaultSettings and only reflects the
    // loaded settings once its mount-time load resolves; wait for the switch
    // to land in its loaded (checked, per defaultSettings.exerciseDemos=true)
    // state before clicking, to avoid racing the load (see notify tests above).
    const exerciseDemosSwitch = await screen.findByRole('switch', { name: /exercise demos/i });
    await waitFor(() => expect(exerciseDemosSwitch).toBeChecked());

    fireEvent.click(exerciseDemosSwitch);

    await waitFor(async () => expect((await settingsRepo.get()).exerciseDemos).toBe(false));
  });

  it('toggling Bodyweight tracking persists bodyweightTracking', async () => {
    await seedProfile();
    renderSettings();

    await screen.findByRole('heading', { name: /settings/i });

    // SettingsProvider seeds state with defaultSettings and only reflects the
    // loaded settings once its mount-time load resolves; wait for the switch
    // to land in its loaded (checked, per defaultSettings.bodyweightTracking=true)
    // state before clicking, to avoid racing the load (see notify tests above).
    const bodyweightTrackingSwitch = await screen.findByRole('switch', { name: /bodyweight tracking/i });
    await waitFor(() => expect(bodyweightTrackingSwitch).toBeChecked());

    fireEvent.click(bodyweightTrackingSwitch);

    await waitFor(async () => expect((await settingsRepo.get()).bodyweightTracking).toBe(false));
  });

  it('toggling Supporting lifts persists assistanceTracking', async () => {
    await seedProfile();
    renderSettings();

    await screen.findByRole('heading', { name: /settings/i });

    // SettingsProvider seeds state with defaultSettings and only reflects the
    // loaded settings once its mount-time load resolves; wait for the switch
    // to land in its loaded (checked, per defaultSettings.assistanceTracking=true)
    // state before clicking, to avoid racing the load (see notify tests above).
    const supportingLiftsSwitch = await screen.findByRole('switch', { name: /supporting lifts/i });
    await waitFor(() => expect(supportingLiftsSwitch).toBeChecked());

    fireEvent.click(supportingLiftsSwitch);

    await waitFor(async () => expect((await settingsRepo.get()).assistanceTracking).toBe(false));
  });

  it('does not render a Plate breakdown toggle', async () => {
    await seedProfile();
    renderSettings();

    await screen.findByRole('heading', { name: /settings/i });

    expect(screen.queryByText('Plate breakdown')).toBeNull();
    expect(screen.queryByRole('switch', { name: /plate breakdown/i })).toBeNull();
  });

  it('does not render a Hide completed warm-ups toggle (retired — completed sets stay visible)', async () => {
    await seedProfile();
    renderSettings();

    await screen.findByRole('heading', { name: /settings/i });

    expect(screen.queryByText('Hide completed warm-ups')).toBeNull();
    expect(screen.queryByRole('switch', { name: /hide completed warm-ups/i })).toBeNull();
  });

  it('shows a Units segmented control in the Profile section, reflecting the loaded profile', async () => {
    await seedProfile();
    renderSettings();

    await screen.findByRole('heading', { name: /settings/i });

    // Units only renders once the component's own mount-time
    // profileRepo.get() resolves, so this must be awaited rather than
    // asserted synchronously.
    const kgButton = await screen.findByRole('button', { name: 'kg' });
    const lbButton = screen.getByRole('button', { name: 'lb' });
    expect(kgButton.getAttribute('aria-pressed')).toBe('true');
    expect(lbButton.getAttribute('aria-pressed')).toBe('false');
  });

  it('selecting the other unit shows an inline convert confirm without converting yet', async () => {
    await seedProfile();
    renderSettings();

    await screen.findByRole('heading', { name: /settings/i });
    await screen.findByRole('button', { name: 'kg' });

    fireEvent.click(screen.getByRole('button', { name: 'lb' }));

    expect(await screen.findByText('Convert all your weights to lb?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Convert' })).toBeInTheDocument();

    // Not converted yet: profile is untouched until Convert is confirmed.
    expect((await profileRepo.get())?.units).toBe('kg');
  });

  it('Cancel on the convert confirm dismisses it and leaves units unchanged', async () => {
    await seedProfile();
    renderSettings();

    await screen.findByRole('heading', { name: /settings/i });
    await screen.findByRole('button', { name: 'kg' });

    fireEvent.click(screen.getByRole('button', { name: 'lb' }));
    await screen.findByText('Convert all your weights to lb?');

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() =>
      expect(screen.queryByText('Convert all your weights to lb?')).toBeNull(),
    );
    const kgButton = screen.getByRole('button', { name: 'kg' });
    expect(kgButton.getAttribute('aria-pressed')).toBe('true');
  });

  it('selecting the currently-active unit is a no-op (no confirm shown)', async () => {
    await seedProfile();
    renderSettings();

    await screen.findByRole('heading', { name: /settings/i });
    await screen.findByRole('button', { name: 'kg' });

    fireEvent.click(screen.getByRole('button', { name: 'kg' }));

    expect(screen.queryByText(/convert all your weights/i)).toBeNull();
  });

  it('converting units updates the stored profile and lift weights (data-layer check, not via reload)', async () => {
    await seedProfile();
    await liftRepo.bulkSave([
      { key: 'squat', name: 'Squat', category: 'lower', oneRm: 140, trainingMax: 140, increment: 5 },
    ]);

    // Exercise the same conversion the Convert button triggers, directly at
    // the data layer — jsdom can't perform the real window.location.reload
    // that follows a successful conversion in the app.
    await convertUnits('lb');

    const profile = await profileRepo.get();
    expect(profile?.units).toBe('lb');
    expect(profile?.roundingIncrement).toBe(5);

    const lifts = await liftRepo.all();
    expect(lifts[0].increment).toBe(10);
  });

  it('does not render a Training Max % row or the onboarding caption in Profile (vestigial)', async () => {
    await seedProfile();
    renderSettings();

    await screen.findByRole('heading', { name: /settings/i });
    await screen.findByRole('button', { name: 'kg' });

    expect(screen.queryByText('Training Max %')).toBeNull();
    expect(screen.queryByText(/85%/)).toBeNull();
    expect(screen.queryByText(/onboarding/i)).toBeNull();
  });

  it('does not render a Rest timer widget toggle in Display mode (single rest-timer control)', async () => {
    await seedProfile();
    renderSettings();

    await screen.findByRole('heading', { name: /settings/i });

    expect(screen.queryByText('Rest timer widget')).toBeNull();
    expect(screen.queryByRole('switch', { name: /rest timer widget/i })).toBeNull();
  });

  it('shows the Base template description by default and updates it when switching templates', async () => {
    await seedProfile();
    renderSettings();

    await screen.findByRole('heading', { name: /settings/i });

    expect(screen.getByText('Main 5/3/1 sets only.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'BBB' }));
    expect(
      await screen.findByText('Adds 5×10 back-off sets at ~50% of your training max.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Main 5/3/1 sets only.')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'FSL' }));
    expect(
      await screen.findByText('Adds back-off sets at your first work-set weight.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Adds 5×10 back-off sets at ~50% of your training max.'),
    ).toBeNull();
  });

  it('shows captions describing the 5s PRO and Warm-up sets toggles', async () => {
    await seedProfile();
    renderSettings();

    await screen.findByRole('heading', { name: /settings/i });

    expect(
      screen.getByText('Every main set is 5 reps (no AMRAP) — steadier progress.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Adds 40/50/60% warm-up sets before your work sets.'),
    ).toBeInTheDocument();
  });

  it('shows a Training maxes section with the active cycle\'s current TM for each lift', async () => {
    await seedProfile();
    await seedCycle();
    renderSettings();

    await screen.findByRole('heading', { name: /settings/i });

    expect(await screen.findByText('Training maxes')).toBeInTheDocument();

    const press = (await screen.findByLabelText(/overhead press training max/i)) as HTMLInputElement;
    const bench = screen.getByLabelText(/bench press training max/i) as HTMLInputElement;
    const squat = screen.getByLabelText(/squat training max/i) as HTMLInputElement;
    const deadlift = screen.getByLabelText(/deadlift training max/i) as HTMLInputElement;

    expect(press.value).toBe('50');
    expect(bench.value).toBe('72.5');
    expect(squat.value).toBe('120');
    expect(deadlift.value).toBe('152.5');
  });

  it('selects a training max input\'s content on focus, so typing replaces the value', async () => {
    await seedProfile();
    await seedCycle();
    renderSettings();

    const selectSpy = vi.spyOn(HTMLInputElement.prototype, 'select');

    const squat = (await screen.findByLabelText(/squat training max/i)) as HTMLInputElement;
    fireEvent.focus(squat);

    expect(selectSpy).toHaveBeenCalled();
    selectSpy.mockRestore();
  });

  it('editing a lift\'s training max and blurring persists via cycleRepo, leaving other lifts unchanged', async () => {
    await seedProfile();
    const cycle = await seedCycle();
    renderSettings();

    const squat = (await screen.findByLabelText(/squat training max/i)) as HTMLInputElement;
    fireEvent.change(squat, { target: { value: '125' } });
    fireEvent.blur(squat);

    await waitFor(async () => {
      const updated = await cycleRepo.active();
      expect(updated?.tm.squat).toBe(125);
    });

    const updated = await cycleRepo.active();
    expect(updated?.id).toBe(cycle.id);
    expect(updated?.tm.press).toBe(50);
    expect(updated?.tm.bench).toBe(72.5);
    expect(updated?.tm.deadlift).toBe(152.5);
  });

  it('shows a muted empty state in Training maxes when there is no active cycle', async () => {
    await seedProfile();
    renderSettings();

    await screen.findByRole('heading', { name: /settings/i });

    expect(await screen.findByText(/no active cycle/i)).toBeInTheDocument();
  });

  it('shows a Workout day order section listing the 4 lifts in liftOrder order', async () => {
    await seedProfile();
    renderSettings();

    await screen.findByRole('heading', { name: /settings/i });

    expect(await screen.findByText('Workout day order')).toBeInTheDocument();

    const upLabels = screen
      .getAllByRole('button', { name: /^Move .* up$/i })
      .map((btn) => btn.getAttribute('aria-label'));
    expect(upLabels).toEqual([
      'Move Overhead Press up',
      'Move Bench Press up',
      'Move Squat up',
      'Move Deadlift up',
    ]);
  });

  it('clicking Move down on the first lift reorders via moveItem semantics and persists liftOrder', async () => {
    await seedProfile();
    renderSettings();

    await screen.findByRole('heading', { name: /settings/i });

    fireEvent.click(await screen.findByRole('button', { name: 'Move Overhead Press down' }));

    await waitFor(async () => {
      const saved = await settingsRepo.get();
      expect(saved.liftOrder).toEqual(['bench', 'press', 'squat', 'deadlift']);
    });

    const upLabels = screen
      .getAllByRole('button', { name: /^Move .* up$/i })
      .map((btn) => btn.getAttribute('aria-label'));
    expect(upLabels).toEqual([
      'Move Bench Press up',
      'Move Overhead Press up',
      'Move Squat up',
      'Move Deadlift up',
    ]);
  });

  it('clicking Move up on the second lift produces the same reorder as Move down on the first', async () => {
    await seedProfile();
    renderSettings();

    await screen.findByRole('heading', { name: /settings/i });

    fireEvent.click(await screen.findByRole('button', { name: 'Move Bench Press up' }));

    await waitFor(async () => {
      const saved = await settingsRepo.get();
      expect(saved.liftOrder).toEqual(['bench', 'press', 'squat', 'deadlift']);
    });
  });

  it('disables Move up on the first row and Move down on the last row', async () => {
    await seedProfile();
    renderSettings();

    await screen.findByRole('heading', { name: /settings/i });

    expect(await screen.findByRole('button', { name: 'Move Overhead Press up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Deadlift down' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Overhead Press down' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Deadlift up' })).not.toBeDisabled();
  });
});

describe('Settings — notify permission', () => {
  const hadNotification = 'Notification' in window;
  const originalNotification = hadNotification
    ? (window as unknown as { Notification: unknown }).Notification
    : undefined;

  afterEach(() => {
    if (hadNotification) {
      (window as unknown as { Notification: unknown }).Notification = originalNotification;
    } else {
      delete (window as unknown as { Notification?: unknown }).Notification;
    }
  });

  it('requesting permission on user gesture when notify is switched ON', async () => {
    const requestPermission = vi.fn();
    (window as unknown as { Notification: unknown }).Notification = {
      permission: 'default',
      requestPermission,
    };

    await seedProfile();
    renderSettings();

    await screen.findByRole('heading', { name: /settings/i });

    fireEvent.click(screen.getByRole('switch', { name: 'Notify when rest ends' }));

    expect(requestPermission).toHaveBeenCalledTimes(1);
    await waitFor(async () => expect((await settingsRepo.get()).restTimer.notify).toBe(true));
  });

  it('does not request permission when notify is switched OFF', async () => {
    const requestPermission = vi.fn();
    (window as unknown as { Notification: unknown }).Notification = {
      permission: 'default',
      requestPermission,
    };

    await seedProfile();
    await settingsRepo.save({
      ...defaultSettings,
      restTimer: { ...defaultSettings.restTimer, notify: true },
    });
    renderSettings();

    await screen.findByRole('heading', { name: /settings/i });

    // SettingsProvider seeds state with defaultSettings (notify: false) and
    // only reflects the saved settings (notify: true) once its mount-time
    // load resolves. Wait for that load to land in the UI before clicking,
    // otherwise the click can race the load and flip notify OFF->ON instead
    // of ON->OFF, calling requestPermission when this test asserts it isn't.
    const notifySwitch = await screen.findByRole('switch', { name: 'Notify when rest ends' });
    await waitFor(() => expect(notifySwitch).toBeChecked());

    fireEvent.click(notifySwitch);

    expect(requestPermission).not.toHaveBeenCalled();
    await waitFor(async () => expect((await settingsRepo.get()).restTimer.notify).toBe(false));
  });
});

describe('Settings — per-lift rounding', () => {
  it('shows a rounding stepper per lift, labelled by lift name, reflecting each lift\'s effective rounding', async () => {
    await seedProfile();
    await seedLifts();
    renderSettings();

    await screen.findByRole('heading', { name: /settings/i });

    // press/bench/deadlift have no roundingIncrement of their own, so they
    // fall back to the profile's 2.5; squat has its own explicit 5. Each
    // stepper's value sits alongside its +/- buttons in the same wrapper div.
    const press = await screen.findByRole('button', { name: /increase overhead press rounding/i });
    expect(press.parentElement as HTMLElement).toHaveTextContent('2.5kg');

    const bench = screen.getByRole('button', { name: /increase bench press rounding/i });
    expect(bench.parentElement as HTMLElement).toHaveTextContent('2.5kg');

    const deadlift = screen.getByRole('button', { name: /increase deadlift rounding/i });
    expect(deadlift.parentElement as HTMLElement).toHaveTextContent('2.5kg');

    const squat = screen.getByRole('button', { name: /increase squat rounding/i });
    expect(squat.parentElement as HTMLElement).toHaveTextContent('5kg');

    // The old single global stepper is gone.
    expect(screen.queryByText('Round loads to')).toBeNull();
  });

  it('clicking "Increase Overhead Press rounding" persists press roundingIncrement 5 via liftRepo', async () => {
    await seedProfile();
    await seedLifts();
    renderSettings();

    await screen.findByRole('heading', { name: /settings/i });

    const before = (await liftRepo.all()).find((l) => l.key === 'press');
    expect(before?.roundingIncrement).toBeUndefined();

    fireEvent.click(await screen.findByRole('button', { name: /increase overhead press rounding/i }));

    await waitFor(async () => {
      const press = (await liftRepo.all()).find((l) => l.key === 'press');
      expect(press?.roundingIncrement).toBe(5);
    });
  });

  it('clicking "Decrease Squat rounding" persists squat roundingIncrement 2.5 via liftRepo', async () => {
    await seedProfile();
    await seedLifts();
    renderSettings();

    await screen.findByRole('heading', { name: /settings/i });

    const before = (await liftRepo.all()).find((l) => l.key === 'squat');
    expect(before?.roundingIncrement).toBe(5);

    fireEvent.click(await screen.findByRole('button', { name: /decrease squat rounding/i }));

    await waitFor(async () => {
      const squat = (await liftRepo.all()).find((l) => l.key === 'squat');
      expect(squat?.roundingIncrement).toBe(2.5);
    });
  });

  it('shows the per-lift rounding caption', async () => {
    await seedProfile();
    await seedLifts();
    renderSettings();

    await screen.findByRole('heading', { name: /settings/i });

    expect(
      await screen.findByText("Each lift's working sets round to the nearest step you can load."),
    ).toBeInTheDocument();
  });
});

describe('Settings — Backup', () => {
  it('renders a Backup section with Export and Restore controls', async () => {
    await seedProfile();
    renderSettings();

    await screen.findByRole('heading', { name: /settings/i });

    expect(await screen.findByText('Backup')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export backup' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restore from backup' })).toBeInTheDocument();
  });

  it('shows the restore confirm step after picking a valid backup file, and Cancel dismisses it', async () => {
    await seedProfile();
    renderSettings();

    await screen.findByRole('heading', { name: /settings/i });

    const validBackup = JSON.stringify({
      app: '531',
      version: 1,
      exportedAt: new Date().toISOString(),
      data: { profile: [] },
    });
    const file = new File([validBackup], 'backup.json', { type: 'application/json' });
    const input = screen.getByTestId('restore-file-input') as HTMLInputElement;

    fireEvent.change(input, { target: { files: [file] } });

    expect(await screen.findByText(/restore replaces all data on this device/i)).toBeInTheDocument();
    expect(input.value).toBe('');

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() =>
      expect(screen.queryByText(/restore replaces all data on this device/i)).toBeNull(),
    );
  });

  it('shows an inline error when the picked file is not a valid backup', async () => {
    await seedProfile();
    renderSettings();

    await screen.findByRole('heading', { name: /settings/i });

    const badFile = new File(['not json'], 'backup.json', { type: 'application/json' });
    const input = screen.getByTestId('restore-file-input') as HTMLInputElement;

    fireEvent.change(input, { target: { files: [badFile] } });

    expect(await screen.findByText(/couldn't read that backup file/i)).toBeInTheDocument();
    expect(screen.queryByText(/restore replaces all data on this device/i)).toBeNull();
  });
});
