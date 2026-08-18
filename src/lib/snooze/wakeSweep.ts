// With no server, snooze wake-up happens here: on app open (and any manual
// dispatch of `wake-snoozed`) we scan the snooze bucket labels, return due
// threads to the inbox, and delete buckets that emptied cleanly.
//
// Bucket members are listed by label ID (`labelIds=`), never by `q=` search:
// search is eventually consistent, and deleting a bucket on the strength of a
// stale empty search result would strand its threads in snoozed-forever.

import type { ThreadWriteClient } from '../gmail/threadWriteClient';
import { SNOOZED_LABEL } from '../gmail/labelBootstrap';
import { gmailJson } from '../gmail/http';
import type { GmailLabel } from '../gmail/types';
import { wakeTimeOf } from './bucket';

// Listing is capped, not paginated; a bucket at the cap is treated as
// partially swept so its label survives for the next sweep.
const MAX_THREADS_PER_BUCKET = 100;

export interface WakeSweepResult {
  woken: number;
}

async function listLabels(token: string): Promise<GmailLabel[]> {
  const json = await gmailJson<{ labels?: GmailLabel[] }>(token, '/labels', 'labels list');
  return json.labels ?? [];
}

async function listThreadIdsByLabelId(token: string, labelId: string): Promise<string[]> {
  const json = await gmailJson<{ threads?: { id: string }[] }>(
    token,
    `/threads?labelIds=${encodeURIComponent(labelId)}&maxResults=${MAX_THREADS_PER_BUCKET}`,
    'threads list',
  );
  return (json.threads ?? []).map((t) => t.id);
}

function dueBuckets(labels: GmailLabel[], now: Date): GmailLabel[] {
  return labels.filter((label) => {
    const wake = wakeTimeOf(label.name);
    return wake !== null && wake.getTime() <= now.getTime();
  });
}

async function wakeBucket(
  token: string,
  client: ThreadWriteClient,
  bucket: GmailLabel,
): Promise<number> {
  const threadIds = await listThreadIdsByLabelId(token, bucket.id);
  const fullyListed = threadIds.length < MAX_THREADS_PER_BUCKET;

  let wokenCount = 0;
  let allSucceeded = true;
  if (threadIds.length > 0) {
    const outcome = await client.modifyThreadLabels(token, threadIds, {
      add: ['INBOX'],
      remove: [SNOOZED_LABEL, bucket.name],
    });
    wokenCount = outcome.succeeded.length;
    allSucceeded = outcome.failed.length === 0;
  }

  // Only drop the bucket when we saw ALL of it and everything woke.
  if (fullyListed && allSucceeded) await client.deleteLabel(token, bucket.name);
  return wokenCount;
}

export async function sweepDueSnoozes(
  token: string,
  client: ThreadWriteClient,
  now: Date = new Date(),
): Promise<WakeSweepResult> {
  const due = dueBuckets(await listLabels(token), now);

  // One broken bucket must not starve the rest; its label survives for the
  // next sweep to retry.
  let woken = 0;
  for (const bucket of due) {
    try {
      woken += await wakeBucket(token, client, bucket);
    } catch (e) {
      console.warn(`snooze sweep failed for ${bucket.name}:`, e);
    }
  }
  return { woken };
}
