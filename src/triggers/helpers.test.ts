import { describe, it, expect } from 'vitest';
import { within, beyond } from './helpers';

describe('within', () => {
  it('passes when fraction is at or below threshold', () => {
    expect(within({ fraction: 0.05, pixels: 100 }, { fraction: 0.05, minPx: 48 })).toBe(true);
    expect(within({ fraction: 0.04, pixels: 100 }, { fraction: 0.05, minPx: 48 })).toBe(true);
  });
  it('passes when pixels is at or below the minPx floor (even if fraction exceeds)', () => {
    expect(within({ fraction: 0.30, pixels: 48 }, { fraction: 0.05, minPx: 48 })).toBe(true);
  });
  it('fails when both exceed', () => {
    expect(within({ fraction: 0.30, pixels: 100 }, { fraction: 0.05, minPx: 48 })).toBe(false);
  });
});

describe('beyond', () => {
  it('passes when both fraction and pixels meet/exceed', () => {
    expect(beyond({ fraction: 0.20, pixels: 60 }, { fraction: 0.20, minPx: 60 })).toBe(true);
    expect(beyond({ fraction: 0.50, pixels: 200 }, { fraction: 0.20, minPx: 60 })).toBe(true);
  });
  it('fails when fraction meets but pixels does not (small surface)', () => {
    expect(beyond({ fraction: 0.50, pixels: 30 }, { fraction: 0.20, minPx: 60 })).toBe(false);
  });
  it('fails when pixels meets but fraction does not (huge surface)', () => {
    expect(beyond({ fraction: 0.05, pixels: 200 }, { fraction: 0.20, minPx: 60 })).toBe(false);
  });
});
