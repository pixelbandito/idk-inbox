import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchInbox } from './fetchInbox';

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

describe('fetchInbox', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('lists inbox messages then fetches and parses each', async () => {
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce(jsonResponse({ messages: [{ id: 'm1' }] }));
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        id: 'm1',
        threadId: 't1',
        snippet: 'hi',
        labelIds: ['INBOX', 'UNREAD'],
        payload: { headers: [{ name: 'Subject', value: 'Hello' }] },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchInbox('token123');

    expect(result.emails).toHaveLength(1);
    expect(result.emails[0].subject).toBe('Hello');
    expect(result.emails[0].unread).toBe(true);
    expect(result.failed).toBe(0);
    expect(fetchMock.mock.calls[0][0]).toContain('/messages?q=in:inbox');
    expect(fetchMock.mock.calls[1][0]).toContain('/messages/m1');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer token123');
  });

  it('returns an empty result when the inbox has no messages', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);
    expect(await fetchInbox('token123')).toEqual({ emails: [], failed: 0 });
  });

  it('throws when the list request fails', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 401 } as Response);
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchInbox('bad')).rejects.toThrow(/401/);
  });

  it('returns successful messages and a failed count when some message gets fail', async () => {
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ messages: [{ id: 'm1' }, { id: 'm2' }] }),
    );
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        id: 'm1',
        threadId: 't1',
        snippet: 'ok',
        labelIds: ['INBOX'],
        payload: { headers: [{ name: 'Subject', value: 'A' }] },
      }),
    );
    // m2 is rate-limited.
    fetchMock.mockResolvedValueOnce({ ok: false, status: 429 } as Response);
    vi.stubGlobal('fetch', fetchMock);
    // Silence the warn this case intentionally produces.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await fetchInbox('token123');

    expect(result.emails).toHaveLength(1);
    expect(result.emails[0].subject).toBe('A');
    expect(result.failed).toBe(1);

    warnSpy.mockRestore();
  });
});
