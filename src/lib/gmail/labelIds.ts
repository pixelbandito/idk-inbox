// Gmail's modify endpoints take label *ids* (e.g. "Label_7"), but the rest of
// the app speaks in label *names*. This resolver hides the mapping plus the
// create-on-demand path for app sublabels (snooze buckets, user tags).
//
// Ids are PER-ACCOUNT: never let a resolver (or anything holding one) outlive
// a sign-out. Callers that delete labels must evict() them here, or later
// writes will send Gmail a dead id.

import { gmailJson } from './http';
import type { GmailLabel } from './types';

// System label ids equal their names, so they never need the network.
const SYSTEM_LABELS = new Set([
  'INBOX', 'UNREAD', 'STARRED', 'IMPORTANT', 'SPAM', 'TRASH', 'SENT', 'DRAFT',
]);

// A cache miss re-lists at most this often — covers labels created by the
// bootstrap (or another client) after our first listing.
const RELIST_INTERVAL_MS = 30_000;

export interface ResolveOptions {
  /** Create labels that don't exist yet (used for the add side of a modify). */
  createMissing?: boolean;
}

export interface LabelIdResolver {
  /**
   * Maps label names to ids. Names that can't be resolved (and aren't being
   * created) are simply absent from the result — removing a label a thread
   * doesn't have is a no-op anyway.
   */
  idsFor(token: string, names: string[], opts?: ResolveOptions): Promise<Map<string, string>>;
  /** Forget a label after deleting it, so its dead id can't be reused. */
  evict(name: string): void;
}

export function createLabelIdResolver(): LabelIdResolver {
  const idByName = new Map<string, string>();
  const pendingCreates = new Map<string, Promise<string>>();
  let listPromise: Promise<void> | null = null;
  let listLoadedAt = 0;

  function refreshList(token: string): Promise<void> {
    // Concurrent misses share one in-flight listing.
    listPromise ??= (async () => {
      const json = await gmailJson<{ labels?: GmailLabel[] }>(token, '/labels', 'labels list');
      for (const label of json.labels ?? []) idByName.set(label.name, label.id);
      listLoadedAt = Date.now();
    })().finally(() => { listPromise = null; });
    return listPromise;
  }

  function createOnce(token: string, name: string): Promise<string> {
    // Concurrent creates of the same name (e.g. two rapid snoozes into the
    // same bucket) share one POST instead of colliding with a 409.
    let create = pendingCreates.get(name);
    if (!create) {
      create = gmailJson<GmailLabel>(token, '/labels', 'label create', {
        method: 'POST',
        body: { name },
      })
        .then((label) => {
          idByName.set(name, label.id);
          return label.id;
        })
        .finally(() => { pendingCreates.delete(name); });
      pendingCreates.set(name, create);
    }
    return create;
  }

  return {
    async idsFor(token, names, opts = {}) {
      const resolved = new Map<string, string>();
      const unknown: string[] = [];
      for (const name of names) {
        if (SYSTEM_LABELS.has(name)) resolved.set(name, name);
        else if (idByName.has(name)) resolved.set(name, idByName.get(name)!);
        else unknown.push(name);
      }
      if (unknown.length === 0) return resolved;

      if (Date.now() - listLoadedAt >= RELIST_INTERVAL_MS) await refreshList(token);
      for (const name of unknown) {
        let id = idByName.get(name);
        if (!id && opts.createMissing) id = await createOnce(token, name);
        if (id) resolved.set(name, id);
      }
      return resolved;
    },

    evict(name) {
      idByName.delete(name);
    },
  };
}
