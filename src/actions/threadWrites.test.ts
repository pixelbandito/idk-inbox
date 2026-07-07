import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createThreadWriteActions } from './threadWrites';
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
      { targets: ['t1'], until: '2026-06-01T09:00:00Z' }, ctx,
    );

    expect(modifyThreadLabels).toHaveBeenCalledWith('token', ['t1'], {
      add: ['idk-inbox/Snoozed', 'idk-inbox/Snoozed/2026-06-01-0900'],
      remove: ['INBOX'],
    });
    if (result.ok) {
      expect(result.inverse?.args).toEqual({
        targets: ['t1'],
        add: ['INBOX'],
        remove: ['idk-inbox/Snoozed', 'idk-inbox/Snoozed/2026-06-01-0900'],
      });
    }
  });

  it('snooze refuses a missing or malformed until', async () => {
    const { client } = fakeClient();
    const actions = actionsWith(client);
    expect((await actions.snoozeThread({ targets: ['t1'] }, ctx)).ok).toBe(false);
    expect((await actions.snoozeThread({ targets: ['t1'], until: 'nope' }, ctx)).ok).toBe(false);
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
    expect(result).toEqual({ ok: false, error: 'Gmail write failed: 401' });
  });

  it('wake-snoozed sweeps due buckets and reports the count', async () => {
    const { client } = fakeClient();
    const sweep = vi.fn(async () => ({ woken: 3 }));
    const actions = createThreadWriteActions({ getToken: () => 'tok', client, sweep });

    const result = await actions.wakeSnoozed({}, ctx);

    expect(sweep).toHaveBeenCalledWith('tok', client);
    expect(result).toEqual({ ok: true, description: 'Woke 3 snoozed threads' });
  });

  it('wake-snoozed with nothing due still succeeds quietly', async () => {
    const { client } = fakeClient();
    const sweep = vi.fn(async () => ({ woken: 0 }));
    const actions = createThreadWriteActions({ getToken: () => 'tok', client, sweep });

    const result = await actions.wakeSnoozed({}, ctx);
    expect(result).toEqual({ ok: true, description: 'No snoozed threads due' });
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

  it('unsubscribe is honestly unimplemented', async () => {
    const { client } = fakeClient();
    const actions = actionsWith(client);
    const result = await actions.unsubscribeThread({ targets: ['t1'] }, ctx);
    expect(result.ok).toBe(false);
  });
});
