import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { moveItem } from '../../domain';
import { OrderableList, finalDropIndex } from './OrderableList';

// finalDropIndex converts a raw drop-target row index — read from row
// positions in the ORIGINAL, pre-removal list during a pointer drag — into
// the FINAL index moveItem(arr, from, to) expects. This is the pure mapping
// that fixes the downward-drag off-by-one (jsdom can't exercise the actual
// pointer gesture, so this locks the arithmetic with real unit tests instead).
describe('finalDropIndex', () => {
  it('upward drag: leaves the raw target unchanged when it is before the start index', () => {
    // Row 2 dragged up to drop before original row 0 — nothing before the
    // target shifts, since the source (index 2) is removed from later in
    // the array.
    expect(finalDropIndex(2, 0)).toBe(0);
  });

  it('downward drag: decrements the raw target by one when it is after the start index', () => {
    // Row 0 dragged down to drop before original row 2 (i.e. intending to
    // land between original rows 1 and 2) — removing row 0 first shifts
    // every later row back by one, so the final index is 1, not 2.
    expect(finalDropIndex(0, 2)).toBe(1);
  });

  it('no-op: resolves to the start index when the raw target equals it', () => {
    expect(finalDropIndex(1, 1)).toBe(1);
  });

  it('matches moveItem end-to-end for the downward-drag repro (row 0 dropped between rows 1 and 2)', () => {
    const order = ['press', 'bench', 'squat', 'deadlift'];
    const to = finalDropIndex(0, 2);
    expect(moveItem(order, 0, to)).toEqual(['bench', 'press', 'squat', 'deadlift']);
  });

  it('matches moveItem end-to-end for an upward drag (row 2 dropped before row 0)', () => {
    const order = ['press', 'bench', 'squat', 'deadlift'];
    const to = finalDropIndex(2, 0);
    expect(moveItem(order, 2, to)).toEqual(['squat', 'press', 'bench', 'deadlift']);
  });
});

/** Stubs each row's getBoundingClientRect to lay them out top-to-bottom,
 *  40px apart — jsdom does no real layout, so pointer-drag target detection
 *  (which reads rects) needs deterministic stand-in geometry to be testable. */
function stubRowLayout(rows: HTMLElement[]) {
  rows.forEach((row, i) => {
    vi.spyOn(row, 'getBoundingClientRect').mockReturnValue({
      top: i * 40,
      bottom: i * 40 + 40,
      height: 40,
      left: 0,
      right: 200,
      width: 200,
      x: 0,
      y: i * 40,
      toJSON() {
        return {};
      },
    } as DOMRect);
  });
}

describe('OrderableList drag-to-last (regression)', () => {
  const ITEMS = ['press', 'bench', 'squat', 'deadlift'];

  function renderList(onReorder: (from: number, to: number) => void) {
    render(
      <OrderableList
        items={ITEMS}
        getKey={(item) => item}
        getLabel={(item) => item}
        onReorder={onReorder}
      />,
    );
  }

  it('dragging the second-to-last row past every row midpoint (past the end) reorders it to the LAST slot, not a no-op', () => {
    // Same shared off-by-one as DayStrip: `targetIndexFromY` used to cap its
    // past-all-midpoints fallback at `rects.length - 1`. For a drag starting
    // one-before-last (index 2 of 4), `finalDropIndex(2, 3) === 2 ===
    // startIndex`, so `onReorder` was never called.
    const onReorder = vi.fn();
    renderList(onReorder);

    const handles = screen.getAllByRole('button', { name: /^Drag to reorder/ });
    const rows = handles.map((handle) => handle.parentElement as HTMLElement);
    stubRowLayout(rows);

    const squatHandle = handles[2];
    fireEvent.pointerDown(squatHandle, { pointerId: 1, clientY: 90 });
    // clientY 1000 is past row 3's midpoint (140) — past every row.
    fireEvent.pointerMove(squatHandle, { pointerId: 1, clientY: 1000 });
    fireEvent.pointerUp(squatHandle, { pointerId: 1, clientY: 1000 });

    // Raw target must be rects.length (4), so finalDropIndex(2, 4) === 3 —
    // squat lands last, after deadlift.
    expect(onReorder).toHaveBeenCalledWith(2, 3);
  });

  it('rows carry select-none so handle-dragging does not highlight the row label text', () => {
    renderList(vi.fn());

    const handles = screen.getAllByRole('button', { name: /^Drag to reorder/ });
    const rows = handles.map((handle) => handle.parentElement as HTMLElement);

    for (const row of rows) {
      expect(row.className).toContain('select-none');
    }
  });
});
