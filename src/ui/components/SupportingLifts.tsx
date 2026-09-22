import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { categoriesForLift, bbbFor, supportingList, SUPPORTING_CATALOG } from '../../domain';
import type { LiftKey, Unit, SupportingItem } from '../../domain';
import { customExerciseRepo, hiddenSupportingRepo, supportingDoneRepo } from '../../data/repositories';
import type { AssistanceCategory, CustomExercise, HiddenSupporting, SupportingDone } from '../../data/repositories';
import Chevron from './Chevron';

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

function draftFromRow(row: { weight: number | null; reps: number | null }): LogDraft {
  return {
    weight: row.weight === null || row.weight === undefined ? '' : String(row.weight),
    reps: row.reps === null || row.reps === undefined ? '' : String(row.reps),
  };
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
 * Collapsed-by-default "Supporting lifts" panel for a lift's cycle-overview
 * card, split into two zones once expanded:
 *
 *  - "Today's supporting work" — Boring But Big (always pinned first, same
 *    lift, 5x10 @ 50% TM) plus whichever exercises have been picked for
 *    today, each with a done checkmark, weight×reps logging, and a
 *    remove-from-today control.
 *  - "Add exercises" — the catalog + custom exercises, grouped by category
 *    (Push/Pull/Core for upper lifts, Legs/Pull/Core for lower), minus
 *    whatever's already in today's list. Picking one moves it into Today.
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
  // truth, so a reload triggered by a commit or a checkmark on one row never
  // clobbers in-flight typing in another (unblurred) field. Newly-selected
  // rows are seeded explicitly by the callers that create them.
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
      fromDb[k] = draftFromRow(d);
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
  const bbbRow = done.find((d) => d.liftKey === liftKey && d.category === bbbCategory && d.name === BBB_NAME);
  const bbbDone = bbbRow ? (bbbRow.done ?? true) : false;

  // Today's rows for this lift, excluding the pinned BBB row (BBB is always
  // shown regardless of whether it has a row yet).
  const selectedToday = done.filter(
    (d) => d.liftKey === liftKey && !(d.category === bbbCategory && d.name === BBB_NAME),
  );

  function schemeFor(category: AssistanceCategory, name: string): string {
    const catalogItem = SUPPORTING_CATALOG[category].find((i) => i.name === name);
    if (catalogItem) return catalogItem.scheme;
    const customItem = customs.find((c) => c.category === category && c.name === name);
    return customItem?.scheme ?? '';
  }

  async function markDone(category: AssistanceCategory, name: string, next: boolean) {
    await supportingDoneRepo.setDone(todayIso(), liftKey, category, name, next);
    await refresh();
  }

  async function selectItem(category: AssistanceCategory, name: string) {
    const dateStr = todayIso();
    const seed = await supportingDoneRepo.lastLogged(category, name, dateStr);
    await supportingDoneRepo.select(dateStr, liftKey, category, name, seed ?? undefined);
    const doneList = await refresh();

    // Pre-fill the local draft for the newly-selected row from whatever it
    // was seeded with, extending the initial-mount seed logic above so a
    // pick-from-catalog also lands in `logs`/`committedRef`.
    const k = logKey(category, name);
    const row = doneList.find((d) => d.liftKey === liftKey && d.category === category && d.name === name);
    if (row) {
      setLogs((prev) => ({ ...prev, [k]: draftFromRow(row) }));
      committedRef.current = { ...committedRef.current, [k]: { weight: row.weight ?? null, reps: row.reps ?? null } };
    }
  }

  async function removeToday(category: AssistanceCategory, name: string) {
    await supportingDoneRepo.deselect(todayIso(), liftKey, category, name);
    await refresh();
    const k = logKey(category, name);
    setLogs((prev) => {
      if (!(k in prev)) return prev;
      const next = { ...prev };
      delete next[k];
      return next;
    });
    committedRef.current = { ...committedRef.current, [k]: { weight: null, reps: null } };
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
    <div className="rounded-[var(--r-card)] border border-[var(--line)] bg-[var(--surface)]">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-4 py-3.5 text-left text-sm font-semibold text-[var(--accent)]"
      >
        <span>{open ? 'Hide supporting lifts' : 'Supporting lifts'}</span>
        <Chevron open={open} />
      </button>

      {open && (
        <div className="flex flex-col gap-4 px-4 pb-4">
          <div className="flex flex-col gap-2">
            <h3 className="text-[12px] font-bold uppercase tracking-wide text-[var(--muted)]">
              Today&apos;s supporting work
            </h3>

            <ul className="flex flex-col gap-1 list-none p-0 m-0">
              <li className="flex items-center gap-2 rounded-lg bg-[var(--surface-2)] px-3 py-1.5 text-[13px]">
                <input
                  type="checkbox"
                  checked={bbbDone}
                  onChange={() => markDone(bbbCategory, BBB_NAME, !bbbDone)}
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
              </li>

              {selectedToday.map((d) => {
                const checked = d.done ?? true;
                const k = logKey(d.category, d.name);
                const scheme = schemeFor(d.category, d.name);
                return (
                  <li
                    key={k}
                    className="flex items-center gap-2 rounded-lg bg-[var(--surface-2)] px-3 py-1.5 text-[13px]"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => markDone(d.category, d.name, !checked)}
                      aria-label={`Mark ${d.name} done`}
                      className="h-5 w-5 flex-none accent-[var(--accent)]"
                    />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-bold">{d.name}</span>
                      <span className="truncate text-[11px] font-semibold text-[var(--muted)]">{scheme}</span>
                    </span>
                    <input
                      id={inputId(d.category, d.name, 'weight')}
                      type="text"
                      inputMode="decimal"
                      aria-label={`${d.name} weight`}
                      value={logs[k]?.weight ?? ''}
                      onChange={(e) => updateLocalField(d.category, d.name, 'weight', e.target.value)}
                      onBlur={() => commitField(d.category, d.name, 'weight')}
                      className={`w-12 flex-none ${numberInputClass}`}
                    />
                    <span className="flex-none text-[11px] font-bold text-[var(--muted)]">{unit}</span>
                    <span className="flex-none text-[11px] font-bold text-[var(--muted)]">×</span>
                    <input
                      id={inputId(d.category, d.name, 'reps')}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      aria-label={`${d.name} reps`}
                      value={logs[k]?.reps ?? ''}
                      onChange={(e) => updateLocalField(d.category, d.name, 'reps', e.target.value)}
                      onBlur={() => commitField(d.category, d.name, 'reps')}
                      className={`w-10 flex-none ${numberInputClass}`}
                    />
                    <button
                      type="button"
                      onClick={() => removeToday(d.category, d.name)}
                      aria-label={`Remove ${d.name} from today`}
                      className="grid h-9 w-9 flex-none place-items-center rounded-[var(--r-pill)] text-[var(--muted)] hover:text-[var(--accent)]"
                    >
                      <RemoveIcon />
                    </button>
                  </li>
                );
              })}
            </ul>

            {selectedToday.length === 0 && (
              <p className="text-[12px] font-semibold text-[var(--muted)]">
                Pick exercises below to build today&apos;s list.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-3">
            <h3 className="text-[12px] font-bold uppercase tracking-wide text-[var(--muted)]">Add exercises</h3>

            {categories.map((category) => {
              const selectedNames = new Set(
                selectedToday.filter((d) => d.category === category).map((d) => d.name),
              );
              const items = supportingList(category, customs, hidden).filter(
                (item) => !selectedNames.has(item.name),
              );
              const isAdding = addingFor === category;

              return (
                <section key={category} aria-label={CATEGORY_LABEL[category]}>
                  <h3 className="text-[12px] font-bold uppercase tracking-wide text-[var(--muted)]">
                    {CATEGORY_LABEL[category]}
                  </h3>

                  <ul className="mt-1.5 flex flex-col gap-1.5 list-none p-0 m-0">
                    {items.map((item) => {
                      const k = logKey(category, item.name);
                      const confirming = pendingRemove === k;
                      return (
                        <li
                          key={item.name}
                          className="flex flex-col gap-1.5 rounded-lg bg-[var(--surface-2)] px-3 py-1.5 text-[13px]"
                        >
                          <div className="flex items-center gap-2">
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
                              <button
                                type="button"
                                onClick={() => setPendingRemove(k)}
                                aria-label={`Remove ${item.name} from list`}
                                className="grid h-9 w-9 flex-none place-items-center rounded-[var(--r-pill)] text-[var(--muted)] hover:text-[var(--accent)]"
                              >
                                <RemoveIcon />
                              </button>
                            )}
                          </div>

                          {!confirming && (
                            <button
                              type="button"
                              onClick={() => selectItem(category, item.name)}
                              aria-label={`Add ${item.name}`}
                              className="w-full rounded-lg border border-dashed border-[var(--line)] py-1.5 text-center text-[12px] font-extrabold text-[var(--accent)]"
                            >
                              ＋ Add
                            </button>
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
                        Sets × reps (optional)
                        <input
                          id={`supporting-add-scheme-${category}`}
                          type="text"
                          aria-label="Sets × reps (optional)"
                          placeholder="e.g. 3 × 8–12"
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
        </div>
      )}
    </div>
  );
}
