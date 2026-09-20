import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Unit, TemplateKey } from '../../domain';
import { profileRepo } from '../../data/repositories';
import type { Profile } from '../../data/repositories';
import { resolveDisplay } from '../../settings/display';
import type { DisplayPreset, DisplayElement } from '../../settings/schema';
import { useSettings } from '../settings/SettingsContext';

const DISPLAY_PRESETS: { value: DisplayPreset; label: string }[] = [
  { value: 'simple', label: 'Simple' },
  { value: 'standard', label: 'Standard' },
  { value: 'detailed', label: 'Detailed' },
];

const TEMPLATES: { value: TemplateKey; label: string }[] = [
  { value: 'base', label: 'Base' },
  { value: 'bbb', label: 'BBB' },
  { value: 'fsl', label: 'FSL' },
];

const THEMES: { value: 'dark' | 'light' | 'system'; label: string }[] = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'system', label: 'System' },
];

/** Rounding increments offered per unit, ordered smallest -> largest. */
const ROUNDING_STEPS: Record<Unit, number[]> = {
  kg: [1.25, 2.5, 5],
  lb: [2.5, 5, 10],
};

const REST_SECONDS_MIN = 30;
const REST_SECONDS_MAX = 600;
const REST_SECONDS_STEP = 15;

/** mm:ss, zero-padded seconds. */
function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/** Moves to the next/previous value in a sorted step list, clamped at the ends.
 *  Falls back to the nearest entry when the current value isn't in the list
 *  (e.g. a value saved under a different unit system). */
function stepWithin(steps: number[], current: number, dir: 1 | -1): number {
  let index = steps.indexOf(current);
  if (index === -1) {
    index = steps.reduce(
      (best, v, i) => (Math.abs(v - current) < Math.abs(steps[best] - current) ? i : best),
      0,
    );
  }
  const next = index + dir;
  if (next < 0 || next >= steps.length) return steps[index];
  return steps[next];
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-[var(--r-card)] border border-[var(--line)] bg-[var(--surface)] p-4">
      <h2 className="mb-3 text-sm font-extrabold text-[var(--muted)]">{title}</h2>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-[var(--r-pill)] bg-[var(--surface-2)] p-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          aria-pressed={value === opt.value}
          className={
            'rounded-[var(--r-pill)] px-4 py-1.5 text-sm font-semibold transition-colors ' +
            (value === opt.value
              ? 'bg-[var(--accent)] text-[var(--on-accent)]'
              : 'text-[var(--muted)]')
          }
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className="relative h-6 w-11 flex-none rounded-[var(--r-pill)] transition-colors"
      style={{ background: checked ? 'var(--accent)' : 'var(--surface-2)' }}
    >
      <span
        aria-hidden="true"
        className="absolute top-0.5 block h-5 w-5 rounded-full transition-transform"
        style={{
          background: 'var(--on-accent)',
          transform: checked ? 'translateX(22px)' : 'translateX(2px)',
        }}
      />
    </button>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm font-semibold">{label}</span>
      <Switch checked={checked} onChange={onChange} label={label} />
    </div>
  );
}

function Stepper({
  label,
  valueLabel,
  onDecrease,
  onIncrease,
  decreaseLabel,
  increaseLabel,
  disableDecrease,
  disableIncrease,
}: {
  label: string;
  valueLabel: string;
  onDecrease: () => void;
  onIncrease: () => void;
  decreaseLabel: string;
  increaseLabel: string;
  disableDecrease?: boolean;
  disableIncrease?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm font-semibold">{label}</span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onDecrease}
          disabled={disableDecrease}
          aria-label={decreaseLabel}
          className="grid h-8 w-8 place-items-center rounded-full border border-[var(--line)] bg-[var(--surface-2)] text-base font-extrabold text-[var(--text)] disabled:opacity-40"
        >
          −
        </button>
        <span className="min-w-[3.5rem] text-center text-sm font-bold tabular-nums">
          {valueLabel}
        </span>
        <button
          type="button"
          onClick={onIncrease}
          disabled={disableIncrease}
          aria-label={increaseLabel}
          className="grid h-8 w-8 place-items-center rounded-full border border-[var(--line)] bg-[var(--surface-2)] text-base font-extrabold text-[var(--text)] disabled:opacity-40"
        >
          +
        </button>
      </div>
    </div>
  );
}

