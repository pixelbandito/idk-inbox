import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadAccountAddress, resetAccountProfile } from './accountProfile';

describe('loadAccountAddress', () => {
  beforeEach(() => resetAccountProfile());
  afterEach(() => vi.restoreAllMocks());

  it('fetches the address once and caches it lowercased', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ emailAddress: 'Me@Acct.Example' }), { status: 200 }),
    );
    expect(await loadAccountAddress('tok')).toBe('me@acct.example');
    // Second call is served from cache — no second network hit.
    expect(await loadAccountAddress('tok')).toBe('me@acct.example');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not cache a failure, so a later call can retry', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('nope', { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ emailAddress: 'a@b.c' }), { status: 200 }));
    await expect(loadAccountAddress('tok')).rejects.toThrow();
    expect(await loadAccountAddress('tok')).toBe('a@b.c');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
