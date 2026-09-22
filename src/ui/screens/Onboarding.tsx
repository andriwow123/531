import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { computeTrainingMax } from '../../domain';
import type { LiftKey, Unit } from '../../domain';
import { profileRepo, liftRepo, cycleRepo } from '../../data/repositories';
import type { Lift } from '../../data/repositories';
import { defaultSettings } from '../../settings/schema';

// The owner's saved tmPercent is metadata only — Onboarding now takes the
// training max directly from the user, with no percentage reduction applied.
const TM_PERCENT_METADATA = 0.85;

const LIFT_ORDER: LiftKey[] = ['press', 'bench', 'squat', 'deadlift'];

const LIFT_META: Record<LiftKey, { name: string; category: 'upper' | 'lower' }> = {
  press: { name: 'Overhead Press', category: 'upper' },
  bench: { name: 'Bench Press', category: 'upper' },
  squat: { name: 'Squat', category: 'lower' },
  deadlift: { name: 'Deadlift', category: 'lower' },
};

function incrementFor(category: 'upper' | 'lower', units: Unit): number {
  if (category === 'upper') return units === 'kg' ? 2.5 : 5;
  return units === 'kg' ? 5 : 10;
}

function roundingIncrementFor(units: Unit): number {
  return units === 'kg' ? 2.5 : 5;
}

export default function Onboarding() {
  const navigate = useNavigate();
  const [units, setUnits] = useState<Unit>('kg');
  const [tms, setTms] = useState<Record<LiftKey, string>>({
    press: '',
    bench: '',
    squat: '',
    deadlift: '',
  });

  function parseEnteredNumber(value: string): number {
    return Number(value.replace(',', '.'));
  }

  function handleTmChange(key: LiftKey, value: string) {
    setTms((prev) => ({ ...prev, [key]: value }));
  }

  const allTmsValid = LIFT_ORDER.every((key) => {
    const n = parseEnteredNumber(tms[key]);
    return tms[key].trim() !== '' && Number.isFinite(n) && n > 0;
  });

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!allTmsValid) return;

    const roundingIncrement = roundingIncrementFor(units);
    const tm: Record<LiftKey, number> = { press: 0, bench: 0, squat: 0, deadlift: 0 };
    const lifts: Lift[] = LIFT_ORDER.map((key) => {
      const meta = LIFT_META[key];
      const enteredTm = parseEnteredNumber(tms[key]);
      const increment = incrementFor(meta.category, units);
      // Entered value IS the training max — round to the increment, no % reduction.
      const trainingMax = computeTrainingMax(enteredTm, 1, roundingIncrement);
      tm[key] = trainingMax;
      return { key, name: meta.name, category: meta.category, oneRm: trainingMax, trainingMax, increment };
    });

    await Promise.all([
      profileRepo.save({ id: 'me', units, roundingIncrement, tmPercent: TM_PERCENT_METADATA }),
      liftRepo.bulkSave(lifts),
      cycleRepo.add({
        index: 1,
        startedAt: new Date().toISOString(),
        status: 'active',
        template: defaultSettings.template.selected,
        fivesPro: defaultSettings.template.fivesPro,
        tm,
      }),
    ]);

    navigate('/');
  }

  return (
    <main className="min-h-screen bg-[var(--bg)] text-[var(--text)] px-4 py-8 flex justify-center">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-extrabold tracking-tight">Let's set up your training</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Enter your training max for each lift. We'll start Cycle 1, Week 1 from there.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="rounded-[var(--r-card)] bg-[var(--surface)] border border-[var(--line)] p-4">
            <span className="block text-sm font-semibold mb-2">Units</span>
            <div className="inline-flex rounded-[var(--r-pill)] bg-[var(--surface-2)] p-1">
              {(['kg', 'lb'] as Unit[]).map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setUnits(u)}
                  aria-pressed={units === u}
                  className={
                    'px-4 py-1.5 rounded-[var(--r-pill)] text-sm font-semibold transition-colors ' +
                    (units === u
                      ? 'bg-[var(--accent)] text-[var(--on-accent)]'
                      : 'text-[var(--muted)]')
                  }
                >
                  {u}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-[var(--r-card)] bg-[var(--surface)] border border-[var(--line)] p-4 space-y-3">
            <span className="block text-sm font-semibold">Training max</span>
            {LIFT_ORDER.map((key) => (
              <div key={key} className="block">
                <span className="block text-sm text-[var(--muted)] mb-1">
                  {LIFT_META[key].name}
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  aria-label={`Training max for ${key} in ${units}`}
                  value={tms[key]}
                  onChange={(e) => handleTmChange(key, e.target.value)}
                  className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                />
              </div>
            ))}
          </div>

          <button
            type="submit"
            disabled={!allTmsValid}
            className="w-full rounded-[var(--r-pill)] bg-[var(--accent)] text-[var(--on-accent)] font-bold py-3 text-base disabled:opacity-60"
          >
            Start training
          </button>
          {!allTmsValid && (
            <p className="text-center text-[12px] font-semibold text-[var(--accent)]">
              Enter a training max greater than 0 for every lift to continue.
            </p>
          )}

          <p className="text-center text-xs text-[var(--muted)]">
            Your training max is the weight your working sets are based on — most start around
            85–90% of their best single lift. Advanced setup lives in Settings.
          </p>
        </form>
      </div>
    </main>
  );
}
