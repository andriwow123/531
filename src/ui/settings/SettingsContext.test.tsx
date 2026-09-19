import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { db } from '../../data/db';
import { settingsRepo } from '../../data/repositories';
import { defaultSettings } from '../../settings/schema';
import { SettingsProvider, useSettings } from './SettingsContext';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

function Consumer() {
  const { settings, updateSettings } = useSettings();
  return (
    <div>
      <span data-testid="preset">{settings.displayPreset}</span>
      <button onClick={() => updateSettings({ displayPreset: 'detailed' })}>Set detailed</button>
    </div>
  );
}

describe('SettingsProvider / useSettings', () => {
  it('seeds defaults, updates state on updateSettings, and persists the patch', async () => {
    render(
      <SettingsProvider>
        <Consumer />
      </SettingsProvider>,
    );

    expect(screen.getByTestId('preset')).toHaveTextContent(defaultSettings.displayPreset);

    fireEvent.click(screen.getByRole('button', { name: /set detailed/i }));

    expect(screen.getByTestId('preset')).toHaveTextContent('detailed');

    await waitFor(async () => expect((await settingsRepo.get()).displayPreset).toBe('detailed'));
  });

  it('reflects settings already persisted before mount', async () => {
    await settingsRepo.save({ ...defaultSettings, displayPreset: 'simple' });

    render(
      <SettingsProvider>
        <Consumer />
      </SettingsProvider>,
    );

    expect(await screen.findByText('simple')).toBeInTheDocument();
  });
});

describe('SettingsProvider theme effect', () => {
  it('sets data-theme on documentElement for an explicit theme, and removes it for "system"', async () => {
    document.documentElement.removeAttribute('data-theme');
    await settingsRepo.save({ ...defaultSettings, theme: 'dark' });

    render(
      <SettingsProvider>
        <Consumer />
      </SettingsProvider>,
    );

    await screen.findByTestId('preset');
    await waitFor(() => expect(document.documentElement.getAttribute('data-theme')).toBe('dark'));
  });

  it('removes data-theme when theme is "system"', async () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    await settingsRepo.save({ ...defaultSettings, theme: 'system' });

    render(
      <SettingsProvider>
        <Consumer />
      </SettingsProvider>,
    );

    await screen.findByTestId('preset');
    await waitFor(() => expect(document.documentElement.hasAttribute('data-theme')).toBe(false));
  });
});
