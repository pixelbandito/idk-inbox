import { describe, it, expect, beforeEach } from 'vitest';
import { loadPersistedToken, savePersistedToken } from './tokenPersistence';

describe('tokenPersistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns null when nothing is stored', () => {
    expect(loadPersistedToken()).toBeNull();
  });

  it('round-trips a token through save/load', () => {
    savePersistedToken({ accessToken: 'abc', expiresAt: 999_000 });
    expect(loadPersistedToken(0)).toEqual({ accessToken: 'abc', expiresAt: 999_000 });
  });

  it('returns null and clears storage when the stored token is expired', () => {
    savePersistedToken({ accessToken: 'abc', expiresAt: 100 });
    expect(loadPersistedToken(200)).toBeNull();
    // Verify storage is empty afterwards.
    expect(loadPersistedToken(0)).toBeNull();
  });

  it('save(null) clears the storage entry', () => {
    savePersistedToken({ accessToken: 'abc', expiresAt: 999_000 });
    savePersistedToken(null);
    expect(loadPersistedToken(0)).toBeNull();
  });

  it('returns null when the stored value is malformed JSON', () => {
    localStorage.setItem('idk-inbox.token.v1', '{not json');
    expect(loadPersistedToken()).toBeNull();
  });

  it('returns null when the stored object is missing fields', () => {
    localStorage.setItem('idk-inbox.token.v1', JSON.stringify({ accessToken: 'abc' }));
    expect(loadPersistedToken()).toBeNull();
  });

  it('rejects a null / non-finite expiresAt (the NaN-expires_in bug)', () => {
    // JSON.stringify(NaN) === "null"; a token saved with a bad TTL looked like
    // this and used to silently sign the user out on refresh.
    localStorage.setItem('idk-inbox.token.v1', JSON.stringify({ accessToken: 'abc', expiresAt: null }));
    expect(loadPersistedToken(0)).toBeNull();
    expect(localStorage.getItem('idk-inbox.token.v1')).toBeNull(); // and clears it
  });

  it('rejects an empty access token', () => {
    localStorage.setItem('idk-inbox.token.v1', JSON.stringify({ accessToken: '', expiresAt: 999_000 }));
    expect(loadPersistedToken(0)).toBeNull();
  });
});
