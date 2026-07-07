import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sweepDueSnoozes } from './wakeSweep';
import { spyThreadWriteClient } from '../../test/spyThreadWriteClient';

function jsonResponse(body: unknown = {}) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

const NOW = new Date(Date.UTC(2026, 6, 7, 12, 0));

const LABELS = {
  labels: [
    { id: 'INBOX', name: 'INBOX' },
    { id: 'L_parent', name: 'idk-inbox/Snoozed' },
    { id: 'L_due', name: 'idk-inbox/Snoozed/2026-07-07-0900' },       // due
    { id: 'L_future', name: 'idk-inbox/Snoozed/2026-07-09-0900' },    // not due
    { id: 'L_junk', name: 'idk-inbox/Snoozed/oops' },                  // undecodable
  ],
};

function stubFetchRouting(threadsByLabel: Record<string, string[]>) {
  const calls: { url: string; method: string }[] = [];
  const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    calls.push({ url: String(url), method: init?.method ?? 'GET' });
    const u = String(url);
    if (u.includes('/labels') && (!init?.method || init.method === 'GET')) {
      return Promise.resolve(jsonResponse(LABELS));
    }
    if (u.includes('/threads?')) {
      const q = decodeURIComponent(u);
      const match = Object.entries(threadsByLabel).find(([label]) => q.includes(label));
      const threads = (match?.[1] ?? []).map((id) => ({ id }));
      return Promise.resolve(jsonResponse({ threads }));
    }
    return Promise.resolve(jsonResponse());
  });
  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, calls };
}

describe('sweepDueSnoozes', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('returns due threads to the inbox and ignores future/undecodable buckets', async () => {
    stubFetchRouting({ 'idk-inbox/Snoozed/2026-07-07-0900': ['t1', 't2'] });
    const { client, modifyThreadLabels } = spyThreadWriteClient();

    const result = await sweepDueSnoozes('tok', client, NOW);

    expect(result.woken).toBe(2);
    expect(modifyThreadLabels).toHaveBeenCalledTimes(1);
    expect(modifyThreadLabels).toHaveBeenCalledWith('tok', ['t1', 't2'], {
      add: ['INBOX'],
      remove: ['idk-inbox/Snoozed', 'idk-inbox/Snoozed/2026-07-07-0900'],
    });
  });

  it('deletes the bucket label once fully swept', async () => {
    const { calls } = stubFetchRouting({ 'idk-inbox/Snoozed/2026-07-07-0900': ['t1'] });
    const { client } = spyThreadWriteClient();

    await sweepDueSnoozes('tok', client, NOW);

    const deletes = calls.filter((c) => c.method === 'DELETE');
    expect(deletes).toHaveLength(1);
    expect(deletes[0].url).toMatch(/\/labels\/L_due$/);
  });

  it('keeps the bucket label when some threads failed to wake', async () => {
    const { calls } = stubFetchRouting({ 'idk-inbox/Snoozed/2026-07-07-0900': ['t1', 't2'] });
    const client = {
      modifyThreadLabels: vi.fn(async () => ({ succeeded: ['t1'], failed: ['t2'] })),
    };

    const result = await sweepDueSnoozes('tok', client, NOW);

    expect(result.woken).toBe(1);
    expect(calls.filter((c) => c.method === 'DELETE')).toHaveLength(0);
  });

  it('deletes an empty due bucket without any thread writes', async () => {
    const { calls } = stubFetchRouting({ 'idk-inbox/Snoozed/2026-07-07-0900': [] });
    const { client, modifyThreadLabels } = spyThreadWriteClient();

    const result = await sweepDueSnoozes('tok', client, NOW);

    expect(result.woken).toBe(0);
    expect(modifyThreadLabels).not.toHaveBeenCalled();
    expect(calls.filter((c) => c.method === 'DELETE')).toHaveLength(1);
  });

  it('does nothing when no bucket is due', async () => {
    const early = new Date(Date.UTC(2026, 0, 1));
    const { calls } = stubFetchRouting({});
    const { client, modifyThreadLabels } = spyThreadWriteClient();

    const result = await sweepDueSnoozes('tok', client, early);

    expect(result.woken).toBe(0);
    expect(modifyThreadLabels).not.toHaveBeenCalled();
    expect(calls.filter((c) => c.url.includes('/threads?'))).toHaveLength(0);
  });
});
