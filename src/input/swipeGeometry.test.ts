import { describe, it, expect } from 'vitest';
import { logicalInlineDirection, inlineFraction } from './swipeGeometry';

describe('logicalInlineDirection', () => {
  it('maps drag right to end / left to start in LTR', () => {
    expect(logicalInlineDirection(50, 'ltr')).toBe('end');
    expect(logicalInlineDirection(-50, 'ltr')).toBe('start');
  });
  it('flips in RTL', () => {
    expect(logicalInlineDirection(50, 'rtl')).toBe('start');
    expect(logicalInlineDirection(-50, 'rtl')).toBe('end');
  });
});

describe('inlineFraction', () => {
  it('is the clamped magnitude over the inline size', () => {
    expect(inlineFraction(50, 200)).toBeCloseTo(0.25);
    expect(inlineFraction(-100, 200)).toBeCloseTo(0.5);
    expect(inlineFraction(500, 200)).toBe(1);   // clamped
    expect(inlineFraction(50, 0)).toBe(0);      // guard divide-by-zero
  });
});
