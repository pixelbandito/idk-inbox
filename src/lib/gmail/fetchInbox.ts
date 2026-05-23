import { parseGmailMessage, type RawGmailMessage } from './parseMessage';
import type { EmailSummary } from './types';

const BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

function authHeaders(token: string) {
  return { headers: { Authorization: `Bearer ${token}` } };
}

export interface InboxResult {
  emails: EmailSummary[];
  failed: number;
}

export async function fetchInbox(token: string, maxResults = 25): Promise<InboxResult> {
  const listRes = await fetch(
    `${BASE}/messages?q=in:inbox&maxResults=${maxResults}`,
    authHeaders(token),
  );
  if (!listRes.ok) throw new Error(`Gmail list failed: ${listRes.status}`);

  const listJson = (await listRes.json()) as { messages?: { id: string }[] };
  const ids = listJson.messages ?? [];

  // Per-message gets in parallel. Use allSettled so a single rate-limited
  // message (429) doesn't discard the whole inbox — the user sees the rest,
  // and the failed count surfaces in the UI.
  const settled = await Promise.allSettled(
    ids.map(async ({ id }) => {
      // format=metadata still returns labelIds, which parseGmailMessage needs
      // for the unread flag — keep that if changing this param.
      const res = await fetch(
        `${BASE}/messages/${id}?format=metadata` +
          `&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
        authHeaders(token),
      );
      if (!res.ok) throw new Error(`Gmail get failed: ${res.status}`);
      return (await res.json()) as RawGmailMessage;
    }),
  );

  const emails: EmailSummary[] = [];
  let failed = 0;
  for (const r of settled) {
    if (r.status === 'fulfilled') {
      emails.push(parseGmailMessage(r.value));
    } else {
      failed++;
      console.warn('Gmail message fetch failed:', r.reason);
    }
  }

  return { emails, failed };
}
