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

  it('shows units and Training Max % read-only with an onboarding note', async () => {
    await seedProfile();
    renderSettings();

    await screen.findByRole('heading', { name: /settings/i });

    expect(screen.getByText('kg', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText('85%')).toBeInTheDocument();
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

    fireEvent.click(screen.getByRole('switch', { name: 'Notify when rest ends' }));

    expect(requestPermission).not.toHaveBeenCalled();
    await waitFor(async () => expect((await settingsRepo.get()).restTimer.notify).toBe(false));
  });
});
