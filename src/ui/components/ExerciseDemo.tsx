import { useState } from 'react';
import type { LiftKey } from '../../domain';
import { getExerciseDemo } from '../../domain';
import Chevron from './Chevron';

export interface ExerciseDemoProps {
  liftKey: LiftKey;
}

const IMAGE_LABELS = ['Start', 'Finish'];

/**
 * Collapsed-by-default "How to perform" panel for the selected lift: two
 * bundled reference images (start/finish position) and numbered form cues.
 * Images and instructions are bundled at build time (Plan 4 Task 1) — no
 * runtime fetch, so this works fully offline.
 */
export default function ExerciseDemo({ liftKey }: ExerciseDemoProps) {
  const demo = getExerciseDemo(liftKey);
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-[var(--r-card)] border border-[var(--line)] bg-[var(--surface)]">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-4 py-3.5 text-left text-sm font-semibold text-[var(--accent)]"
      >
        <span>{open ? 'Hide how to perform' : 'How to perform'}</span>
        <Chevron open={open} />
      </button>

      {open && (
        <div className="flex flex-col gap-3 px-4 pb-4">
          <h2 className="text-base font-extrabold">{demo.name}</h2>

          <div className="grid grid-cols-2 gap-2">
            {demo.images.map((src, i) => (
              <figure key={src} className="m-0">
                <img
                  src={src}
                  loading="lazy"
                  alt={`${demo.name} — ${IMAGE_LABELS[i] ?? `step ${i + 1}`}`}
                  className="w-full rounded-[var(--r-card)] border border-[var(--line)] bg-[var(--surface-2)] object-cover"
                />
                <figcaption className="mt-1 text-center text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">
                  {IMAGE_LABELS[i] ?? `Step ${i + 1}`}
                </figcaption>
              </figure>
            ))}
          </div>

          <ol className="flex flex-col gap-2 pl-5 text-sm text-[var(--text)]">
            {demo.instructions.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>

          <p className="text-[11px] text-[var(--muted)]">
            Exercise guides from free-exercise-db (public domain)
          </p>
        </div>
      )}
    </div>
  );
}
