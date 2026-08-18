import { describe, it, expect } from 'vitest';
import { isPlainEmailAddress, senderAddressOf } from './address';

describe('senderAddressOf', () => {
  it('extracts the bracketed address, lowercased', () => {
    expect(senderAddressOf('Deals <Deals@Shop.example>')).toBe('deals@shop.example');
    expect(senderAddressOf('bare@x.example')).toBe('bare@x.example');
  });
});

describe('isPlainEmailAddress', () => {
  it('accepts ordinary addresses', () => {
    expect(isPlainEmailAddress('a@b.example')).toBe(true);
    expect(isPlainEmailAddress('first.last+tag@sub.domain.example')).toBe(true);
  });

  it('rejects Gmail-query breakout attempts and malformed shapes', () => {
    // A quote would escape from:"..." and widen the sweep to the whole inbox.
    expect(isPlainEmailAddress('legit@x.com" or in:inbox or "@x.com')).toBe(false);
    expect(isPlainEmailAddress('a b@x.example')).toBe(false);
    expect(isPlainEmailAddress('a@b@c.example')).toBe(false);
    expect(isPlainEmailAddress('no-at-sign')).toBe(false);
    expect(isPlainEmailAddress('')).toBe(false);
    expect(isPlainEmailAddress("o'quote@x.example")).toBe(false);
  });
});
