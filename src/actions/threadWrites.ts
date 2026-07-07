// Thread-write action handlers: archive, delete, spam, label, snooze.
// Every write is a label change applied through the ThreadWriteClient, and
// every inverse is the mirrored label change — which is what makes undo a
// plain re-dispatch of `modify-thread-labels` instead of per-action code.

import type { ActionResult, ReadonlyContext, ThreadRef } from '../input/types';
import {
  createThreadWriteClient,
  type LabelChange,
  type ThreadWriteClient,
} from '../lib/gmail/threadWriteClient';
import { SNOOZED_LABEL } from '../lib/gmail/labelBootstrap';
import { snoozeBucketLabel } from '../lib/snooze/bucket';
import { sweepDueSnoozes, type WakeSweepResult } from '../lib/snooze/wakeSweep';

export interface ModifyArgs       { targets: ThreadRef[]; add: string[]; remove: string[]; }
export interface SingleTargetArgs { targets: ThreadRef[]; }
export interface LabelArgs        { targets: ThreadRef[]; label: string; }
export interface SnoozeArgs       { targets: ThreadRef[]; until?: string; }

export interface ThreadWriteDeps {
  getToken: () => string | null;
  client?: ThreadWriteClient;
  /** Test seam: overrides the real snooze wake-up sweep. */
  sweep?: (token: string, client: ThreadWriteClient) => Promise<WakeSweepResult>;
}

function summarize(n: number, verb: string): string {
  return `${verb} ${n} thread${n === 1 ? '' : 's'}`;
}

export function createThreadWriteActions({ getToken, client, sweep }: ThreadWriteDeps) {
  const writes = client ?? createThreadWriteClient();
  const runSweep = sweep ?? sweepDueSnoozes;

  /**
   * Shared write path: apply `change` to `targets`, report a human summary,
   * and hand undo an inverse scoped to the threads that actually changed.
   */
  async function applyChange(
    targets: ThreadRef[],
    change: LabelChange,
    verbs: { done: string; undone: string },
  ): Promise<ActionResult> {
    if (targets.length === 0) return { ok: false, error: 'No targets specified.' };
    const token = getToken();
    if (!token) return { ok: false, error: 'Not signed in.' };

    let outcome;
    try {
      outcome = await writes.modifyThreadLabels(token, targets, change);
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Gmail write failed.' };
    }

    const { succeeded, failed } = outcome;
    if (succeeded.length === 0) {
      return { ok: false, error: `${verbs.done} failed for all ${targets.length} thread${targets.length === 1 ? '' : 's'}.` };
    }

    const suffix = failed.length > 0 ? ` (${failed.length} failed)` : '';
    return {
      ok: true,
      description: summarize(succeeded.length, verbs.done) + suffix,
      inverse: {
        action: 'modify-thread-labels',
        args: { targets: succeeded, add: change.remove, remove: change.add },
        description: summarize(succeeded.length, verbs.undone),
      },
    };
  }

  return {
    modifyThreadLabels: (args: ModifyArgs, _ctx: ReadonlyContext) =>
      applyChange(args.targets, { add: args.add, remove: args.remove },
        { done: 'Modified', undone: 'Reverted' }),

    archiveThread: (args: SingleTargetArgs, _ctx: ReadonlyContext) =>
      applyChange(args.targets, { add: [], remove: ['INBOX'] },
        { done: 'Archived', undone: 'Restored' }),

    deleteThread: (args: SingleTargetArgs, _ctx: ReadonlyContext) =>
      applyChange(args.targets, { add: ['TRASH'], remove: ['INBOX'] },
        { done: 'Deleted', undone: 'Restored' }),

    spamThread: (args: SingleTargetArgs, _ctx: ReadonlyContext) =>
      applyChange(args.targets, { add: ['SPAM'], remove: ['INBOX'] },
        { done: 'Marked as spam', undone: 'Restored' }),

    addLabelThread: (args: LabelArgs, _ctx: ReadonlyContext) =>
      applyChange(args.targets, { add: [args.label], remove: [] },
        { done: `Labelled with ${args.label}`, undone: 'Restored' }),

    removeLabelThread: (args: LabelArgs, _ctx: ReadonlyContext) =>
      applyChange(args.targets, { add: [], remove: [args.label] },
        { done: `Removed ${args.label}`, undone: 'Restored' }),

    snoozeThread: async (args: SnoozeArgs, _ctx: ReadonlyContext): Promise<ActionResult> => {
      if (!args.until) return { ok: false, error: 'Snooze duration required.' };
      const until = new Date(args.until);
      if (Number.isNaN(until.getTime())) return { ok: false, error: 'Invalid snooze date.' };
      return applyChange(
        args.targets,
        { add: [SNOOZED_LABEL, snoozeBucketLabel(until)], remove: ['INBOX'] },
        { done: 'Snoozed', undone: 'Unsnoozed' },
      );
    },

    /**
     * Returns due snoozed threads to the inbox. Registered as a thread-write
     * so a successful sweep rides the same refresh path as any other write.
     * No inverse — waking is what the user asked for when they snoozed.
     */
    wakeSnoozed: async (_args: Record<string, never>, _ctx: ReadonlyContext): Promise<ActionResult> => {
      const token = getToken();
      if (!token) return { ok: false, error: 'Not signed in.' };
      try {
        const { woken } = await runSweep(token, writes);
        return {
          ok: true,
          description: woken > 0
            ? `Woke ${woken} snoozed thread${woken === 1 ? '' : 's'}`
            : 'No snoozed threads due',
        };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : 'Snooze sweep failed.' };
      }
    },

    // Real unsubscribe (List-Unsubscribe header) is a later slice; failing
    // honestly beats pretending it worked.
    unsubscribeThread: async (_args: SingleTargetArgs, _ctx: ReadonlyContext): Promise<ActionResult> =>
      ({ ok: false, error: 'Unsubscribe is not implemented yet.' }),
  };
}
