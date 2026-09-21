import { useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { LiftKey } from '../../domain';
import { finalDropIndex } from './OrderableList';

export interface DayStripProps {
  lifts: { key: LiftKey; label: string }[];
  activeDay: number;
  doneKeys: Set<LiftKey>;
  onSelect: (index: number) => void;
  /** Reorders the chips (e.g. drag): `from`/`to` are FINAL post-removal
   *  indices, as `moveItem(order, from, to)` expects. Optional — DayStrip
   *  still works as tap-only select when omitted. */
  onReorder?: (from: number, to: number) => void;
}

/** Pixels of horizontal pointer movement before a press-and-hold on a chip
 *  becomes a drag (reorder) rather than a tap (select). */
const DRAG_THRESHOLD_PX = 6;

interface DragState {
  pointerId: number;
  startIndex: number;
  startX: number;
  dragging: boolean;
  currentIndex: number;
}

/**
 * The 4 day chips: tap one to select it, or press-and-drag one horizontally
 * to reorder it (mouse + touch, via the Pointer Events API). A drag is only
 * recognized once the pointer has moved past `DRAG_THRESHOLD_PX` — short of
 * that, releasing the pointer is a tap and selects the day as before.
 *
 * Drag target detection reads chip positions via `getBoundingClientRect`
 * (guarded so 0-size/absent rects in jsdom don't throw or produce a bogus
 * target). The raw target read this way is a "drop before original chip N"
 * index in the pre-removal list; `finalDropIndex` (shared with
 * `OrderableList`) converts it into the post-removal index `onReorder`
 * expects, so this reuses the exact fix for the downward-drag off-by-one.
 *
 * Tap-vs-drag is resolved once per gesture: a genuine drag calls `onReorder`
 * and never also calls `onSelect` for that gesture (and vice versa), whether
 * the tap arrives via pointer events or a plain `click` (e.g. keyboard
 * Enter/Space activation, which never fires pointer events at all).
 */
export default function DayStrip({ lifts, activeDay, doneKeys, onSelect, onReorder }: DayStripProps) {
  const chipRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const dragRef = useRef<DragState | null>(null);
  // Set right after a drag-driven pointerup so the click event browsers fire
  // immediately afterward (mouse and touch both do this) doesn't also select.
  const suppressClickRef = useRef(false);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);

  function targetIndexFromX(clientX: number, fallback: number): number {
    const rects = chipRefs.current.map((el) => el?.getBoundingClientRect() ?? null);
    const hasLayout = rects.some((r) => r != null && r.width > 0);
    if (!hasLayout) return fallback;
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      if (r == null) continue;
      if (clientX < r.left + r.width / 2) return i;
    }
    // Past every chip's midpoint: "drop after the last chip" is a raw target
    // of `rects.length` (one past the last valid pre-removal index), not
    // `rects.length - 1` — `finalDropIndex` expects that convention (see its
    // doc comment in OrderableList.tsx) to be able to land a drag on the
    // LAST slot. Capping here at `rects.length - 1` previously made the last
    // position unreachable.
    return rects.length;
  }

  function handlePointerDown(e: ReactPointerEvent<HTMLButtonElement>, index: number) {
    dragRef.current = {
      pointerId: e.pointerId,
      startIndex: index,
      startX: e.clientX,
      dragging: false,
      currentIndex: index,
    };
    if (typeof e.currentTarget.setPointerCapture === 'function') {
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Some environments (e.g. jsdom) don't implement pointer capture.
      }
    }
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    if (!drag.dragging) {
      if (Math.abs(e.clientX - drag.startX) < DRAG_THRESHOLD_PX) return;
      drag.dragging = true;
      setDraggingIndex(drag.startIndex);
    }
    drag.currentIndex = targetIndexFromX(e.clientX, drag.currentIndex);
  }

  function endDrag(e: ReactPointerEvent<HTMLButtonElement>, index: number) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    if (typeof e.currentTarget.releasePointerCapture === 'function') {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // no-op
      }
    }
    dragRef.current = null;
    setDraggingIndex(null);
    suppressClickRef.current = true;
    if (drag.dragging) {
      const to = finalDropIndex(drag.startIndex, drag.currentIndex);
      if (to !== drag.startIndex) onReorder?.(drag.startIndex, to);
    } else {
      onSelect(index);
    }
  }

  function handleClick(index: number) {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    onSelect(index);
  }

  return (
    <div className="grid grid-cols-4 gap-1.5" role="group" aria-label="Training day">
      {lifts.map(({ key, label }, index) => {
        const active = index === activeDay;
        const done = doneKeys.has(key);
        const dragging = draggingIndex === index;
        return (
          <button
            key={key}
            type="button"
            ref={(el) => {
              chipRefs.current[index] = el;
            }}
            style={{ touchAction: 'none' }}
            onPointerDown={(e) => handlePointerDown(e, index)}
            onPointerMove={handlePointerMove}
            onPointerUp={(e) => endDrag(e, index)}
            onPointerCancel={(e) => endDrag(e, index)}
            onClick={() => handleClick(index)}
            aria-current={active ? 'true' : undefined}
            className={'relative rounded-[var(--r-card)] border px-1.5 py-2 text-center text-[12px] font-bold leading-tight transition-colors ' +
              (dragging ? 'opacity-70 ' : '') +
              (active ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]' : 'border-[var(--line)] bg-[var(--surface)] text-[var(--muted)]')}>
            {label}
            {done && <span aria-label="done" className="ml-1 text-[var(--accent)]">✓</span>}
          </button>
        );
      })}
    </div>
  );
}
