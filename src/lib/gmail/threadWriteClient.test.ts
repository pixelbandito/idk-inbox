import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createThreadWriteClient } from './threadWriteClient';
import type { LabelIdResolver } from './labelIds';

function jsonResponse(body: unknown = {}) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

/** Resolver stub: names map to `id:<name>`, except names listed in `missing`. */
function stubResolver(missing: string[] = []): LabelIdResolver {
  return {
    async idsFor(_token, names, opts) {
      const map = new Map<string, string>();
      for (const name of names) {
        if (missing.includes(name) && !opts?.createMissing) continue;
        map.set(name, `id:${name}`);
      }
      return map;
    },
  };
}

function calledUrls(fetchMock: ReturnType<typeof vi.fn>): string[] {
  return fetchMock.mock.calls.map((c) => String(c[0]));
}

describe('createThreadWriteClient', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('modifies labels via threads.modify with resolved ids', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse());
    vi.stubGlobal('fetch', fetchMock);

    const client = createThreadWriteClient(stubResolver());
    const outcome = await client.modifyThreadLabels('token', ['t1'], {
      add: ['idk-inbox/Receipts'],
      remove: ['INBOX'],
    });

    expect(outcome).toEqual({ succeeded: ['t1'], failed: [] });
    expect(calledUrls(fetchMock)).toEqual([
      'https://gmail.googleapis.com/gmail/v1/users/me/threads/t1/modify',
    ]);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body).toEqual({
      addLabelIds: ['id:idk-inbox/Receipts'],
      removeLabelIds: ['id:INBOX'],
    });
  });

  it('translates adding TRASH into the threads.trash endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse());
    vi.stubGlobal('fetch', fetchMock);

    const client = createThreadWriteClient(stubResolver());
    const outcome = await client.modifyThreadLabels('token', ['t1'], {
      add: ['TRASH'],
      remove: ['INBOX'],
    });

    expect(outcome).toEqual({ succeeded: ['t1'], failed: [] });
    // trash implies inbox removal; no follow-up modify needed.
    expect(calledUrls(fetchMock)).toEqual([
      'https://gmail.googleapis.com/gmail/v1/users/me/threads/t1/trash',
    ]);
  });

  it('translates removing TRASH into untrash plus a modify for the rest', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse());
    vi.stubGlobal('fetch', fetchMock);

    const client = createThreadWriteClient(stubResolver());
    const outcome = await client.modifyThreadLabels('token', ['t1'], {
      add: ['INBOX'],
      remove: ['TRASH'],
    });

    expect(outcome).toEqual({ succeeded: ['t1'], failed: [] });
    expect(calledUrls(fetchMock)).toEqual([
      'https://gmail.googleapis.com/gmail/v1/users/me/threads/t1/untrash',
      'https://gmail.googleapis.com/gmail/v1/users/me/threads/t1/modify',
    ]);
    const body = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(body).toEqual({ addLabelIds: ['id:INBOX'], removeLabelIds: [] });
  });

  it('reports per-thread failures without failing the batch', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) =>
      String(url).includes('/threads/bad/')
        ? Promise.resolve({ ok: false, status: 404 } as Response)
        : Promise.resolve(jsonResponse()),
    );
    vi.stubGlobal('fetch', fetchMock);

    const client = createThreadWriteClient(stubResolver());
    const outcome = await client.modifyThreadLabels('token', ['good', 'bad'], {
      add: [],
      remove: ['INBOX'],
    });

    expect(outcome.succeeded).toEqual(['good']);
    expect(outcome.failed).toEqual(['bad']);
  });

  it('drops unresolvable remove-side labels instead of erroring', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse());
    vi.stubGlobal('fetch', fetchMock);

    const client = createThreadWriteClient(stubResolver(['idk-inbox/Gone']));
    const outcome = await client.modifyThreadLabels('token', ['t1'], {
      add: [],
      remove: ['idk-inbox/Gone'],
    });

    // Nothing left to change — the write is a successful no-op.
    expect(outcome).toEqual({ succeeded: ['t1'], failed: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('creates add-side labels on demand (createMissing)', async () => {
    const idsFor = vi.fn().mockResolvedValue(new Map([['idk-inbox/New', 'id:new']]));
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse());
    vi.stubGlobal('fetch', fetchMock);

    const client = createThreadWriteClient({ idsFor });
    await client.modifyThreadLabels('token', ['t1'], { add: ['idk-inbox/New'], remove: [] });

    expect(idsFor).toHaveBeenCalledWith('token', ['idk-inbox/New'], { createMissing: true });
  });
});
