// Lists a label's messages by label ID (`labelIds=`), not `q=` search: search
// is eventually consistent, so a just-archived thread would keep showing up in
// its old list for seconds after the write. Id listing reflects writes
// immediately.

import { parseGmailMessage, type RawGmailMessage } from './parseMessage';
import { gmailJson } from './http';
import { loadAccountAddress } from './accountProfile';
import { appLabelResolver } from './appLabelResolver';
import type { LabelIdResolver } from './labelIds';
import type { EmailSummary } from './types';

export interface LabelFetchResult {
  emails: EmailSummary[];
  failed: number;
}

const EMPTY: LabelFetchResult = { emails: [], failed: 0 };

export async function fetchByLabel(
  token: string,
  label: string,
  maxResults = 25,
  resolver: LabelIdResolver = appLabelResolver(),
): Promise<LabelFetchResult> {
  const labelId = (await resolver.idsFor(token, [label])).get(label);
  // A label that doesn't exist yet (first run, mid-bootstrap) has no mail.
  if (!labelId) return EMPTY;

  const listJson = await gmailJson<{ messages?: { id: string }[] }>(
    token,
    `/messages?labelIds=${encodeURIComponent(labelId)}&maxResults=${maxResults}`,
    'list',
  );
  const ids = listJson.messages ?? [];
  if (ids.length === 0) return EMPTY;

  // The account address (cached) lets the signal layer place us among a
  // message's recipients. A failure here just leaves that one signal "unknown".
  const accountAddress = await loadAccountAddress(token).catch(() => undefined);

  // format=metadata still returns labelIds, which parseGmailMessage needs for
  // the unread flag — keep that if changing this param.
  const settled = await Promise.allSettled(
    ids.map(({ id }) =>
      gmailJson<RawGmailMessage>(
        token,
        // Headers only (never bodies): the display fields plus the ones the
        // signal layer derives fingerprints from (see lib/signals).
        `/messages/${encodeURIComponent(id)}?format=metadata` +
          '&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date' +
          '&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Reply-To' +
          '&metadataHeaders=List-Unsubscribe&metadataHeaders=List-Unsubscribe-Post' +
          '&metadataHeaders=List-Id&metadataHeaders=Precedence' +
          '&metadataHeaders=Auto-Submitted&metadataHeaders=Authentication-Results' +
          '&metadataHeaders=In-Reply-To&metadataHeaders=References',
        'message get',
      ),
    ),
  );

  const emails: EmailSummary[] = [];
  let failed = 0;
  for (const r of settled) {
    if (r.status === 'fulfilled') emails.push(parseGmailMessage(r.value, accountAddress));
    else {
      failed++;
      console.warn('Gmail message fetch failed:', r.reason);
    }
  }
  return { emails, failed };
}
