import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchByLabel } from './fetchByLabel';

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

describe('fetchByLabel', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('lists by label then fetches and parses each', async () => {
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce(jsonResponse({ messages: [{ id: 'm1' }] }));
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        id: 'm1', threadId: 't1', snippet: 'hi', labelIds: ['INBOX', 'UNREAD'],
        payload: { headers: [{ name: 'Subject', value: 'Hello' }] },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchByLabel('token123', 'INBOX');

    expect(result.emails).toHaveLength(1);
    expect(result.emails[0].subject).toBe('Hello');
    expect(result.failed).toBe(0);

    const listUrl = fetchMock.mock.calls[0][0] as string;
    expect(listUrl).toContain('/messages?q=');
    expect(decodeURIComponent(listUrl)).toContain('label:"INBOX"');
    expect(fetchMock.mock.calls[1][0]).toContain('/messages/m1');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer token123');
  });

  it('quotes labels with slashes for nested names', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    await fetchByLabel('t', 'idk-inbox/Snoozed');

    const listUrl = decodeURIComponent(fetchMock.mock.calls[0][0] as string);
    expect(listUrl).toContain('label:"idk-inbox/Snoozed"');
  });

  it('returns an empty result when no messages match', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);
    expect(await fetchByLabel('t', 'INBOX')).toEqual({ emails: [], failed: 0 });
  });

  it('throws when the list request fails', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: false, status: 401 } as Response);
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchByLabel('bad', 'INBOX')).rejects.toThrow(/401/);
  });

  it('returns successful messages and a failed count on per-message 429', async () => {
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce(jsonResponse({ messages: [{ id: 'm1' }, { id: 'm2' }] }));
    fetchMock.mockResolvedValueOnce(jsonResponse({
      id: 'm1', threadId: 't1', snippet: 'ok', labelIds: ['INBOX'],
      payload: { headers: [{ name: 'Subject', value: 'A' }] },
    }));
    fetchMock.mockResolvedValueOnce({ ok: false, status: 429 } as Response);
    vi.stubGlobal('fetch', fetchMock);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await fetchByLabel('t', 'INBOX');
    expect(result.emails).toHaveLength(1);
    expect(result.failed).toBe(1);
    warnSpy.mockRestore();
  });
});
