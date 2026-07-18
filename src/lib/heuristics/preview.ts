// Honest, forward-looking preview for a suggestion: "how many messages already
// in your inbox would this touch, right now?" A live, read-only Gmail search —
// never a fabricated historical count (docs/plans/2026-07-12-signal-catalog-
// and-measurement.md §4). No writes.

import { gmailJson } from '../gmail/http';
import { isPlainEmailAddress } from '../gmail/address';
import type { Suggestion } from './catalog';

// Matches the auto-archive sweep's cap, so the preview and the action agree.
const MAX = 100;

/** Read-only Gmail query for a fingerprint's current inbox mail, or null. */
function inboxQueryFor(fingerprint: Suggestion['fingerprint']): string | null {
  if (fingerprint.kind === 'sender') {
    // From headers are attacker-controlled; only plain addresses may be quoted
    // into a query, or a crafted value could widen it.
    return isPlainEmailAddress(fingerprint.value) ? `from:"${fingerprint.value}" in:inbox` : null;
  }
  // A List-Id is a dotted token; allow-list its shape before interpolating.
  return /^[a-z0-9._-]+$/i.test(fingerprint.value) ? `list:${fingerprint.value} in:inbox` : null;
}

export interface InboxPreview {
  /** Threads matching in the inbox now. */
  count: number;
  /** True when the count hit the cap and the real number may be higher. */
  atLeast: boolean;
}

/** Count the fingerprint's mail currently in the inbox (0 if unquantifiable). */
export async function previewInboxMatches(
  token: string,
  fingerprint: Suggestion['fingerprint'],
): Promise<InboxPreview> {
  const q = inboxQueryFor(fingerprint);
  if (!q) return { count: 0, atLeast: false };
  const json = await gmailJson<{ threads?: { id: string }[] }>(
    token,
    `/threads?q=${encodeURIComponent(q)}&maxResults=${MAX}`,
    'preview search',
  );
  const count = (json.threads ?? []).length;
  return { count, atLeast: count >= MAX };
}
