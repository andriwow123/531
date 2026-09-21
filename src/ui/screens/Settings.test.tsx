import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { db } from '../../data/db';
import { cycleRepo, profileRepo, settingsRepo } from '../../data/repositories';
import type { Cycle } from '../../data/repositories';
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
  it('shows top-bar icon links to Today and History', async () => {
    await seedProfile();
    renderSettings();

    await screen.findByRole('heading', { name: /settings/i });

    const todayLink = screen.getByRole('link', { name: 'Today' });
    expect(todayLink.getAttribute('href')).toBe('/');
    const historyLink = screen.getByRole('link', { name: 'History' });
    expect(historyLink.getAttribute('href')).toBe('/history');
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