export default function Settings() {
  const { settings, updateSettings } = useSettings();
  const display = resolveDisplay(settings.displayPreset, settings.displayOverrides);

  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    profileRepo.get().then((p) => {
      if (!cancelled) setProfile(p ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function toggleDisplay(el: DisplayElement) {
    updateSettings({
      displayOverrides: { ...settings.displayOverrides, [el]: !display[el] },
    });
  }

  async function changeRounding(dir: 1 | -1) {
    if (!profile) return;
    const steps = ROUNDING_STEPS[profile.units];
    const next = stepWithin(steps, profile.roundingIncrement, dir);
    if (next === profile.roundingIncrement) return;
    const updated = { ...profile, roundingIncrement: next };
    setProfile(updated);
    await profileRepo.save(updated);
  }

  // Turning the notify switch ON is the user gesture that lets us ask for
  // browser notification permission — without it, the "Notify when rest
  // ends" toggle would persist a preference that can never actually fire.
  // Fire-and-forget: we don't block the toggle on the user's answer, and we
  // persist the preference regardless of what they choose. Never requested
  // on load or when turning the switch OFF.
  function toggleNotify() {
    const next = !settings.restTimer.notify;
    if (next && typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        void Notification.requestPermission();
      }
    }
    updateSettings({ restTimer: { ...settings.restTimer, notify: next } });
  }

  function changeRestSeconds(dir: 1 | -1) {
    const next = Math.min(
      REST_SECONDS_MAX,
      Math.max(REST_SECONDS_MIN, settings.restTimer.defaultSeconds + dir * REST_SECONDS_STEP),
    );
    updateSettings({ restTimer: { ...settings.restTimer, defaultSeconds: next } });
  }

  const roundingSteps = profile ? ROUNDING_STEPS[profile.units] : null;
  const roundingIndex =
    profile && roundingSteps ? roundingSteps.indexOf(profile.roundingIncrement) : -1;

  return (
    <main className="min-h-screen bg-[var(--bg)] px-4 py-6 text-[var(--text)] flex justify-center">
      <div className="w-full max-w-md pb-4">
        <header className="mb-4">
          <div className="text-xs font-semibold text-[var(--muted)]">Preferences</div>
          <h1 className="text-[26px] font-extrabold leading-tight">Settings</h1>
        </header>

        <div className="flex flex-col gap-3">
          <Section title="Display mode">
            <Segmented
              value={settings.displayPreset}
              options={DISPLAY_PRESETS}
              onChange={(v) => updateSettings({ displayPreset: v })}
            />
            <ToggleRow
              label="Plate breakdown"
              checked={display.plateBreakdown}
              onChange={() => toggleDisplay('plateBreakdown')}
            />
            <ToggleRow
              label="Rest timer widget"
              checked={display.restTimer}
              onChange={() => toggleDisplay('restTimer')}
            />
            <ToggleRow label="Notes" checked={display.notes} onChange={() => toggleDisplay('notes')} />
            <ToggleRow
              label="Warm-ups"
              checked={display.warmups}
              onChange={() => toggleDisplay('warmups')}
            />
            <ToggleRow
              label="Hide completed warm-ups"
              checked={settings.hideCompletedWarmups}
              onChange={() => updateSettings({ hideCompletedWarmups: !settings.hideCompletedWarmups })}
            />
            <ToggleRow
              label="Exercise demos"
              checked={settings.exerciseDemos}
              onChange={() => updateSettings({ exerciseDemos: !settings.exerciseDemos })}
            />
            <ToggleRow
              label="Bodyweight tracking"
              checked={settings.bodyweightTracking}
              onChange={() => updateSettings({ bodyweightTracking: !settings.bodyweightTracking })}
            />
          </Section>

          <Section title="Templates">
            <Segmented
              value={settings.template.selected}
              options={TEMPLATES}
              onChange={(v) => updateSettings({ template: { ...settings.template, selected: v } })}
            />
            <ToggleRow
              label="5s PRO (no AMRAP in week 3)"
              checked={settings.template.fivesPro}
              onChange={() =>
                updateSettings({ template: { ...settings.template, fivesPro: !settings.template.fivesPro } })
              }
            />
            <ToggleRow
              label="Warm-up sets"
              checked={settings.template.warmups}
              onChange={() =>
                updateSettings({ template: { ...settings.template, warmups: !settings.template.warmups } })
              }
            />
          </Section>

          <Section title="Rest timer">
            <ToggleRow
              label="Enabled"
              checked={settings.restTimer.enabled}
              onChange={() =>
                updateSettings({ restTimer: { ...settings.restTimer, enabled: !settings.restTimer.enabled } })
              }
            />
            <Stepper
              label="Default duration"
              valueLabel={formatDuration(settings.restTimer.defaultSeconds)}
              onDecrease={() => changeRestSeconds(-1)}
              onIncrease={() => changeRestSeconds(1)}
              decreaseLabel="Decrease rest timer duration"
              increaseLabel="Increase rest timer duration"
              disableDecrease={settings.restTimer.defaultSeconds <= REST_SECONDS_MIN}
              disableIncrease={settings.restTimer.defaultSeconds >= REST_SECONDS_MAX}
            />
            <ToggleRow
              label="Notify when rest ends"
              checked={settings.restTimer.notify}
              onChange={toggleNotify}
            />
          </Section>

          <Section title="Theme">
            <Segmented
              value={settings.theme}
              options={THEMES}
              onChange={(v) => updateSettings({ theme: v })}
            />
          </Section>

          <Section title="Rounding">
            {profile && roundingSteps ? (
              <Stepper
                label="Round loads to"
                valueLabel={`${profile.roundingIncrement}${profile.units}`}
                onDecrease={() => changeRounding(-1)}
                onIncrease={() => changeRounding(1)}
                decreaseLabel="Decrease rounding increment"
                increaseLabel="Increase rounding increment"
                disableDecrease={roundingIndex <= 0}
                disableIncrease={roundingIndex === -1 || roundingIndex >= roundingSteps.length - 1}
              />
            ) : (
              <p className="text-sm text-[var(--muted)]">Loading…</p>
            )}
          </Section>

          <Section title="Profile">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold">Units</span>
              <span className="text-sm font-bold text-[var(--muted)]">
                {profile ? profile.units : '—'}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold">Training Max %</span>
              <span className="text-sm font-bold text-[var(--muted)]">
                {profile ? `${Math.round(profile.tmPercent * 100)}%` : '—'}
              </span>
            </div>
            <p className="text-[12px] text-[var(--muted)]">
              Units and Training Max % are set during onboarding. Editing them here is coming soon.
            </p>
          </Section>
        </div>

        <nav className="mt-5 flex items-center justify-around text-xs font-bold text-[var(--muted)]">
          <Link to="/">Today</Link>
          <Link to="/history">History</Link>
          <span className="text-[var(--accent)]">Settings</span>
        </nav>
      </div>
    </main>
  );
}
