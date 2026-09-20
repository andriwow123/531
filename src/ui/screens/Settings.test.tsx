import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { db } from '../../data/db';
import { profileRepo, settingsRepo } from '../../data/repositories';
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
