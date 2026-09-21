import { describe, it, expect } from 'vitest';
import { SUPPORTING_CATALOG, categoriesForLift, bbbFor, supportingList } from './supportingCatalog';
import type { CustomExercise, HiddenSupporting } from '../data/repositories';

describe('categoriesForLift', () => {
  it('maps upper lifts (press, bench) to push/pull/core', () => {
    expect(categoriesForLift('press')).toEqual(['push', 'pull', 'core']);
    expect(categoriesForLift('bench')).toEqual(['push', 'pull', 'core']);
  });
  it('maps lower lifts (squat, deadlift) to legs/pull/core', () => {
    expect(categoriesForLift('squat')).toEqual(['legs', 'pull', 'core']);
    expect(categoriesForLift('deadlift')).toEqual(['legs', 'pull', 'core']);
  });
});

describe('bbbFor', () => {
  it('rounds tm * 0.5 to the given increment', () => {
    expect(bbbFor(100, 2.5)).toBe(50);
  });
});

describe('supportingList', () => {
  it('returns the catalog minus hidden names plus this category\'s customs, catalog-first', () => {
    const customs: CustomExercise[] = [
      { category: 'push', name: 'JM Press', scheme: '3 × 8' },
      { category: 'pull', name: 'x' },
    ];
    const hidden: HiddenSupporting[] = [{ category: 'push', name: 'Dips' }];

    const list = supportingList('push', customs, hidden);

    const expectedCatalog = SUPPORTING_CATALOG.push
      .filter((item) => item.name !== 'Dips')
      .map((item) => ({ name: item.name, scheme: item.scheme, custom: false }));
    expect(list).toEqual([...expectedCatalog, { name: 'JM Press', scheme: '3 × 8', custom: true }]);
    expect(list.some((item) => item.name === 'x')).toBe(false);
    expect(list.some((item) => item.name === 'Dips')).toBe(false);
  });

  it('hides catalog names case-insensitively', () => {
    const list = supportingList('core', [], [{ category: 'core', name: 'PLANK' }]);
    expect(list.some((item) => item.name.toLowerCase() === 'plank')).toBe(false);
  });
});
