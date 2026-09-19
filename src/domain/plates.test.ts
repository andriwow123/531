import { describe, it, expect } from 'vitest';
import { computePlates } from './plates';
const PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];

describe('computePlates', () => {
  it('100kg on 20kg bar = 40 per side', () => {
    const r = computePlates(100, 20, PLATES); // 40/side -> 25+15
    expect(r.perSide).toEqual([{ plate: 25, count: 1 }, { plate: 15, count: 1 }]);
    expect(r.leftover).toBe(0);
  });
  it('bar-only target', () => {
    const r = computePlates(20, 20, PLATES);
    expect(r.perSide).toEqual([]);
    expect(r.leftover).toBe(0);
  });
  it('reports leftover when not matchable', () => {
    const r = computePlates(21, 20, [25, 20]); // 0.5/side unmatchable
    expect(r.perSide).toEqual([]);
    expect(r.leftover).toBeCloseTo(0.5, 3);
  });
});
