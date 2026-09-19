import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { settingsRepo } from '../../data/repositories';
import { defaultSettings } from '../../settings/schema';
import type { SettingsState } from '../../settings/schema';

export interface SettingsContextValue {
  settings: SettingsState;
  updateSettings: (patch: Partial<SettingsState>) => void;
}

const SettingsContext = createContext<SettingsContextValue | undefined>(undefined);

export function SettingsProvider(props: { children: ReactNode }) {
  const [settings, setSettings] = useState<SettingsState>(defaultSettings);

  useEffect(() => {
    let cancelled = false;
    settingsRepo.get().then((loaded) => {
      if (!cancelled) setSettings(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (settings.theme === 'system') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', settings.theme);
    }
  }, [settings.theme]);

  const updateSettings = (patch: Partial<SettingsState>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      void settingsRepo.save(next);
      return next;
    });
  };

  return <SettingsContext.Provider value={{ settings, updateSettings }}>{props.children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return ctx;
}
