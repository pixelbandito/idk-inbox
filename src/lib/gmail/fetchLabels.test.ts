import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchUserLabels } from './fetchLabels';

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

describe('fetchUserLabels', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('returns user labels sorted by name, hiding app plumbing labels', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      labels: [
        { id: 'INBOX', name: 'INBOX', type: 'system' },
        { id: 'L1', name: 'idk-inbox', type: 'user' },
        { id: 'L2', name: 'idk-inbox/Snoozed', type: 'user' },
        { id: 'L3', name: 'idk-inbox/Snoozed/2026-07-09-0900', type: 'user' },
        { id: 'L4', name: 'idk-inbox/Todo', type: 'user' },
        { id: 'L5', name: 'idk-inbox/Receipts', type: 'user' },
        { id: 'L6', name: 'Work', type: 'user' },
      ],
    })));

    const labels = await fetchUserLabels('tok');

    expect(labels.map((l) => l.name)).toEqual([
      'Work', 'idk-inbox/Receipts', 'idk-inbox/Todo',
    ].sort((a, b) => a.localeCompare(b)));
  });

  it('throws a readable error on failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 } as Response));
    await expect(fetchUserLabels('tok')).rejects.toThrow(/500/);
  });
});
