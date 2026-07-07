import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  addAutoArchiveRule,
  autoArchiveRules,
  removeAutoArchiveRule,
  resetAutoArchiveRules,
  sweepAutoArchive,
} from './autoArchive';
import { spyThreadWriteClient } from '../../test/spyThreadWriteClient';

function jsonResponse(body: unknown = {}) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

describe('auto-archive rules', () => {
  beforeEach(() => {
    resetAutoArchiveRules();
    vi.restoreAllMocks();
  });

  it('stores rules deduped by sender', () => {
    addAutoArchiveRule('deals@shop.example', 1);
    addAutoArchiveRule('Deals@Shop.example', 2); // same sender, different case
    expect(autoArchiveRules()).toEqual([{ sender: 'deals@shop.example', createdAt: 1 }]);
  });

  it('removes rules', () => {
    addAutoArchiveRule('a@x.example', 1);
    removeAutoArchiveRule('a@x.example');
    expect(autoArchiveRules()).toEqual([]);
  });

  it('sweep archives matching inbox threads per rule', async () => {
    addAutoArchiveRule('deals@shop.example', 1);
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ threads: [{ id: 't1' }, { id: 't2' }] }));
    vi.stubGlobal('fetch', fetchMock);
    const { client, modifyThreadLabels } = spyThreadWriteClient();

    const result = await sweepAutoArchive('tok', client);

    expect(result.archived).toBe(2);
    const url = decodeURIComponent(String(fetchMock.mock.calls[0][0]));
    expect(url).toContain('from:"deals@shop.example"');
    expect(url).toContain('in:inbox');
    expect(modifyThreadLabels).toHaveBeenCalledWith('tok', ['t1', 't2'], {
      add: [], remove: ['INBOX'],
    });
  });

  it('sweep with no rules makes no network calls', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { client } = spyThreadWriteClient();

    const result = await sweepAutoArchive('tok', client);

    expect(result.archived).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("one rule's failure doesn't starve the rest", async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    addAutoArchiveRule('bad@x.example', 1);
    addAutoArchiveRule('good@x.example', 2);
    const fetchMock = vi.fn().mockImplementation((url: string) =>
      decodeURIComponent(String(url)).includes('bad@x.example')
        ? Promise.resolve({ ok: false, status: 500 } as Response)
        : Promise.resolve(jsonResponse({ threads: [{ id: 't9' }] })),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { client } = spyThreadWriteClient();

    const result = await sweepAutoArchive('tok', client);
    expect(result.archived).toBe(1);
  });
});
