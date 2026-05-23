import { describe, it, expect } from 'vitest';
import { TokenStore } from './tokenStore';

describe('TokenStore', () => {
  it('is invalid when empty', () => {
    expect(new TokenStore().isValid(1000)).toBe(false);
  });

  it('stores a token and reports it valid before expiry', () => {
    const store = new TokenStore();
    store.set('abc', 3600, 0); // expires at 3_600_000 ms
    expect(store.get()?.accessToken).toBe('abc');
    expect(store.isValid(1_000_000)).toBe(true);
  });

  it('reports invalid past expiry (with 60s safety margin)', () => {
    const store = new TokenStore();
    store.set('abc', 3600, 0);
    expect(store.isValid(3_550_000)).toBe(false); // inside the 60s margin
  });

  it('clears the token', () => {
    const store = new TokenStore();
    store.set('abc', 3600, 0);
    store.clear();
    expect(store.get()).toBeNull();
  });
});
