// With no server, snooze wake-up happens here: on app open (and any manual
// dispatch of `wake-snoozed`) we scan the snooze bucket labels, return due
// threads to the inbox, and delete buckets that emptied cleanly.

import type { ThreadWriteClient } from '../gmail/threadWriteClient';
import { SNOOZED_LABEL } from '../gmail/labelBootstrap';
import { wakeTimeOf } from './bucket';

const BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';
// A single snooze bucket holding >100 threads is beyond plausible personal use.
const MAX_THREADS_PER_BUCKET = 100;

export interface WakeSweepResult {
  woken: number;
}

interface GmailLabel { id: string; name: string; }

function authHeaders(token: string) {
  return { headers: { Authorization: `Bearer ${token}` } };
}

async function listLabels(token: string): Promise<GmailLabel[]> {
  const res = await fetch(`${BASE}/labels`, authHeaders(token));
  if (!res.ok) throw new Error(`Gmail labels list failed: ${res.status}`);
  const json = (await res.json()) as { labels?: GmailLabel[] };
  return json.labels ?? [];
}

async function listThreadIdsByLabel(token: string, labelName: string): Promise<string[]> {
  const q = encodeURIComponent(`label:"${labelName}"`);
  const res = await fetch(
    `${BASE}/threads?q=${q}&maxResults=${MAX_THREADS_PER_BUCKET}`,
    authHeaders(token),
  );
  if (!res.ok) throw new Error(`Gmail threads list failed: ${res.status}`);
  const json = (await res.json()) as { threads?: { id: string }[] };
  return (json.threads ?? []).map((t) => t.id);
}

async function deleteLabel(token: string, labelId: string): Promise<void> {
  const res = await fetch(`${BASE}/labels/${labelId}`, {
    method: 'DELETE',
    ...authHeaders(token),
  });
  if (!res.ok) throw new Error(`Gmail label delete failed: ${res.status}`);
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
  const threadIds = await listThreadIdsByLabel(token, bucket.name);

  let wokenCount = threadIds.length;
  let fullySwept = true;
  if (threadIds.length > 0) {
    const outcome = await client.modifyThreadLabels(token, threadIds, {
      add: ['INBOX'],
      remove: [SNOOZED_LABEL, bucket.name],
    });
    wokenCount = outcome.succeeded.length;
    fullySwept = outcome.failed.length === 0;
  }

  // Only drop the bucket when nothing is left behind in it.
  if (fullySwept) await deleteLabel(token, bucket.id);
  return wokenCount;
}

export async function sweepDueSnoozes(
  token: string,
  client: ThreadWriteClient,
  now: Date = new Date(),
): Promise<WakeSweepResult> {
  const due = dueBuckets(await listLabels(token), now);

  let woken = 0;
  for (const bucket of due) {
    woken += await wakeBucket(token, client, bucket);
  }
  return { woken };
}
