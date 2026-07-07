// Gmail's modify endpoints take label *ids* (e.g. "Label_7"), but the rest of
// the app speaks in label *names*. This resolver hides the mapping plus the
// create-on-demand path for app sublabels (snooze buckets, user tags).

const BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

// System label ids equal their names, so they never need the network.
const SYSTEM_LABELS = new Set([
  'INBOX', 'UNREAD', 'STARRED', 'IMPORTANT', 'SPAM', 'TRASH', 'SENT', 'DRAFT',
]);

interface GmailLabel { id: string; name: string; }

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
}

async function fetchAllLabels(token: string): Promise<GmailLabel[]> {
  const res = await fetch(`${BASE}/labels`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Gmail labels list failed: ${res.status}`);
  const json = (await res.json()) as { labels?: GmailLabel[] };
  return json.labels ?? [];
}

async function createLabel(token: string, name: string): Promise<GmailLabel> {
  const res = await fetch(`${BASE}/labels`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(`Gmail label create failed: ${res.status}`);
  return (await res.json()) as GmailLabel;
}

export function createLabelIdResolver(): LabelIdResolver {
  const idByName = new Map<string, string>();
  let listLoaded = false;

  async function loadListOnce(token: string): Promise<void> {
    if (listLoaded) return;
    for (const label of await fetchAllLabels(token)) {
      idByName.set(label.name, label.id);
    }
    listLoaded = true;
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

      await loadListOnce(token);
      for (const name of unknown) {
        let id = idByName.get(name);
        if (!id && opts.createMissing) {
          id = (await createLabel(token, name)).id;
          idByName.set(name, id);
        }
        if (id) resolved.set(name, id);
      }
      return resolved;
    },
  };
}
