import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchThread } from './fetchThread';

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

function b64url(s: string): string {
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

describe('fetchThread', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('fetches a thread and parses each message', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({
      id: 't1',
      messages: [
        {
          id: 'm1',
          payload: {
            headers: [
              { name: 'From', value: 'Alice <a@x.com>' },
              { name: 'To', value: 'Bob <b@x.com>' },
              { name: 'Subject', value: 'Hello' },
              { name: 'Date', value: 'Fri, 16 May 2026 14:00:00 -0700' },
            ],
            mimeType: 'text/plain',
            body: { data: b64url('hi there') },
          },
        },
        {
          id: 'm2',
          payload: {
            headers: [
              { name: 'From', value: 'Bob <b@x.com>' },
              { name: 'Subject', value: 'Re: Hello' },
              { name: 'Date', value: 'Fri, 16 May 2026 15:00:00 -0700' },
            ],
            mimeType: 'text/plain',
            body: { data: b64url('hey back') },
          },
        },
      ],
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchThread('token', 't1');

    expect(result.id).toBe('t1');
    expect(result.subject).toBe('Hello');
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0].from).toBe('Alice <a@x.com>');
    expect(result.messages[0].body).toBe('hi there');
    expect(result.messages[1].body).toBe('hey back');

    expect(fetchMock.mock.calls[0][0]).toContain('/threads/t1?format=full');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer token');
  });

  it('throws when the thread fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: false, status: 404 } as Response));
    await expect(fetchThread('t', 'x')).rejects.toThrow(/404/);
  });

  it('tolerates missing headers and an empty body', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({
      id: 't2',
      messages: [{ id: 'm1', payload: {} }],
    }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await fetchThread('t', 't2');
    expect(result.messages[0].from).toBe('');
    expect(result.messages[0].body).toBe('');
    expect(result.subject).toBe('');
  });
});
