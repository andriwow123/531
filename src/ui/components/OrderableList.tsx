import { useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

interface OrderableListProps<T> {
  items: T[];
  getKey: (item: T) => string;
  getLabel: (item: T) => string;
  /** Called with the pre-move indices of the item being reordered. Consumers
   *  are expected to apply this via `moveItem(order, from, to)`. */
  onReorder: (from: number, to: number) => void;
}

/**
 * A small, self-contained vertical sortable list. Reordering happens two ways:
 *  - a pointer drag on each row's grip handle (mouse + touch, via the Pointer
 *    Events API — `touch-action: none` on the handle stops touch-drag from
 *    also scrolling the page);
 *  - "Move up"/"Move down" buttons on every row, the accessible/keyboard and
 *    no-layout (e.g. jsdom) fallback.
 * Both paths funnel through the same `onReorder(from, to)` callback.
 *
 * Drag target detection reads row positions via `getBoundingClientRect`. In
 * environments with no real layout (rects all zero-size), it's a no-op rather
 * than throwing or guessing a bogus target.
 */
export function OrderableList<T>({ items, getKey, getLabel, onReorder }: OrderableListProps<T>) {
  const rowRefs = useRef<Array<HTMLDivElement | null>>([]);
  const dragRef = useRef<{ pointerId: number; startIndex: number; currentIndex: number } | null>(
    null,
  );
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  function targetIndexFromY(clientY: number, fallback: number): number {
    const rects = rowRefs.current.map((el) => el?.getBoundingClientRect() ?? null);
    const hasLayout = rects.some((r) => r != null && r.height > 0);
    if (!hasLayout) return fallback;
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      if (r == null) continue;
      if (clientY < r.top + r.height / 2) return i;
    }
    return rects.length - 1;
  }

  function handlePointerDown(e: ReactPointerEvent<HTMLButtonElement>, index: number) {
    dragRef.current = { pointerId: e.pointerId, startIndex: index, currentIndex: index };
    setDragIndex(index);
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
    drag.currentIndex = targetIndexFromY(e.clientY, drag.currentIndex);
    setDragIndex(drag.currentIndex);
  }

  function endDrag(e: ReactPointerEvent<HTMLButtonElement>) {
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
    setDragIndex(null);
    if (drag.currentIndex !== drag.startIndex) {
      onReorder(drag.startIndex, drag.currentIndex);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {items.map((item, index) => {
        const label = getLabel(item);
        return (
          <div
            key={getKey(item)}
            ref={(el) => {
              rowRefs.current[index] = el;
            }}
            className={
              'flex items-center gap-2 rounded-[var(--r-card)] border border-[var(--line)] bg-[var(--surface-2)] px-2 py-1.5 ' +
              (dragIndex === index ? 'opacity-70' : '')
            }
          >
            <button
              type="button"
              aria-label={`Drag to reorder ${label}`}
              style={{ touchAction: 'none' }}
              className="grid h-9 w-9 flex-none cursor-grab place-items-center rounded-[var(--r-pill)] text-[var(--muted)] active:cursor-grabbing"
              onPointerDown={(e) => handlePointerDown(e, index)}
              onPointerMove={handlePointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            >
              <span aria-hidden="true" className="text-lg leading-none tracking-widest">
                ⠿
              </span>
            </button>
            <span className="flex-1 text-sm font-semibold">{label}</span>
            <div className="flex flex-none items-center gap-1.5">
              <button
                type="button"
                aria-label={`Move ${label} up`}
                disabled={index === 0}
                onClick={() => onReorder(index, index - 1)}
                className="grid h-9 w-9 place-items-center rounded-full border border-[var(--line)] bg-[var(--surface)] text-base font-extrabold text-[var(--text)] disabled:opacity-40"
              >
                ↑
              </button>
              <button
                type="button"
                aria-label={`Move ${label} down`}
                disabled={index === items.length - 1}
                onClick={() => onReorder(index, index + 1)}
                className="grid h-9 w-9 place-items-center rounded-full border border-[var(--line)] bg-[var(--surface)] text-base font-extrabold text-[var(--text)] disabled:opacity-40"
              >
                ↓
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
