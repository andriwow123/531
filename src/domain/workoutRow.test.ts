import { describe, it, expect } from 'vitest';
import { workoutRowKey } from './workoutRow';

describe('workoutRowKey', () => {
  it('keys warm-up and main sets independent of template', () => {
    expect(workoutRowKey('main', 2, 'bbb')).toBe('main:2');
    expect(workoutRowKey('main', 2, 'fsl')).toBe('main:2');
    expect(workoutRowKey('warmup', 1, 'base')).toBe('warmup:1');
  });
  it('keys supplemental sets per template', () => {
    expect(workoutRowKey('supplemental', 3, 'bbb')).toBe('bbb:supplemental:3');
    expect(workoutRowKey('supplemental', 3, 'fsl')).toBe('fsl:supplemental:3');
  });
});
