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
import { senderAddressOf } from '../lib/gmail/address';
import { unsubscribeUriOf } from '../lib/gmail/unsubscribe';
import { snoozeBucketLabel } from '../lib/snooze/bucket';
import { sweepDueSnoozes, type WakeSweepResult } from '../lib/snooze/wakeSweep';
import { sweepAutoArchive, type AutoArchiveSweepResult } from '../lib/rules/autoArchive';
import { threadSummaryOf } from '../state/threadSummaryCache';

export interface ModifyArgs       { targets: ThreadRef[]; add: string[]; remove: string[]; }
export interface SingleTargetArgs { targets: ThreadRef[]; }
export interface LabelArgs        { targets: ThreadRef[]; label: string; }
export interface SnoozeArgs       { targets: ThreadRef[]; until?: string; }

export interface ThreadWriteDeps {
  getToken: () => string | null;
  client?: ThreadWriteClient;
  /** Test seam: overrides the real snooze wake-up sweep. */
  sweep?: (token: string, client: ThreadWriteClient) => Promise<WakeSweepResult>;
  /** Test seam: overrides the real auto-archive rule sweep. */
  autoArchive?: (token: string, client: ThreadWriteClient) => Promise<AutoArchiveSweepResult>;
  /**
   * Opens a URL outside the app. Returns false if the open was blocked
   * (popup blocker, standalone PWA). Defaults to window.open. Test seam.
   */
  openExternal?: (url: string) => boolean;
}

function summarize(n: number, verb: string): string {
  return `${verb} ${n} thread${n === 1 ? '' : 's'}`;
}

/**
 * mailto: links are navigations, not popups — window.open('mailto:') no-ops in
 * standalone PWAs, so route those through location.href. Returns whether the
 * open plausibly succeeded (a null window.open means the popup was blocked).
 */
function defaultOpenExternal(url: string): boolean {
  if (url.startsWith('mailto:')) {
    window.location.href = url;
    return true;
  }
  return window.open(url, '_blank', 'noopener') !== null;
}

/** Turns a raw Gmail error into something a user can act on. */
function humanizeWriteError(e: unknown): string {
  const message = e instanceof Error ? e.message : 'Gmail write failed.';
  if (/\b40[13]\b/.test(message)) return 'Session expired — sign in again.';
  return message;
}

export function createThreadWriteActions({ getToken, client, sweep, autoArchive, openExternal }: ThreadWriteDeps) {
  const writes = client ?? createThreadWriteClient();
  const runSweep = sweep ?? sweepDueSnoozes;
  const runAutoArchive = autoArchive ?? sweepAutoArchive;
  const openUrl = openExternal ?? defaultOpenExternal;

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
      return { ok: false, error: humanizeWriteError(e) };
    }

    const { succeeded, failed } = outcome;
    if (succeeded.length === 0) {
      return { ok: false, error: `${summarize(0, verbs.done)} of ${targets.length} — nothing changed.` };
    }

    const suffix = failed.length > 0 ? ` (${failed.length} failed)` : '';
    return {
      ok: true,
      description: summarize(succeeded.length, verbs.done) + suffix,
      affectedTargets: succeeded,
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
      // A past wake time would file the thread into an already-due bucket —
      // hidden until the next sweep. Beyond 9999 the bucket codec can't
      // represent the date at all.
      if (until.getTime() <= Date.now()) return { ok: false, error: 'Snooze time must be in the future.' };
      if (until.getUTCFullYear() > 9999) return { ok: false, error: 'Snooze time is too far out.' };
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
        if (woken === 0) {
          // Nothing changed: skip the list refresh and stay quiet.
          return { ok: true, description: 'No snoozed threads due', mutated: false };
        }
        return {
          ok: true,
          description: `Woke ${woken} snoozed thread${woken === 1 ? '' : 's'}`,
          announce: true,
        };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : 'Snooze sweep failed.' };
      }
    },

    /** Applies the locally stored auto-archive rules; same refresh ride as wake-snoozed. */
    applyAutoArchive: async (_args: Record<string, never>, _ctx: ReadonlyContext): Promise<ActionResult> => {
      const token = getToken();
      if (!token) return { ok: false, error: 'Not signed in.' };
      try {
        const { archived } = await runAutoArchive(token, writes);
        if (archived === 0) {
          return { ok: true, description: 'No mail matched auto-archive rules', mutated: false };
        }
        return {
          ok: true,
          description: `Auto-archived ${archived} thread${archived === 1 ? '' : 's'}`,
          announce: true,
        };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : 'Auto-archive sweep failed.' };
      }
    },

    /**
     * Opens the sender's List-Unsubscribe page (or mailto). No Gmail write
     * happens — the user finishes on the sender's side — so mutated:false
     * and no inverse.
     */
    unsubscribeThread: async (args: SingleTargetArgs, _ctx: ReadonlyContext): Promise<ActionResult> => {
      if (args.targets.length !== 1) {
        return { ok: false, error: 'Unsubscribe works on one thread at a time.' };
      }
      const summary = threadSummaryOf(args.targets[0]);
      const uri = summary?.listUnsubscribe ? unsubscribeUriOf(summary.listUnsubscribe) : null;
      if (!summary || !uri) {
        return { ok: false, error: 'No unsubscribe link found for this sender.' };
      }
      if (!openUrl(uri)) {
        return { ok: false, error: "Couldn't open the unsubscribe page — check popup settings." };
      }
      return {
        ok: true,
        description: `Opening unsubscribe for ${senderAddressOf(summary.from)} in your browser…`,
        announce: true,
        mutated: false,
      };
    },
  };
}
