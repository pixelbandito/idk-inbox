// User-accepted auto-archive rules ("archive future mail from this sender"),
// stored locally and applied by a client-side sweep at app open — the
// Apps Script engine from the original design will subsume this later.
//
// The sweep searches with `q=` (eventually consistent) on purpose: archiving
// is additive and idempotent, so mail a stale index misses is simply caught
// by the next sweep. Nothing here deletes anything based on emptiness.

import type { ThreadWriteClient } from '../gmail/threadWriteClient';
import { gmailJson } from '../gmail/http';
import { senderAddressOf } from '../gmail/address';

const STORAGE_KEY = 'idk-inbox:auto-archive-rules';
const MAX_THREADS_PER_RULE = 100;

export interface AutoArchiveRule {
  sender: string;
  createdAt: number;
}

export interface AutoArchiveSweepResult {
  archived: number;
}

export function autoArchiveRules(): AutoArchiveRule[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as AutoArchiveRule[];
  } catch {
    return [];
  }
}

export function addAutoArchiveRule(sender: string, now: number = Date.now()): void {
  const address = senderAddressOf(sender);
  const rules = autoArchiveRules();
  if (rules.some((r) => r.sender === address)) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...rules, { sender: address, createdAt: now }]));
}

export function removeAutoArchiveRule(sender: string): void {
  const address = senderAddressOf(sender);
  const rules = autoArchiveRules().filter((r) => r.sender !== address);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
}

export function resetAutoArchiveRules(): void {
  localStorage.removeItem(STORAGE_KEY);
}

async function inboxThreadIdsFrom(token: string, sender: string): Promise<string[]> {
  const q = encodeURIComponent(`from:"${sender}" in:inbox`);
  const json = await gmailJson<{ threads?: { id: string }[] }>(
    token,
    `/threads?q=${q}&maxResults=${MAX_THREADS_PER_RULE}`,
    'threads search',
  );
  return (json.threads ?? []).map((t) => t.id);
}

export async function sweepAutoArchive(
  token: string,
  client: ThreadWriteClient,
  rules: AutoArchiveRule[] = autoArchiveRules(),
): Promise<AutoArchiveSweepResult> {
  let archived = 0;
  for (const rule of rules) {
    try {
      const threadIds = await inboxThreadIdsFrom(token, rule.sender);
      if (threadIds.length === 0) continue;
      const outcome = await client.modifyThreadLabels(token, threadIds, {
        add: [],
        remove: ['INBOX'],
      });
      archived += outcome.succeeded.length;
    } catch (e) {
      console.warn(`auto-archive sweep failed for ${rule.sender}:`, e);
    }
  }
  return { archived };
}
