import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { ASSISTANCE_CATALOG, exerciseOptions } from '../../domain/assistanceCatalog';
import { assistanceRepo, customExerciseRepo } from '../../data/repositories';
import type { AssistanceCategory, AssistanceEntry, CustomExercise } from '../../data/repositories';

const CATEGORY_LABEL: Record<AssistanceCategory, string> = {
  push: 'Push',
  pull: 'Pull',
  legs: 'Legs',
  core: 'Core',
};

const CATEGORIES = Object.keys(ASSISTANCE_CATALOG) as AssistanceCategory[];

const ADD_CUSTOM_VALUE = '__add_custom__';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Home-screen "Assistance" section: category picker + built-in/custom
 * exercise select + sets x reps (+ optional weight), logged to today's
 * list. Gated behind `settings.assistanceTracking` by the caller (Home.tsx).
 */
export default function AssistanceSection() {
  const [customs, setCustoms] = useState<CustomExercise[]>([]);
  const [entries, setEntries] = useState<AssistanceEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  const [category, setCategory] = useState<AssistanceCategory>('push');
  const [name, setName] = useState('');
  const [addingCustom, setAddingCustom] = useState(false);
  const [customName, setCustomName] = useState('');
  const [sets, setSets] = useState('');
  const [reps, setReps] = useState('');
  const [weight, setWeight] = useState('');

  async function load() {
    const [customsList, todaysEntries] = await Promise.all([
      customExerciseRepo.all(),
      assistanceRepo.forDate(todayIso()),
    ]);
    setCustoms(customsList);
    setEntries(todaysEntries);
    setLoaded(true);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [customsList, todaysEntries] = await Promise.all([
        customExerciseRepo.all(),
        assistanceRepo.forDate(todayIso()),
      ]);
      if (cancelled) return;
      setCustoms(customsList);
      setEntries(todaysEntries);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const options = exerciseOptions(category, customs);

  function selectCategory(next: AssistanceCategory) {
    setCategory(next);
    setName('');
    setAddingCustom(false);
    setCustomName('');
  }

  function handleSelectChange(value: string) {
    if (value === ADD_CUSTOM_VALUE) {
      setAddingCustom(true);
      setCustomName('');
      return;
    }
    setAddingCustom(false);
    setName(value);
  }

  async function handleAddCustom(e: FormEvent) {
    e.preventDefault();
    const trimmed = customName.trim();
    if (!trimmed) return;
    await customExerciseRepo.add({ category, name: trimmed });
    await load();
    setName(trimmed);
    setAddingCustom(false);
    setCustomName('');
  }

  async function handleAdd() {
    const setsNum = Number(sets);
    const repsNum = Number(reps);
    if (!name || !Number.isFinite(setsNum) || setsNum <= 0 || !Number.isFinite(repsNum) || repsNum <= 0) {
      return;
    }
    const weightNum = weight.trim() ? Number(weight) : null;
    await assistanceRepo.add({
      date: todayIso(),
      category,
      name,
      sets: setsNum,
      reps: repsNum,
      weight: weightNum,
    });
    setSets('');
    setReps('');
    setWeight('');
    await load();
  }

  return (
    <section className="mt-4 rounded-[var(--r-card)] border border-[var(--line)] bg-[var(--surface)] p-4">
      <h2 className="text-base font-extrabold">Assistance</h2>

      <div className="mt-3 grid grid-cols-4 gap-1.5" role="group" aria-label="Assistance category">
        {CATEGORIES.map((cat) => {
          const isSelected = category === cat;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => selectCategory(cat)}
              aria-pressed={isSelected}
              className={
                'rounded-[var(--r-pill)] border px-2 py-1.5 text-[12px] font-bold transition-colors ' +
                (isSelected
                  ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                  : 'border-[var(--line)] bg-[var(--surface-2)] text-[var(--text)]')
              }
            >
              {CATEGORY_LABEL[cat]}
            </button>
          );
        })}
      </div>

      <label htmlFor="assistance-exercise-select" className="mt-3 block text-[12px] font-semibold text-[var(--muted)]">
        Exercise
        <select
          id="assistance-exercise-select"
          aria-label="Exercise"
          value={addingCustom ? ADD_CUSTOM_VALUE : name}
          onChange={(e) => handleSelectChange(e.target.value)}
          className="mt-1 w-full rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-2 py-1.5 text-sm font-bold text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
        >
          <option value="" disabled>
            Select an exercise…
          </option>
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
          <option value={ADD_CUSTOM_VALUE}>＋ Add custom…</option>
        </select>
      </label>

      {addingCustom && (
        <form onSubmit={handleAddCustom} className="mt-2 flex items-end gap-2">
          <label htmlFor="assistance-custom-name" className="flex flex-1 flex-col text-[12px] font-semibold text-[var(--muted)]">
            Custom exercise name
            <input
              id="assistance-custom-name"
              type="text"
              aria-label="Custom exercise name"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-2 py-1.5 text-sm font-bold text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
          </label>
          <button
            type="submit"
            className="rounded-[var(--r-pill)] bg-[var(--accent)] px-3 py-1.5 text-[12px] font-extrabold text-[var(--on-accent)]"
          >
            Add exercise
          </button>
        </form>
      )}

      <div className="mt-3 grid grid-cols-3 gap-2">
        <label htmlFor="assistance-sets" className="flex flex-col text-[12px] font-semibold text-[var(--muted)]">
          Sets
          <input
            id="assistance-sets"
            type="number"
            inputMode="numeric"
            min={0}
            aria-label="Sets"
            value={sets}
            onChange={(e) => setSets(e.target.value)}
            className="mt-1 w-full rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-2 py-1.5 text-center font-bold text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          />
        </label>
        <label htmlFor="assistance-reps" className="flex flex-col text-[12px] font-semibold text-[var(--muted)]">
          Reps
          <input
            id="assistance-reps"
            type="number"
            inputMode="numeric"
            min={0}
            aria-label="Reps"
            value={reps}
            onChange={(e) => setReps(e.target.value)}
            className="mt-1 w-full rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-2 py-1.5 text-center font-bold text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          />
        </label>
        <label htmlFor="assistance-weight" className="flex flex-col text-[12px] font-semibold text-[var(--muted)]">
          Weight (optional)
          <input
            id="assistance-weight"
            type="number"
            inputMode="decimal"
            min={0}
            aria-label="Weight (optional)"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            className="mt-1 w-full rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-2 py-1.5 text-center font-bold text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          />
        </label>
      </div>

      <button
        type="button"
        onClick={handleAdd}
        className="mt-3 w-full rounded-[var(--r-pill)] bg-[var(--accent)] py-2 text-[13px] font-extrabold text-[var(--on-accent)]"
      >
        Add
      </button>

      <div className="mt-4">
        <h3 className="text-[12px] font-bold uppercase tracking-wide text-[var(--muted)]">Today</h3>
        {loaded && entries.length === 0 ? (
          <p className="mt-1.5 text-sm text-[var(--muted)]">No assistance logged today.</p>
        ) : (
          <ul className="mt-1.5 flex flex-col gap-1.5 list-none p-0 m-0">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className="flex items-center justify-between rounded-lg bg-[var(--surface-2)] px-3 py-2 text-[13px]"
              >
                <span className="font-bold">
                  {CATEGORY_LABEL[entry.category]} · {entry.name}
                </span>
                <span className="font-semibold text-[var(--muted)] tabular-nums">
                  {entry.sets} × {entry.reps}
                  {entry.weight != null ? ` · ${entry.weight}` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
