import { describe, it, expect } from 'vitest';
import { resolveDisplay } from './display';

describe('resolveDisplay', () => {
  it('simple hides all optional elements', () => {
    const r = resolveDisplay('simple', {});
    expect(r.plateBreakdown).toBe(false);
    expect(r.charts).toBe(false);
  });
  it('detailed shows everything', () => {
    const r = resolveDisplay('detailed', {});
    expect(Object.values(r).every(Boolean)).toBe(true);
  });
  it('overrides win over preset', () => {
    const r = resolveDisplay('simple', { plateBreakdown: true });
    expect(r.plateBreakdown).toBe(true);
    expect(r.notes).toBe(false);
  });
});
