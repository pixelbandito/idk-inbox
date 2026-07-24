import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  addAutoArchiveRule,
  autoArchiveRules,
  removeAutoArchiveRule,
  resetAutoArchiveRules,
  sweepAutoArchive,
  ruleEnabled,
  setAutoArchiveRuleEnabled,
  setAllAutoArchiveRulesEnabled,
  removeAllAutoArchiveRules,
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

  it('refuses rules for addresses that could break out of the search query', () => {
    addAutoArchiveRule('legit@x.com" or in:inbox or "@x.com', 1);
    addAutoArchiveRule('Sneaky <legit@x.com" or in:inbox or "@x.com>', 1);
    expect(autoArchiveRules()).toEqual([]);
  });

  it('sweep skips stored rules with non-plain addresses (defense in depth)', async () => {
    localStorage.setItem(
      'idk-inbox:auto-archive-rules',
      JSON.stringify([{ sender: 'bad" or in:inbox or "@x.com', createdAt: 1 }]),
    );
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { client } = spyThreadWriteClient();

    const result = await sweepAutoArchive('tok', client);

    expect(result.archived).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
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

describe('pausing rules', () => {
  beforeEach(() => { resetAutoArchiveRules(); vi.restoreAllMocks(); });

  it('defaults to enabled and can be paused and resumed', () => {
    addAutoArchiveRule('a@b.c', 1);
    expect(ruleEnabled(autoArchiveRules()[0])).toBe(true);
    setAutoArchiveRuleEnabled('a@b.c', false);
    expect(ruleEnabled(autoArchiveRules()[0])).toBe(false);
    setAutoArchiveRuleEnabled('a@b.c', true);
    expect(ruleEnabled(autoArchiveRules()[0])).toBe(true);
  });

  it('disable-all and delete-all act on every rule', () => {
    addAutoArchiveRule('a@b.c', 1);
    addAutoArchiveRule('d@e.f', 2);
    setAllAutoArchiveRulesEnabled(false);
    expect(autoArchiveRules().every((r) => !ruleEnabled(r))).toBe(true);
    removeAllAutoArchiveRules();
    expect(autoArchiveRules()).toEqual([]);
  });

  it('the sweep skips a paused rule', async () => {
    addAutoArchiveRule('a@b.c', 1);
    setAutoArchiveRuleEnabled('a@b.c', false);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { client } = spyThreadWriteClient();
    const result = await sweepAutoArchive('tok', client);
    expect(result.archived).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled(); // no search issued for a paused rule
  });
});
