import { describe, it, expect } from 'vitest';
import { moveItem } from '../../domain';
import { finalDropIndex } from './OrderableList';

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
