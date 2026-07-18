import { describe, it, expect, vi, beforeEach } from 'vitest';
import { previewInboxMatches } from './preview';

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

describe('previewInboxMatches', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('counts a sender\'s current inbox threads via a read-only search', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ threads: [{ id: 'a' }, { id: 'b' }] }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await previewInboxMatches('tok', { kind: 'sender', value: 'deals@shop.example' });

    expect(result).toEqual({ count: 2, atLeast: false });
    const url = fetchMock.mock.calls[0][0] as string;
    expect(decodeURIComponent(url)).toContain('from:"deals@shop.example" in:inbox');
    expect(url).toContain('/threads?q=');
  });

  it('queries a mailing list by list-id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ threads: [] }));
    vi.stubGlobal('fetch', fetchMock);
    await previewInboxMatches('tok', { kind: 'list', value: 'deals.shop.example' });
    expect(decodeURIComponent(fetchMock.mock.calls[0][0] as string)).toContain('list:deals.shop.example in:inbox');
  });

  it('refuses to build a query from an unsafe sender, without a network call', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await previewInboxMatches('tok', { kind: 'sender', value: 'evil" OR in:anywhere' });
    expect(result).toEqual({ count: 0, atLeast: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('flags when the cap is hit (count may be higher)', async () => {
    const many = Array.from({ length: 100 }, (_, i) => ({ id: String(i) }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ threads: many })));
    expect(await previewInboxMatches('tok', { kind: 'sender', value: 'a@b.c' }))
      .toEqual({ count: 100, atLeast: true });
  });
});
