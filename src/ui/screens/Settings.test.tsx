import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { db } from '../../data/db';
import { profileRepo, settingsRepo } from '../../data/repositories';
import { defaultSettings } from '../../settings/schema';
import { SettingsProvider } from '../settings/SettingsContext';
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

describe('Settings', () => {
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

  it('changing Rounding persists the new increment via profileRepo', async () => {
    await seedProfile();
    renderSettings();

    await screen.findByRole('heading', { name: /settings/i });

    const before = await profileRepo.get();
    expect(before?.roundingIncrement).toBe(2.5);

    fireEvent.click(await screen.findByRole('button', { name: /increase rounding increment/i }));

    await waitFor(async () => expect((await profileRepo.get())?.roundingIncrement).toBe(5));
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

  it('shows units and Training Max % read-only with an onboarding note', async () => {
    await seedProfile();
    renderSettings();

    await screen.findByRole('heading', { name: /settings/i });

    // Units/TM% only render once the component's own mount-time
    // profileRepo.get() resolves (a "—" placeholder shows until then), so
    // these must be awaited rather than asserted synchronously.
    expect(await screen.findByText('kg', { selector: 'span' })).toBeInTheDocument();
    expect(await screen.findByText('85%')).toBeInTheDocument();
    expect(screen.getByText(/onboarding/i)).toBeInTheDocument();
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
