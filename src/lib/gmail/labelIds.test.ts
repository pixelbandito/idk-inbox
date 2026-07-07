import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createLabelIdResolver } from './labelIds';

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

const LABEL_LIST = {
  labels: [
    { id: 'INBOX', name: 'INBOX' },
    { id: 'Label_7', name: 'idk-inbox' },
    { id: 'Label_8', name: 'idk-inbox/Snoozed' },
  ],
};

describe('createLabelIdResolver', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('resolves system labels without any network call', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const resolver = createLabelIdResolver();
    const ids = await resolver.idsFor('token', ['INBOX', 'TRASH', 'SPAM', 'UNREAD']);

    expect(Object.fromEntries(ids)).toEqual({
      INBOX: 'INBOX', TRASH: 'TRASH', SPAM: 'SPAM', UNREAD: 'UNREAD',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('resolves user labels from the label list and caches the result', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(LABEL_LIST));
    vi.stubGlobal('fetch', fetchMock);

    const resolver = createLabelIdResolver();
    const first = await resolver.idsFor('token', ['idk-inbox/Snoozed']);
    const second = await resolver.idsFor('token', ['idk-inbox']);

    expect(first.get('idk-inbox/Snoozed')).toBe('Label_8');
    expect(second.get('idk-inbox')).toBe('Label_7');
    expect(fetchMock).toHaveBeenCalledTimes(1); // one list, then cache
  });

  it('creates missing labels when asked to', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(LABEL_LIST))
      .mockResolvedValueOnce(jsonResponse({ id: 'Label_9', name: 'idk-inbox/Receipts' }));
    vi.stubGlobal('fetch', fetchMock);

    const resolver = createLabelIdResolver();
    const ids = await resolver.idsFor('token', ['idk-inbox/Receipts'], { createMissing: true });

    expect(ids.get('idk-inbox/Receipts')).toBe('Label_9');
    expect(fetchMock.mock.calls[1][1]?.method).toBe('POST');

    // The created id is cached for later calls.
    const again = await resolver.idsFor('token', ['idk-inbox/Receipts']);
    expect(again.get('idk-inbox/Receipts')).toBe('Label_9');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('omits unresolvable names when not creating', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(LABEL_LIST));
    vi.stubGlobal('fetch', fetchMock);

    const resolver = createLabelIdResolver();
    const ids = await resolver.idsFor('token', ['idk-inbox/Nope', 'INBOX']);

    expect(ids.has('idk-inbox/Nope')).toBe(false);
    expect(ids.get('INBOX')).toBe('INBOX');
  });

  it('evict() drops a cached id so it cannot be reused after label deletion', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(LABEL_LIST));
    vi.stubGlobal('fetch', fetchMock);

    const resolver = createLabelIdResolver();
    await resolver.idsFor('token', ['idk-inbox/Snoozed']);
    resolver.evict('idk-inbox/Snoozed');

    // Within the re-list interval, the evicted name stays unresolved.
    const ids = await resolver.idsFor('token', ['idk-inbox/Snoozed']);
    expect(ids.has('idk-inbox/Snoozed')).toBe(false);
  });

  it('concurrent misses share a single label listing', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(LABEL_LIST));
    vi.stubGlobal('fetch', fetchMock);

    const resolver = createLabelIdResolver();
    await Promise.all([
      resolver.idsFor('token', ['idk-inbox']),
      resolver.idsFor('token', ['idk-inbox/Snoozed']),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws a readable error when the label list fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 } as Response));
    const resolver = createLabelIdResolver();
    await expect(resolver.idsFor('token', ['idk-inbox/X'])).rejects.toThrow(/403/);
  });
});
