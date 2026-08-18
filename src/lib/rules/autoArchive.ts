// User-accepted auto-archive rules ("archive future mail from this sender"),
// stored locally and applied by a client-side sweep at app open — the
// Apps Script engine from the original design will subsume this later.
//
// The sweep searches with `q=` (eventually consistent) on purpose: archiving
// is additive and idempotent, so mail a stale index misses is simply caught
// by the next sweep. Nothing here deletes anything based on emptiness.

import type { ThreadWriteClient } from '../gmail/threadWriteClient';
import { gmailJson } from '../gmail/http';
import { isPlainEmailAddress, senderAddressOf } from '../gmail/address';

import { STORAGE_KEYS } from '../storageKeys';

const STORAGE_KEY = STORAGE_KEYS.autoArchiveRules;
const MAX_THREADS_PER_RULE = 100;

export interface AutoArchiveRule {
  sender: string;
  createdAt: number;
  /** Absent = enabled; false = paused (kept, but skipped by the sweep). */
  enabled?: boolean;
}

export interface AutoArchiveSweepResult {
  archived: number;
}

/** A rule runs unless it was explicitly paused. */
export function ruleEnabled(rule: AutoArchiveRule): boolean {
  return rule.enabled !== false;
}

export function autoArchiveRules(): AutoArchiveRule[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as AutoArchiveRule[];
  } catch {
    return [];
  }
}

function writeRules(rules: AutoArchiveRule[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
}

/** Pause or resume one rule without deleting it. */
export function setAutoArchiveRuleEnabled(sender: string, enabled: boolean): void {
  const address = senderAddressOf(sender);
  writeRules(autoArchiveRules().map((r) => (r.sender === address ? { ...r, enabled } : r)));
}

/** Pause or resume every rule at once ("disable all"). */
export function setAllAutoArchiveRulesEnabled(enabled: boolean): void {
  writeRules(autoArchiveRules().map((r) => ({ ...r, enabled })));
}

/** Remove every rule ("delete all"). */
export function removeAllAutoArchiveRules(): void {
  writeRules([]);
}

export function addAutoArchiveRule(sender: string, now: number = Date.now()): void {
  const address = senderAddressOf(sender);
  // From headers are attacker-controlled; only plain addresses may become
  // rules, or a crafted quote could widen the sweep query to the whole inbox.
  if (!isPlainEmailAddress(address)) return;
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
    if (!ruleEnabled(rule)) continue; // paused rules are kept but don't run
    // Defense in depth against hand-edited or legacy stored rules.
    if (!isPlainEmailAddress(rule.sender)) continue;
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
