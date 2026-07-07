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

/** Routes label listing + `threads?labelIds=<id>` listing; records all calls. */
function stubFetchRouting(threadsByLabelId: Record<string, string[]>) {
  const calls: { url: string; method: string }[] = [];
  const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    calls.push({ url: String(url), method: init?.method ?? 'GET' });
    const u = String(url);
    if (u.endsWith('/labels')) return Promise.resolve(jsonResponse(LABELS));
    if (u.includes('/threads?')) {
      const labelId = new URL(u).searchParams.get('labelIds') ?? '';
      const threads = (threadsByLabelId[labelId] ?? []).map((id) => ({ id }));
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
    stubFetchRouting({ L_due: ['t1', 't2'] });
    const { client, modifyThreadLabels } = spyThreadWriteClient();

    const result = await sweepDueSnoozes('tok', client, NOW);

    expect(result.woken).toBe(2);
    expect(modifyThreadLabels).toHaveBeenCalledTimes(1);
    expect(modifyThreadLabels).toHaveBeenCalledWith('tok', ['t1', 't2'], {
      add: ['INBOX'],
      remove: ['idk-inbox/Snoozed', 'idk-inbox/Snoozed/2026-07-07-0900'],
    });
  });

  it('lists bucket members by label id, never by search', async () => {
    const { calls } = stubFetchRouting({ L_due: ['t1'] });
    const { client } = spyThreadWriteClient();

    await sweepDueSnoozes('tok', client, NOW);

    const threadLists = calls.filter((c) => c.url.includes('/threads?'));
    expect(threadLists).toHaveLength(1);
    expect(threadLists[0].url).toContain('labelIds=L_due');
    expect(threadLists[0].url).not.toContain('q=');
  });

  it('deletes the bucket label once fully swept', async () => {
    stubFetchRouting({ L_due: ['t1'] });
    const { client, deleteLabel } = spyThreadWriteClient();

    await sweepDueSnoozes('tok', client, NOW);

    expect(deleteLabel).toHaveBeenCalledTimes(1);
    expect(deleteLabel).toHaveBeenCalledWith('tok', 'idk-inbox/Snoozed/2026-07-07-0900');
  });

  it('keeps the bucket label when some threads failed to wake', async () => {
    stubFetchRouting({ L_due: ['t1', 't2'] });
    const { client, deleteLabel } = spyThreadWriteClient();
    client.modifyThreadLabels = vi.fn(async () => ({ succeeded: ['t1'], failed: ['t2'] }));

    const result = await sweepDueSnoozes('tok', client, NOW);

    expect(result.woken).toBe(1);
    expect(deleteLabel).not.toHaveBeenCalled();
  });

  it('keeps the bucket label when the listing hit the cap (possible truncation)', async () => {
    const century = Array.from({ length: 100 }, (_, i) => `t${i}`);
    stubFetchRouting({ L_due: century });
    const { client, deleteLabel } = spyThreadWriteClient();

    const result = await sweepDueSnoozes('tok', client, NOW);

    expect(result.woken).toBe(100);
    expect(deleteLabel).not.toHaveBeenCalled();
  });

  it('deletes an empty due bucket without any thread writes', async () => {
    stubFetchRouting({ L_due: [] });
    const { client, modifyThreadLabels, deleteLabel } = spyThreadWriteClient();

    const result = await sweepDueSnoozes('tok', client, NOW);

    expect(result.woken).toBe(0);
    expect(modifyThreadLabels).not.toHaveBeenCalled();
    expect(deleteLabel).toHaveBeenCalledTimes(1);
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

  it("one bucket's failure doesn't starve the rest", async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const LABELS_TWO_DUE = {
      labels: [
        { id: 'L_a', name: 'idk-inbox/Snoozed/2026-07-07-0800' },
        { id: 'L_b', name: 'idk-inbox/Snoozed/2026-07-07-0900' },
      ],
    };
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      const u = String(url);
      if (u.endsWith('/labels')) return Promise.resolve(jsonResponse(LABELS_TWO_DUE));
      if (u.includes('labelIds=L_a')) return Promise.resolve({ ok: false, status: 500 } as Response);
      if (u.includes('labelIds=L_b')) return Promise.resolve(jsonResponse({ threads: [{ id: 't9' }] }));
      return Promise.resolve(jsonResponse());
    });
    vi.stubGlobal('fetch', fetchMock);
    const { client } = spyThreadWriteClient();

    const result = await sweepDueSnoozes('tok', client, NOW);

    expect(result.woken).toBe(1); // L_b still woke despite L_a's 500
  });
});
