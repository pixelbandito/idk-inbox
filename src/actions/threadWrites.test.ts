import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createThreadWriteActions } from './threadWrites';
import { cacheThreadSummaries, resetThreadSummaryCache } from '../state/threadSummaryCache';
import type { ThreadWriteClient, ThreadWriteOutcome } from '../lib/gmail/threadWriteClient';
import type { ReadonlyContext } from '../input/types';

const ctx: ReadonlyContext = {
  focusedPanelIndex: 1, focusedPanelKind: 'threadlist', focusedLabel: 'INBOX',
  selection: [], mode: 'idle', signedIn: true,
};

function fakeClient(outcome?: Partial<ThreadWriteOutcome>) {
  const modifyThreadLabels = vi.fn(async (_t: string, threadIds: string[]) => ({
    succeeded: outcome?.succeeded ?? threadIds,
    failed: outcome?.failed ?? [],
  }));
  const client: ThreadWriteClient = {
    modifyThreadLabels,
    deleteLabel: vi.fn(async () => {}),
  };
  return { client, modifyThreadLabels };
}

function actionsWith(client: ThreadWriteClient, token: string | null = 'token') {
  return createThreadWriteActions({ getToken: () => token, client });
}

describe('createThreadWriteActions', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('refuses every write when signed out', async () => {
    const { client, modifyThreadLabels } = fakeClient();
    const actions = actionsWith(client, null);
    const result = await actions.archiveThread({ targets: ['t1'] }, ctx);
    expect(result).toEqual({ ok: false, error: 'Not signed in.' });
    expect(modifyThreadLabels).not.toHaveBeenCalled();
  });

  it('refuses writes with no targets', async () => {
    const { client } = fakeClient();
    const actions = actionsWith(client);
    const result = await actions.archiveThread({ targets: [] }, ctx);
    expect(result.ok).toBe(false);
  });

  it('archive removes INBOX and inverts to restoring it', async () => {
    const { client, modifyThreadLabels } = fakeClient();
    const actions = actionsWith(client);

    const result = await actions.archiveThread({ targets: ['t1', 't2'] }, ctx);

    expect(modifyThreadLabels).toHaveBeenCalledWith('token', ['t1', 't2'], {
      add: [], remove: ['INBOX'],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.description).toBe('Archived 2 threads');
      expect(result.inverse).toEqual({
        action: 'modify-thread-labels',
        args: { targets: ['t1', 't2'], add: ['INBOX'], remove: [] },
        description: expect.any(String),
      });
    }
  });

  it('delete adds TRASH and inverts to untrash + INBOX', async () => {
    const { client, modifyThreadLabels } = fakeClient();
    const actions = actionsWith(client);

    const result = await actions.deleteThread({ targets: ['t1'] }, ctx);

    expect(modifyThreadLabels).toHaveBeenCalledWith('token', ['t1'], {
      add: ['TRASH'], remove: ['INBOX'],
    });
    if (result.ok) {
      expect(result.inverse?.args).toEqual({
        targets: ['t1'], add: ['INBOX'], remove: ['TRASH'],
      });
    }
  });

  it('spam adds SPAM with a symmetric inverse', async () => {
    const { client } = fakeClient();
    const actions = actionsWith(client);
    const result = await actions.spamThread({ targets: ['t1'] }, ctx);
    if (result.ok) {
      expect(result.inverse?.args).toEqual({
        targets: ['t1'], add: ['INBOX'], remove: ['SPAM'],
      });
    }
  });

  it('add-label inverse removes the same label', async () => {
    const { client, modifyThreadLabels } = fakeClient();
    const actions = actionsWith(client);
    const result = await actions.addLabelThread(
      { targets: ['t1'], label: 'idk-inbox/Receipts' }, ctx,
    );
    expect(modifyThreadLabels).toHaveBeenCalledWith('token', ['t1'], {
      add: ['idk-inbox/Receipts'], remove: [],
    });
    if (result.ok) {
      expect(result.inverse?.args).toEqual({
        targets: ['t1'], add: [], remove: ['idk-inbox/Receipts'],
      });
    }
  });

  it('remove-label inverse re-adds the same label', async () => {
    const { client } = fakeClient();
    const actions = actionsWith(client);
    const result = await actions.removeLabelThread(
      { targets: ['t1'], label: 'idk-inbox/Receipts' }, ctx,
    );
    if (result.ok) {
      expect(result.inverse?.args).toEqual({
        targets: ['t1'], add: ['idk-inbox/Receipts'], remove: [],
      });
    }
  });

  it('snooze applies the bucket label pair and removes INBOX', async () => {
    const { client, modifyThreadLabels } = fakeClient();
    const actions = actionsWith(client);

    const result = await actions.snoozeThread(
      { targets: ['t1'], until: '2099-06-01T09:00:00Z' }, ctx,
    );

    expect(modifyThreadLabels).toHaveBeenCalledWith('token', ['t1'], {
      add: ['idk-inbox/Snoozed', 'idk-inbox/Snoozed/2099-06-01-0900'],
      remove: ['INBOX'],
    });
    if (result.ok) {
      expect(result.inverse?.args).toEqual({
        targets: ['t1'],
        add: ['INBOX'],
        remove: ['idk-inbox/Snoozed', 'idk-inbox/Snoozed/2099-06-01-0900'],
      });
    }
  });

  it('snooze refuses a missing, malformed, past, or unrepresentable until', async () => {
    const { client } = fakeClient();
    const actions = actionsWith(client);
    expect((await actions.snoozeThread({ targets: ['t1'] }, ctx)).ok).toBe(false);
    expect((await actions.snoozeThread({ targets: ['t1'], until: 'nope' }, ctx)).ok).toBe(false);
    expect((await actions.snoozeThread({ targets: ['t1'], until: '2020-01-01T00:00:00Z' }, ctx)).ok).toBe(false);
    expect((await actions.snoozeThread({ targets: ['t1'], until: '+010000-01-01T00:00:00Z' }, ctx)).ok).toBe(false);
  });

  it('partial failure succeeds with an inverse scoped to the threads that changed', async () => {
    const { client } = fakeClient({ succeeded: ['t1'], failed: ['t2'] });
    const actions = actionsWith(client);

    const result = await actions.archiveThread({ targets: ['t1', 't2'] }, ctx);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.description).toBe('Archived 1 thread (1 failed)');
      expect(result.inverse?.args).toEqual({ targets: ['t1'], add: ['INBOX'], remove: [] });
    }
  });

  it('total failure returns ok:false', async () => {
    const { client } = fakeClient({ succeeded: [], failed: ['t1'] });
    const actions = actionsWith(client);
    const result = await actions.archiveThread({ targets: ['t1'] }, ctx);
    expect(result.ok).toBe(false);
  });

  it('surfaces client exceptions as readable errors', async () => {
    const client: ThreadWriteClient = {
      modifyThreadLabels: async () => { throw new Error('Gmail write failed: 401'); },
      deleteLabel: async () => {},
    };
    const actions = actionsWith(client);
    const result = await actions.archiveThread({ targets: ['t1'] }, ctx);
    expect(result).toEqual({ ok: false, error: 'Session expired — sign in again.' });
  });

  it('wake-snoozed sweeps due buckets and reports the count', async () => {
    const { client } = fakeClient();
    const sweep = vi.fn(async () => ({ woken: 3 }));
    const actions = createThreadWriteActions({ getToken: () => 'tok', client, sweep });

    const result = await actions.wakeSnoozed({}, ctx);

    expect(sweep).toHaveBeenCalledWith('tok', client);
    expect(result).toEqual({
      ok: true, description: 'Woke 3 snoozed threads', announce: true,
    });
  });

  it('wake-snoozed with nothing due still succeeds quietly', async () => {
    const { client } = fakeClient();
    const sweep = vi.fn(async () => ({ woken: 0 }));
    const actions = createThreadWriteActions({ getToken: () => 'tok', client, sweep });

    const result = await actions.wakeSnoozed({}, ctx);
    // mutated:false so a no-op sweep doesn't trigger a pointless list refresh.
    expect(result).toEqual({ ok: true, description: 'No snoozed threads due', mutated: false });
  });

  it('wake-snoozed requires sign-in and surfaces sweep errors', async () => {
    const { client } = fakeClient();
    const sweep = vi.fn(async () => { throw new Error('Gmail labels list failed: 500'); });
    const signedOut = createThreadWriteActions({ getToken: () => null, client, sweep });
    expect((await signedOut.wakeSnoozed({}, ctx)).ok).toBe(false);

    const actions = createThreadWriteActions({ getToken: () => 'tok', client, sweep });
    const result = await actions.wakeSnoozed({}, ctx);
    expect(result).toEqual({ ok: false, error: 'Gmail labels list failed: 500' });
  });

  it('apply-auto-archive reports and announces archived counts, quiet when none', async () => {
    const { client } = fakeClient();
    const autoArchive = vi.fn(async () => ({ archived: 2 }));
    const actions = createThreadWriteActions({ getToken: () => 'tok', client, autoArchive });
    expect(await actions.applyAutoArchive({}, ctx)).toEqual({
      ok: true, description: 'Auto-archived 2 threads', announce: true,
    });

    const quiet = createThreadWriteActions({
      getToken: () => 'tok', client, autoArchive: vi.fn(async () => ({ archived: 0 })),
    });
    expect(await quiet.applyAutoArchive({}, ctx)).toEqual({
      ok: true, description: 'No mail matched auto-archive rules', mutated: false,
    });
  });

  describe('unsubscribe', () => {
    const summaryWithHeader = {
      id: 'm1', threadId: 't1', from: 'Deals <deals@shop.example>',
      subject: 's', snippet: '', date: '', unread: true,
      listUnsubscribe: '<mailto:leave@shop.example>, <https://shop.example/unsub?u=1>',
    };

    beforeEach(() => resetThreadSummaryCache());

    it('opens the https unsubscribe link and announces, without a Gmail write', async () => {
      cacheThreadSummaries([summaryWithHeader]);
      const { client, modifyThreadLabels } = fakeClient();
      const openExternal = vi.fn(() => true);
      const actions = createThreadWriteActions({ getToken: () => 'tok', client, openExternal });

      const result = await actions.unsubscribeThread({ targets: ['t1'] }, ctx);

      expect(openExternal).toHaveBeenCalledWith('https://shop.example/unsub?u=1');
      expect(modifyThreadLabels).not.toHaveBeenCalled();
      expect(result).toEqual({
        ok: true,
        description: 'Opening unsubscribe for deals@shop.example in your browser…',
        announce: true,
        mutated: false,
      });
    });

    it('reports failure when the browser blocks the open', async () => {
      cacheThreadSummaries([summaryWithHeader]);
      const { client } = fakeClient();
      const openExternal = vi.fn(() => false);
      const actions = createThreadWriteActions({ getToken: () => 'tok', client, openExternal });
      const result = await actions.unsubscribeThread({ targets: ['t1'] }, ctx);
      expect(result.ok).toBe(false);
    });

    it('fails readably without a List-Unsubscribe header or with multiple targets', async () => {
      cacheThreadSummaries([{ ...summaryWithHeader, listUnsubscribe: undefined }]);
      const { client } = fakeClient();
      const openExternal = vi.fn(() => true);
      const actions = createThreadWriteActions({ getToken: () => 'tok', client, openExternal });

      expect((await actions.unsubscribeThread({ targets: ['t1'] }, ctx)).ok).toBe(false);
      expect((await actions.unsubscribeThread({ targets: ['t1', 't2'] }, ctx)).ok).toBe(false);
      expect(openExternal).not.toHaveBeenCalled();
    });
  });
});
