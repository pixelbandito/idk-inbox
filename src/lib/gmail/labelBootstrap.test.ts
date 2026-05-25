import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ensureAppLabels, APP_LABEL, SNOOZED_LABEL } from './labelBootstrap';

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

describe('ensureAppLabels', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('exports the canonical label names', () => {
    expect(APP_LABEL).toBe('InboxZero');
    expect(SNOOZED_LABEL).toBe('InboxZero/Snoozed');
  });

  it('creates both labels when neither exists', async () => {
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce(jsonResponse({ labels: [{ id: 'l1', name: 'INBOX' }] }));
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 'lz', name: 'InboxZero' }));
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 'lzs', name: 'InboxZero/Snoozed' }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await ensureAppLabels('token');

    expect(result.created.sort()).toEqual(['InboxZero', 'InboxZero/Snoozed']);
    expect(fetchMock.mock.calls).toHaveLength(3); // list + 2 creates
    expect(fetchMock.mock.calls[1][1].method).toBe('POST');
    const body1 = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(body1.name).toBe('InboxZero');
  });

  it('creates only the missing label when one exists', async () => {
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce(jsonResponse({
      labels: [{ id: 'l1', name: 'INBOX' }, { id: 'lz', name: 'InboxZero' }],
    }));
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 'lzs', name: 'InboxZero/Snoozed' }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await ensureAppLabels('token');

    expect(result.created).toEqual(['InboxZero/Snoozed']);
    expect(fetchMock.mock.calls).toHaveLength(2);
  });

  it('returns empty created when both labels already exist (idempotent)', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({
      labels: [
        { id: 'lz', name: 'InboxZero' },
        { id: 'lzs', name: 'InboxZero/Snoozed' },
      ],
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await ensureAppLabels('token');
    expect(result.created).toEqual([]);
    expect(fetchMock.mock.calls).toHaveLength(1); // only list
  });

  it('throws when the list call fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: false, status: 401 } as Response));
    await expect(ensureAppLabels('bad')).rejects.toThrow(/401/);
  });
});
