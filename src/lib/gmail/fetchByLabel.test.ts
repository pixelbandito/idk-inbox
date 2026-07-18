import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchByLabel } from './fetchByLabel';
import { resetAccountProfile } from './accountProfile';
import type { LabelIdResolver } from './labelIds';

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

// After the message list, fetchByLabel loads the account address (once, cached)
// to place us among recipients. In these ordered mocks it's the call right
// after the list request.
const PROFILE = () => jsonResponse({ emailAddress: 'me@acct.example' });

/** Names resolve to `id:<name>` except those listed as missing. */
function stubResolver(missing: string[] = []): LabelIdResolver {
  return {
    async idsFor(_token, names) {
      return new Map(
        names.filter((n) => !missing.includes(n)).map((n) => [n, `id:${n}`]),
      );
    },
    evict: () => {},
  };
}

describe('fetchByLabel', () => {
  beforeEach(() => { vi.restoreAllMocks(); resetAccountProfile(); });

  it('lists by resolved label id then fetches and parses each message', async () => {
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce(jsonResponse({ messages: [{ id: 'm1' }] }));
    fetchMock.mockResolvedValueOnce(PROFILE());
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        id: 'm1', threadId: 't1', snippet: 'hi', labelIds: ['INBOX', 'UNREAD'],
        payload: { headers: [{ name: 'Subject', value: 'Hello' }] },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchByLabel('token123', 'INBOX', 25, stubResolver());

    expect(result.emails).toHaveLength(1);
    expect(result.emails[0].subject).toBe('Hello');
    expect(result.failed).toBe(0);

    const listUrl = fetchMock.mock.calls[0][0] as string;
    // Id listing, not eventually-consistent q= search.
    expect(listUrl).toContain('/messages?labelIds=');
    expect(decodeURIComponent(listUrl)).toContain('id:INBOX');
    expect(listUrl).not.toContain('q=');
    // call[1] is the profile fetch; the message get is call[2].
    expect(fetchMock.mock.calls[2][0]).toContain('/messages/m1');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer token123');
  });

  it('treats an unresolvable label as empty (mid-bootstrap first run)', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchByLabel('t', 'idk-inbox/Snoozed', 25, stubResolver(['idk-inbox/Snoozed']));

    expect(result).toEqual({ emails: [], failed: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns an empty result when no messages match', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);
    expect(await fetchByLabel('t', 'INBOX', 25, stubResolver())).toEqual({ emails: [], failed: 0 });
  });

  it('throws when the list request fails', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: false, status: 401 } as Response);
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchByLabel('bad', 'INBOX', 25, stubResolver())).rejects.toThrow(/401/);
  });

  it('returns successful messages and a failed count on per-message 429', async () => {
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce(jsonResponse({ messages: [{ id: 'm1' }, { id: 'm2' }] }));
    fetchMock.mockResolvedValueOnce(PROFILE());
    fetchMock.mockResolvedValueOnce(jsonResponse({
      id: 'm1', threadId: 't1', snippet: 'ok', labelIds: ['INBOX'],
      payload: { headers: [{ name: 'Subject', value: 'A' }] },
    }));
    fetchMock.mockResolvedValueOnce({ ok: false, status: 429 } as Response);
    vi.stubGlobal('fetch', fetchMock);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await fetchByLabel('t', 'INBOX', 25, stubResolver());
    expect(result.emails).toHaveLength(1);
    expect(result.failed).toBe(1);
    warnSpy.mockRestore();
  });
});
