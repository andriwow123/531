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
      <button
        onClick={() => {
          // Two updateSettings calls in the SAME tick, different fields, no await between.
          updateSettings({ displayPreset: 'detailed' });
          updateSettings({ theme: 'dark' });
        }}
      >
        Set both
      </button>
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

  it('merges two updateSettings calls fired in the same tick (no clobbering)', async () => {
    render(
      <SettingsProvider>
        <Consumer />
      </SettingsProvider>,
    );

    // both updateSettings calls happen synchronously inside one click handler,
    // i.e. before React re-renders/commits between them.
    fireEvent.click(screen.getByRole('button', { name: /set both/i }));

    await waitFor(async () => {
      const s = await settingsRepo.get();
      expect(s.displayPreset).toBe('detailed');
      expect(s.theme).toBe('dark');
    });
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
