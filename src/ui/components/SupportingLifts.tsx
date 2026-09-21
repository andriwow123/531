import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { categoriesForLift, bbbFor, supportingList } from '../../domain';
import type { LiftKey, Unit, SupportingItem } from '../../domain';
import { customExerciseRepo, hiddenSupportingRepo, supportingDoneRepo } from '../../data/repositories';
import type { AssistanceCategory, CustomExercise, HiddenSupporting, SupportingDone } from '../../data/repositories';

export interface SupportingLiftsProps {
  liftKey: LiftKey;
  tm: number;
  unit: Unit;
  roundingIncrement: number;
}

const CATEGORY_LABEL: Record<AssistanceCategory, string> = {
  push: 'Push',
  pull: 'Pull',
  legs: 'Legs',
  core: 'Core',
};

const BBB_NAME = 'Boring But Big';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Collapsed-by-default "Supporting lifts" checklist for a lift's cycle-overview
 * card: a Boring But Big row (same lift, 5x10 @ 50% TM) plus, per category
 * (Push/Pull/Core for upper lifts, Legs/Pull/Core for lower), the catalog +
 * custom exercises with done checkboxes, remove (hide/delete), and an
 * "+ Add exercise" control to add a custom one.
 */
export default function SupportingLifts({ liftKey, tm, unit, roundingIncrement }: SupportingLiftsProps) {
  const [open, setOpen] = useState(false);
  const [customs, setCustoms] = useState<CustomExercise[]>([]);
  const [hidden, setHidden] = useState<HiddenSupporting[]>([]);
  const [done, setDone] = useState<SupportingDone[]>([]);
  const [addingFor, setAddingFor] = useState<AssistanceCategory | null>(null);
  const [addName, setAddName] = useState('');
  const [addScheme, setAddScheme] = useState('');

  async function load() {
    const [customsList, hiddenList, doneList] = await Promise.all([
      customExerciseRepo.all(),
      hiddenSupportingRepo.all(),
      supportingDoneRepo.forDate(todayIso()),
    ]);
    setCustoms(customsList);
    setHidden(hiddenList);
    setDone(doneList);
  }

  useEffect(() => {
    load();
  }, []);

  const categories = categoriesForLift(liftKey);
  const bbbCategory = categories[0] ?? 'push';
  const bbbWeight = bbbFor(tm, roundingIncrement);
  const bbbDone = done.some((d) => d.category === bbbCategory && d.name === BBB_NAME);

  async function toggleDone(category: AssistanceCategory, name: string) {
    await supportingDoneRepo.toggle(todayIso(), liftKey, category, name);
    await load();
  }

  async function removeItem(category: AssistanceCategory, item: SupportingItem) {
    if (item.custom) {
      const match = customs.find((c) => c.category === category && c.name === item.name);
      if (match?.id !== undefined) await customExerciseRepo.remove(match.id);
    } else {
      await hiddenSupportingRepo.add(category, item.name);
    }
    await load();
  }

  function startAdding(category: AssistanceCategory) {
    setAddingFor(category);
    setAddName('');
    setAddScheme('');
  }

  async function submitAdd(e: FormEvent, category: AssistanceCategory) {
    e.preventDefault();
    const name = addName.trim();
    if (!name) return;
    const scheme = addScheme.trim();
    await customExerciseRepo.add(scheme ? { category, name, scheme } : { category, name });
    await load();
    setAddingFor(null);
    setAddName('');
    setAddScheme('');
  }

  return (
    <div className="rounded-[var(--r-card)] border border-[var(--line)] bg-[var(--surface)] p-4">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="text-sm font-semibold text-[var(--accent)]"
      >
        {open ? 'Hide supporting lifts' : 'Supporting lifts'}
      </button>

      {open && (
        <div className="mt-3 flex flex-col gap-4">
          <label className="flex items-center justify-between gap-2 rounded-lg bg-[var(--surface-2)] px-3 py-2 text-[13px]">
            <span className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={bbbDone}
                onChange={() => toggleDone(bbbCategory, BBB_NAME)}
                aria-label={`Mark ${BBB_NAME} done`}
                className="h-5 w-5 accent-[var(--accent)]"
              />
              <span>
                <span className="font-extrabold">{BBB_NAME}</span>{' '}
                <span className="text-[12px] font-semibold text-[var(--muted)]">same lift, for size</span>
              </span>
            </span>
            <span className="font-semibold text-[var(--muted)] tabular-nums">
              5 × 10 @ {bbbWeight} {unit}
            </span>
          </label>

          {categories.map((category) => {
            const items = supportingList(category, customs, hidden);
            const isAdding = addingFor === category;

            return (
              <section key={category} aria-label={CATEGORY_LABEL[category]}>
                <h3 className="text-[12px] font-bold uppercase tracking-wide text-[var(--muted)]">
                  {CATEGORY_LABEL[category]}
                </h3>

                <ul className="mt-1.5 flex flex-col gap-1.5 list-none p-0 m-0">
                  {items.map((item) => {
                    const checked = done.some((d) => d.category === category && d.name === item.name);
                    return (
                      <li
                        key={item.name}
                        className="flex items-center justify-between gap-2 rounded-lg bg-[var(--surface-2)] px-3 py-2 text-[13px]"
                      >
                        <span className="flex flex-1 items-center gap-2">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleDone(category, item.name)}
                            aria-label={`Mark ${item.name} done`}
                            className="h-5 w-5 accent-[var(--accent)]"
                          />
                          <span className="font-bold">{item.name}</span>
                        </span>
                        <span className="font-semibold text-[var(--muted)] tabular-nums">{item.scheme}</span>
                        <button
                          type="button"
                          onClick={() => removeItem(category, item)}
                          aria-label={`Remove ${item.name}`}
                          className="px-1 text-base font-bold leading-none text-[var(--muted)]"
                        >
                          ×
                        </button>
                      </li>
                    );
                  })}
                </ul>

                {isAdding ? (
                  <form onSubmit={(e) => submitAdd(e, category)} className="mt-2 flex items-end gap-2">
                    <label
                      htmlFor={`supporting-add-name-${category}`}
                      className="flex flex-1 flex-col text-[12px] font-semibold text-[var(--muted)]"
                    >
                      Exercise name
                      <input
                        id={`supporting-add-name-${category}`}
                        type="text"
                        aria-label="Exercise name"
                        value={addName}
                        onChange={(e) => setAddName(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-2 py-1.5 text-sm font-bold text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                      />
                    </label>
                    <label
                      htmlFor={`supporting-add-scheme-${category}`}
                      className="flex flex-col text-[12px] font-semibold text-[var(--muted)]"
                    >
                      Scheme (optional)
                      <input
                        id={`supporting-add-scheme-${category}`}
                        type="text"
                        aria-label="Scheme (optional)"
                        value={addScheme}
                        onChange={(e) => setAddScheme(e.target.value)}
                        className="mt-1 w-24 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-2 py-1.5 text-sm font-bold text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                      />
                    </label>
                    <button
                      type="submit"
                      className="rounded-[var(--r-pill)] bg-[var(--accent)] px-3 py-1.5 text-[12px] font-extrabold text-[var(--on-accent)]"
                    >
                      Add
                    </button>
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={() => startAdding(category)}
                    className="mt-2 text-[12px] font-semibold text-[var(--accent)]"
                  >
                    ＋ Add exercise
                  </button>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
