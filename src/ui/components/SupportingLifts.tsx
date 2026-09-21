import { useEffect, useRef, useState } from 'react';
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

type FieldKind = 'weight' | 'reps';
type LogDraft = { weight: string; reps: string };
type Baseline = { weight: number | null; reps: number | null };

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function logKey(category: AssistanceCategory, name: string): string {
  return `${category}|${name}`;
}

/** Small trash glyph for the remove control — purely decorative (`aria-hidden`); the button it sits in carries the accessible name. */
function RemoveIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 7h16" />
      <path d="M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3" />
      <path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

/**
 * Collapsed-by-default "Supporting lifts" checklist for a lift's cycle-overview
 * card: a Boring But Big row (same lift, 5x10 @ 50% TM) plus, per category
 * (Push/Pull/Core for upper lifts, Legs/Pull/Core for lower), the catalog +
 * custom exercises with done checkboxes, weight×reps logging, remove
 * (hide/delete), and an "+ Add exercise" control to add a custom one.
 */
export default function SupportingLifts({ liftKey, tm, unit, roundingIncrement }: SupportingLiftsProps) {
  const [open, setOpen] = useState(false);
  const [customs, setCustoms] = useState<CustomExercise[]>([]);
  const [hidden, setHidden] = useState<HiddenSupporting[]>([]);
  const [done, setDone] = useState<SupportingDone[]>([]);
  const [logs, setLogs] = useState<Record<string, LogDraft>>({});
  const [addingFor, setAddingFor] = useState<AssistanceCategory | null>(null);
  const [addName, setAddName] = useState('');
  const [addScheme, setAddScheme] = useState('');
  const [pendingRemove, setPendingRemove] = useState<string | null>(null);

  // The last-persisted weight/reps per key, used to decide whether a blur is a
  // genuine change (write it) or a no-op tab-through (skip the write). A ref
  // (not state) since it's only ever read/written synchronously inside event
  // handlers and shouldn't itself trigger a re-render.
  const committedRef = useRef<Record<string, Baseline>>({});
  const seededRef = useRef(false);

  // Refreshes catalog/hidden/done-state only. Deliberately does NOT touch
  // `logs` — after the initial seed, the local input state is the source of
  // truth, so a reload triggered by a commit or a toggle on one row never
  // clobbers in-flight typing in another (unblurred) field.
  async function refresh(): Promise<SupportingDone[]> {
    const [customsList, hiddenList, doneList] = await Promise.all([
      customExerciseRepo.all(),
      hiddenSupportingRepo.all(),
      supportingDoneRepo.forDate(todayIso()),
    ]);
    setCustoms(customsList);
    setHidden(hiddenList);
    setDone(doneList);
    return doneList;
  }

  async function load() {
    const doneList = await refresh();
    if (seededRef.current) return;
    seededRef.current = true;

    const mine = doneList.filter((d) => d.liftKey === liftKey);
    const fromDb: Record<string, LogDraft> = {};
    const baseline: Record<string, Baseline> = {};
    for (const d of mine) {
      const k = logKey(d.category, d.name);
      fromDb[k] = {
        weight: d.weight === null || d.weight === undefined ? '' : String(d.weight),
        reps: d.reps === null || d.reps === undefined ? '' : String(d.reps),
      };
      baseline[k] = { weight: d.weight ?? null, reps: d.reps ?? null };
    }
    setLogs(fromDb);
    committedRef.current = baseline;
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const categories = categoriesForLift(liftKey);
  const bbbCategory = categories[0] ?? 'push';
  const bbbWeight = bbbFor(tm, roundingIncrement);
  const bbbKey = logKey(bbbCategory, BBB_NAME);
  const bbbDone = done.some((d) => d.category === bbbCategory && d.name === BBB_NAME && d.liftKey === liftKey);

  async function toggleDone(category: AssistanceCategory, name: string) {
    await supportingDoneRepo.toggle(todayIso(), liftKey, category, name);
    const doneList = await refresh();
    const k = logKey(category, name);
    const stillThere = doneList.some(
      (d) => d.liftKey === liftKey && d.category === category && d.name === name,
    );
    // toggle() only ever adds a null/null row or deletes the row entirely, so
    // either way the persisted baseline for this key is now null/null.
    committedRef.current = { ...committedRef.current, [k]: { weight: null, reps: null } };
    if (!stillThere) {
      // Turned off: clear any local draft so a stale typed value doesn't
      // linger in the input after the row is gone.
      setLogs((prev) => {
        if (!(k in prev)) return prev;
        const next = { ...prev };
        delete next[k];
        return next;
      });
    }
  }

  function updateLocalField(category: AssistanceCategory, name: string, field: FieldKind, value: string) {
    const k = logKey(category, name);
    setLogs((prev) => {
      const existing = prev[k] ?? { weight: '', reps: '' };
      return { ...prev, [k]: { ...existing, [field]: value } };
    });
  }

  async function commitField(category: AssistanceCategory, name: string, field: FieldKind) {
    const k = logKey(category, name);
    const raw = (logs[k]?.[field] ?? '').trim();
    const parsed = raw === '' ? null : Number(raw.replace(',', '.'));
    const safeParsed = parsed === null || Number.isNaN(parsed) ? null : parsed;

    const baseline = committedRef.current[k] ?? { weight: null, reps: null };
    if (baseline[field] === safeParsed) return; // untouched / unchanged: no-op, never creates a row

    const patch = field === 'weight' ? { weight: safeParsed } : { reps: safeParsed };
    await supportingDoneRepo.log(todayIso(), liftKey, category, name, patch);
    committedRef.current = { ...committedRef.current, [k]: { ...baseline, [field]: safeParsed } };
    await refresh();
  }

  function inputId(category: AssistanceCategory, name: string, field: FieldKind): string {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    return `supporting-${liftKey}-${category}-${slug}-${field}`;
  }

  async function removeItem(category: AssistanceCategory, item: SupportingItem) {
    if (item.custom) {
      const match = customs.find((c) => c.category === category && c.name === item.name);
      if (match?.id !== undefined) await customExerciseRepo.remove(match.id);
    } else {
      await hiddenSupportingRepo.add(category, item.name);
    }
    await refresh();
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
    await refresh();
    setAddingFor(null);
    setAddName('');
    setAddScheme('');
  }

  const numberInputClass =
    'rounded-lg border border-[var(--line)] bg-[var(--surface)] px-1.5 py-1 text-center text-sm font-bold text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] appearance-none [-moz-appearance:textfield] [&::-webkit-outer-spin-button]:m-0 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none';

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
        <div className="mt-3 flex flex-col gap-3">
          <div className="flex items-center gap-2 rounded-lg bg-[var(--surface-2)] px-3 py-1.5 text-[13px]">
            <input
              type="checkbox"
              checked={bbbDone}
              onChange={() => toggleDone(bbbCategory, BBB_NAME)}
              aria-label={`Mark ${BBB_NAME} done`}
              className="h-5 w-5 flex-none accent-[var(--accent)]"
            />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-extrabold">{BBB_NAME}</span>
              <span className="truncate text-[11px] font-semibold text-[var(--muted)] tabular-nums">
                same lift, for size · 5 × 10
              </span>
            </span>
            <input
              id={inputId(bbbCategory, BBB_NAME, 'weight')}
              type="text"
              inputMode="decimal"
              aria-label={`${BBB_NAME} weight`}
              placeholder={String(bbbWeight)}
              value={logs[bbbKey]?.weight ?? ''}
              onChange={(e) => updateLocalField(bbbCategory, BBB_NAME, 'weight', e.target.value)}
              onBlur={() => commitField(bbbCategory, BBB_NAME, 'weight')}
              className={`w-12 flex-none ${numberInputClass}`}
            />
            <span className="flex-none text-[11px] font-bold text-[var(--muted)]">{unit}</span>
            <span className="flex-none text-[11px] font-bold text-[var(--muted)]">×</span>
            <input
              id={inputId(bbbCategory, BBB_NAME, 'reps')}
              type="number"
              inputMode="numeric"
              min={0}
              aria-label={`${BBB_NAME} reps`}
              placeholder="10"
              value={logs[bbbKey]?.reps ?? ''}
              onChange={(e) => updateLocalField(bbbCategory, BBB_NAME, 'reps', e.target.value)}
              onBlur={() => commitField(bbbCategory, BBB_NAME, 'reps')}
              className={`w-10 flex-none ${numberInputClass}`}
            />
          </div>

          {categories.map((category) => {
            const items = supportingList(category, customs, hidden);
            const isAdding = addingFor === category;

            return (
              <section key={category} aria-label={CATEGORY_LABEL[category]}>
                <h3 className="text-[12px] font-bold uppercase tracking-wide text-[var(--muted)]">
                  {CATEGORY_LABEL[category]}
                </h3>

                <ul className="mt-1.5 flex flex-col gap-1 list-none p-0 m-0">
                  {items.map((item) => {
                    const checked = done.some(
                      (d) => d.category === category && d.name === item.name && d.liftKey === liftKey,
                    );
                    const k = logKey(category, item.name);
                    const confirming = pendingRemove === k;
                    return (
                      <li
                        key={item.name}
                        className="flex items-center gap-2 rounded-lg bg-[var(--surface-2)] px-3 py-1.5 text-[13px]"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleDone(category, item.name)}
                          aria-label={`Mark ${item.name} done`}
                          className="h-5 w-5 flex-none accent-[var(--accent)]"
                        />
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="font-bold">{item.name}</span>
                          <span className="truncate text-[11px] font-semibold text-[var(--muted)]">
                            {item.scheme}
                          </span>
                        </span>

                        {confirming ? (
                          <span className="flex flex-none items-center gap-1.5">
                            <span className="text-[11px] font-semibold text-[var(--muted)]">Remove?</span>
                            <button
                              type="button"
                              onClick={() => setPendingRemove(null)}
                              className="rounded-[var(--r-pill)] px-2 py-1 text-[11px] font-bold text-[var(--muted)] hover:text-[var(--text)]"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                removeItem(category, item);
                                setPendingRemove(null);
                              }}
                              aria-label={`Confirm remove ${item.name}`}
                              className="rounded-[var(--r-pill)] bg-[var(--accent)] px-2 py-1 text-[11px] font-extrabold text-[var(--on-accent)]"
                            >
                              Remove
                            </button>
                          </span>
                        ) : (
                          <>
                            <input
                              id={inputId(category, item.name, 'weight')}
                              type="text"
                              inputMode="decimal"
                              aria-label={`${item.name} weight`}
                              value={logs[k]?.weight ?? ''}
                              onChange={(e) => updateLocalField(category, item.name, 'weight', e.target.value)}
                              onBlur={() => commitField(category, item.name, 'weight')}
                              className={`w-12 flex-none ${numberInputClass}`}
                            />
                            <span className="flex-none text-[11px] font-bold text-[var(--muted)]">{unit}</span>
                            <span className="flex-none text-[11px] font-bold text-[var(--muted)]">×</span>
                            <input
                              id={inputId(category, item.name, 'reps')}
                              type="number"
                              inputMode="numeric"
                              min={0}
                              aria-label={`${item.name} reps`}
                              value={logs[k]?.reps ?? ''}
                              onChange={(e) => updateLocalField(category, item.name, 'reps', e.target.value)}
                              onBlur={() => commitField(category, item.name, 'reps')}
                              className={`w-10 flex-none ${numberInputClass}`}
                            />
                            <button
                              type="button"
                              onClick={() => setPendingRemove(k)}
                              aria-label={`Remove ${item.name}`}
                              className="grid h-9 w-9 flex-none place-items-center rounded-[var(--r-pill)] text-[var(--muted)] hover:text-[var(--accent)]"
                            >
                              <RemoveIcon />
                            </button>
                          </>
                        )}
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
