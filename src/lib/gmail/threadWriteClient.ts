// Applies label changes (by name) to Gmail threads. Hides two API quirks so
// action handlers and undo entries can speak purely in labels:
//
//   - modify endpoints want label ids, not names (delegated to LabelIdResolver)
//   - TRASH can't go through threads.modify; it needs threads.trash/untrash
//
// Writes fan out per thread and report per-thread failures, so one bad thread
// doesn't abort a batch.

import { createLabelIdResolver, type LabelIdResolver } from './labelIds';
import { gmailDelete, gmailJson } from './http';

export interface LabelChange {
  add: string[];
  remove: string[];
}

export interface ThreadWriteOutcome {
  succeeded: string[];
  failed: string[];
}

export interface ThreadWriteClient {
  /**
   * Applies a label change to each thread. TRASH in `add`/`remove` is
   * translated to the trash/untrash endpoints behind the scenes.
   */
  modifyThreadLabels(
    token: string,
    threadIds: string[],
    change: LabelChange,
  ): Promise<ThreadWriteOutcome>;
  /**
   * Deletes a label by name (idempotent — a 404 counts as done) and evicts it
   * from the id cache so later writes can't reuse the dead id.
   */
  deleteLabel(token: string, name: string): Promise<void>;
}

/** One thread's worth of API calls, in order. */
interface WritePlan {
  trash: boolean;
  untrash: boolean;
  addLabelIds: string[];
  removeLabelIds: string[];
}

async function post(token: string, path: string, body?: unknown): Promise<void> {
  await gmailJson<unknown>(token, path, 'write', { method: 'POST', body });
}

async function planChange(
  token: string,
  change: LabelChange,
  resolver: LabelIdResolver,
): Promise<WritePlan> {
  const trash = change.add.includes('TRASH');
  const untrash = change.remove.includes('TRASH');

  const addNames = change.add.filter((n) => n !== 'TRASH');
  // Trashing already takes the thread out of the inbox.
  const removeNames = change.remove.filter((n) => n !== 'TRASH' && !(trash && n === 'INBOX'));

  const addIds = await resolver.idsFor(token, addNames, { createMissing: true });
  const removeIds = await resolver.idsFor(token, removeNames);

  return {
    trash,
    untrash,
    addLabelIds: addNames.map((n) => addIds.get(n)).filter((id): id is string => !!id),
    removeLabelIds: removeNames.map((n) => removeIds.get(n)).filter((id): id is string => !!id),
  };
}

async function applyPlan(token: string, threadId: string, plan: WritePlan): Promise<void> {
  const id = encodeURIComponent(threadId);
  if (plan.trash) await post(token, `/threads/${id}/trash`);
  if (plan.untrash) await post(token, `/threads/${id}/untrash`);
  if (plan.addLabelIds.length > 0 || plan.removeLabelIds.length > 0) {
    await post(token, `/threads/${id}/modify`, {
      addLabelIds: plan.addLabelIds,
      removeLabelIds: plan.removeLabelIds,
    });
  }
}

export function createThreadWriteClient(
  resolver: LabelIdResolver = createLabelIdResolver(),
): ThreadWriteClient {
  return {
    async modifyThreadLabels(token, threadIds, change) {
      const plan = await planChange(token, change, resolver);

      const settled = await Promise.allSettled(
        threadIds.map((id) => applyPlan(token, id, plan)),
      );

      const outcome: ThreadWriteOutcome = { succeeded: [], failed: [] };
      settled.forEach((result, i) => {
        if (result.status === 'fulfilled') outcome.succeeded.push(threadIds[i]);
        else outcome.failed.push(threadIds[i]);
      });
      return outcome;
    },

    async deleteLabel(token, name) {
      const ids = await resolver.idsFor(token, [name]);
      const id = ids.get(name);
      if (!id) return; // already gone
      await gmailDelete(token, `/labels/${encodeURIComponent(id)}`, 'label delete');
      resolver.evict(name);
    },
  };
}
