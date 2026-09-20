import { describe, it, expect } from 'vitest';
import { ASSISTANCE_CATALOG, exerciseOptions } from './assistanceCatalog';
import type { CustomExercise } from '../data/repositories';

describe('exerciseOptions', () => {
  it('lists the catalog for a category then its customs, de-duped', () => {
    const customs: CustomExercise[] = [
      { category: 'push', name: 'JM Press' },
      { category: 'push', name: 'Dips' }, // duplicate of a catalog item
      { category: 'pull', name: 'Rope Curl' },
    ];
    const opts = exerciseOptions('push', customs);
    expect(opts.slice(0, ASSISTANCE_CATALOG.push.length)).toEqual(ASSISTANCE_CATALOG.push);
    expect(opts).toContain('JM Press');
    expect(opts.filter((o) => o.toLowerCase() === 'dips')).toHaveLength(1); // de-duped
    expect(opts).not.toContain('Rope Curl'); // other category excluded
  });
});
