import { createContext, useContext, useEffect, useRef, useState } from 'react';
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
  const loadedRef = useRef(false);
  // Tracks the latest committed settings for reads only (mutated during render,
  // never used to compute the next state) so the mount-load below can tell
  // whether the user already edited settings before the load resolved.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // mount load
  useEffect(() => {
    let cancelled = false;
    settingsRepo.get().then((loaded) => {
      if (cancelled) return;
      const editedBeforeLoad = settingsRef.current !== defaultSettings;
      loadedRef.current = true;
      if (editedBeforeLoad) {
        // The user already called updateSettings before this load resolved.
        // That local edit is authoritative — persist it instead of clobbering
        // it with the now-stale on-disk snapshot we just read.
        void settingsRepo.save(settingsRef.current);
      } else {
        setSettings(loaded);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // persist on every change AFTER the initial load (skip default/initial renders)
  useEffect(() => {
    if (!loadedRef.current) return;
    void settingsRepo.save(settings);
  }, [settings]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (settings.theme === 'system') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', settings.theme);
    }
  }, [settings.theme]);

  // pure + chaining: no side effects, functional updater
  const updateSettings = (patch: Partial<SettingsState>) =>
    setSettings((prev) => ({ ...prev, ...patch }));

  return <SettingsContext.Provider value={{ settings, updateSettings }}>{props.children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return ctx;
}
