import { describe, it, expect } from 'vitest';
import { roundToIncrement, ROUNDING_STEPS, defaultRoundingFor, effectiveRounding, convertRoundingStep } from './rounding';

describe('roundToIncrement', () => {
  it('rounds to nearest 2.5', () => {
    expect(roundToIncrement(101.2, 2.5)).toBe(100);
    expect(roundToIncrement(101.3, 2.5)).toBe(102.5);
  });
  it('rounds to nearest 5', () => {
    expect(roundToIncrement(97.4, 5)).toBe(95);
    expect(roundToIncrement(97.6, 5)).toBe(100);
  });
  it('returns 0 for 0', () => expect(roundToIncrement(0, 2.5)).toBe(0));
});

describe('per-lift rounding helpers', () => {
  it('offers the standard steps per unit', () => {
    expect(ROUNDING_STEPS).toEqual({ kg: [1.25, 2.5, 5], lb: [2.5, 5, 10] });
  });
  it('defaults upper-body to 2.5 kg / 5 lb and lower-body to 5 kg / 10 lb', () => {
    expect(defaultRoundingFor('upper', 'kg')).toBe(2.5);
    expect(defaultRoundingFor('upper', 'lb')).toBe(5);
    expect(defaultRoundingFor('lower', 'kg')).toBe(5);
    expect(defaultRoundingFor('lower', 'lb')).toBe(10);
  });
  it('uses the lift value when set, else the profile fallback', () => {
    expect(effectiveRounding(5, 2.5)).toBe(5);
    expect(effectiveRounding(undefined, 2.5)).toBe(2.5);
  });
  it('maps a step across units by position, falling back to the category default', () => {
    expect(convertRoundingStep(1.25, 'kg', 'lb', 'upper')).toBe(2.5);
    expect(convertRoundingStep(5, 'kg', 'lb', 'lower')).toBe(10);
    expect(convertRoundingStep(10, 'lb', 'kg', 'lower')).toBe(5);
    expect(convertRoundingStep(3, 'kg', 'lb', 'upper')).toBe(5); // unknown -> default
  });
});
