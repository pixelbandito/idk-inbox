// The measurement engine: per-fingerprint rolling counts of what you do with
// mail, so heuristics can read trends (docs/plans/2026-07-12-signal-catalog-
// and-measurement.md §5). Generalises the sender-only triage log — every
// message contributes to its sender key AND its List-Id key, and dismissals are
// conditioned on whether you opened the thread first ("archived-without-opening"
// is a far stronger fatigue signal than "archived").
//
// Privacy: addresses, list-ids, message/thread ids, event types, timestamps —
// never subjects or bodies. Local-only, account-scoped, windowed.

import { threadSummaryOf } from '../../state/threadSummaryCache';
import { senderAddressOf } from '../gmail/address';
import { STORAGE_KEYS } from '../storageKeys';
import type { EmailSummary } from '../gmail/types';

const STORAGE_KEY = STORAGE_KEYS.behaviourLog;
const RETENTION_DAYS = 60;
const DAY_MS = 24 * 3600 * 1000;

/** Actions we can observe today. Reply/forward wait until a compose feature. */
export type BehaviourAction = 'open' | 'archive' | 'delete' | 'spam' | 'snooze' | 'label' | 'unsubscribe';

/** A fingerprint dimension key: `addr:<address>` or `list:<list-id>`. */
export type FingerprintKey = string;

export function senderKey(address: string): FingerprintKey {
  return `addr:${address}`;
}
export function listKey(listId: string): FingerprintKey {
  return `list:${listId}`;
}

/** The List-Id header carries the id in angle brackets: "Name <the.id>". */
export function normalizeListId(listId: string): string {
  const bracketed = /<([^>]+)>/.exec(listId);
  return (bracketed ? bracketed[1] : listId).trim().toLowerCase();
}

/** The fingerprint keys a message rolls up into: its sender, and its list if any. */
export function fingerprintKeysFor(summary: EmailSummary): FingerprintKey[] {
  const keys = [senderKey(senderAddressOf(summary.from))];
  const listId = summary.signals?.listId;
  if (listId) keys.push(listKey(normalizeListId(listId)));
  return keys;
}

interface BehaviourEvent {
  action: BehaviourAction;
  at: number;
  /** For a dismissal: had the thread been opened before this action? */
  openedFirst?: boolean;
}

/**
 * The message properties a fingerprint carries — captured so heuristics can
 * combine "what kind of mail is this" with "what you do with it". Snapshotted
 * from the most recent sighting (a sender's mail is consistent enough).
 */
export interface KeySignals {
  hasUnsubscribe: boolean;
  oneClickUnsubscribe: boolean;
  rolePattern: string | null;
  precedenceBulk: boolean;
}

interface KeyLog {
  /** messageId → first-seen timestamp; dedupes refetches so `seen` is honest. */
  sightings: Record<string, number>;
  events: BehaviourEvent[];
  signals?: KeySignals;
}

function keySignalsOf(summary: EmailSummary): KeySignals | undefined {
  const s = summary.signals;
  if (!s) return undefined;
  return {
    hasUnsubscribe: s.hasUnsubscribe,
    oneClickUnsubscribe: s.oneClickUnsubscribe,
    rolePattern: s.rolePattern,
    precedenceBulk: s.precedenceBulk,
  };
}

interface BehaviourStore {
  keys: Record<FingerprintKey, KeyLog>;
  /** threadId → last-opened timestamp, for the openedFirst conditioning. */
  opens: Record<string, number>;
}

function emptyStore(): BehaviourStore {
  return { keys: {}, opens: {} };
}

function read(): BehaviourStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw) as Partial<BehaviourStore>;
    return { keys: parsed.keys ?? {}, opens: parsed.opens ?? {} };
  } catch {
    return emptyStore();
  }
}

function write(store: BehaviourStore): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

function prune(store: BehaviourStore, now: number): BehaviourStore {
  const cutoff = now - RETENTION_DAYS * DAY_MS;
  const keys: BehaviourStore['keys'] = {};
  for (const [key, log] of Object.entries(store.keys)) {
    const sightings = Object.fromEntries(
      Object.entries(log.sightings).filter(([, at]) => at >= cutoff),
    );
    const events = log.events.filter((e) => e.at >= cutoff);
    if (Object.keys(sightings).length > 0 || events.length > 0) {
      keys[key] = { sightings, events, ...(log.signals ? { signals: log.signals } : {}) };
    }
  }
  const opens = Object.fromEntries(
    Object.entries(store.opens).filter(([, at]) => at >= cutoff),
  );
  return { keys, opens };
}

function keyLog(store: BehaviourStore, key: FingerprintKey): KeyLog {
  return (store.keys[key] ??= { sightings: {}, events: [] });
}

/** Record that these messages were seen at the top of a list (deduped per key). */
export function recordSeen(summaries: EmailSummary[], now: number = Date.now()): void {
  if (summaries.length === 0) return;
  const store = prune(read(), now);
  for (const summary of summaries) {
    const signals = keySignalsOf(summary);
    for (const key of fingerprintKeysFor(summary)) {
      const log = keyLog(store, key);
      log.sightings[summary.id] ??= now;
      if (signals) log.signals = signals; // freshen to the latest sighting
    }
  }
  write(store);
}

/** Record that a thread was opened — feeds open-rate and the openedFirst flag. */
export function recordOpen(threadId: string, now: number = Date.now()): void {
  const summary = threadSummaryOf(threadId);
  if (!summary) return;
  const store = prune(read(), now);
  store.opens[threadId] = now;
  for (const key of fingerprintKeysFor(summary)) {
    keyLog(store, key).events.push({ action: 'open', at: now });
  }
  write(store);
}

/**
 * Record a triage action against each thread's fingerprints, conditioned on
 * whether the thread had been opened first. Threads without a cached summary are
 * skipped — no fingerprint, no signal.
 */
export function recordAction(
  threadIds: string[],
  action: Exclude<BehaviourAction, 'open'>,
  now: number = Date.now(),
): void {
  const store = prune(read(), now);
  let changed = false;
  for (const threadId of threadIds) {
    const summary = threadSummaryOf(threadId);
    if (!summary) continue;
    const openedFirst = store.opens[threadId] !== undefined;
    for (const key of fingerprintKeysFor(summary)) {
      keyLog(store, key).events.push({ action, at: now, openedFirst });
    }
    changed = true;
  }
  if (changed) write(store);
}

export interface FingerprintStats {
  key: FingerprintKey;
  seen: number;
  opened: number;
  archived: number;
  archivedWithoutOpen: number;
  deleted: number;
  spam: number;
  snoozed: number;
  labeled: number;
  unsubscribed: number;
}

function statsFor(key: FingerprintKey, log: KeyLog, cutoff: number): FingerprintStats {
  const events = log.events.filter((e) => e.at >= cutoff);
  const count = (action: BehaviourAction) => events.filter((e) => e.action === action).length;
  return {
    key,
    seen: Object.values(log.sightings).filter((at) => at >= cutoff).length,
    opened: count('open'),
    archived: count('archive'),
    archivedWithoutOpen: events.filter((e) => e.action === 'archive' && e.openedFirst === false).length,
    deleted: count('delete'),
    spam: count('spam'),
    snoozed: count('snooze'),
    labeled: count('label'),
    unsubscribed: count('unsubscribe'),
  };
}

const EMPTY_LOG: KeyLog = { sightings: {}, events: [] };

/** Windowed counts for one fingerprint key (empty stats if unseen). */
export function fingerprintStats(
  key: FingerprintKey,
  windowDays: number,
  now: number = Date.now(),
): FingerprintStats {
  return statsFor(key, read().keys[key] ?? EMPTY_LOG, now - windowDays * DAY_MS);
}

/** Windowed counts for every tracked fingerprint — for the trends view. */
export function allFingerprintStats(
  windowDays: number,
  now: number = Date.now(),
): FingerprintStats[] {
  const cutoff = now - windowDays * DAY_MS;
  return Object.entries(read().keys).map(([key, log]) => statsFor(key, log, cutoff));
}

/** Split a fingerprint key back into its dimension and value for display. */
export function parseFingerprintKey(key: FingerprintKey): { kind: 'sender' | 'list'; value: string } {
  if (key.startsWith('list:')) return { kind: 'list', value: key.slice(5) };
  return { kind: 'sender', value: key.startsWith('addr:') ? key.slice(5) : key };
}

/** Everything a heuristic needs for one fingerprint: identity, stats, signals. */
export interface FingerprintRecord {
  key: FingerprintKey;
  kind: 'sender' | 'list';
  value: string;
  stats: FingerprintStats;
  signals?: KeySignals;
}

/** All tracked fingerprints with their windowed stats and signal snapshot. */
export function allFingerprints(windowDays: number, now: number = Date.now()): FingerprintRecord[] {
  const cutoff = now - windowDays * DAY_MS;
  return Object.entries(read().keys).map(([key, log]) => {
    const { kind, value } = parseFingerprintKey(key);
    return { key, kind, value, stats: statsFor(key, log, cutoff), signals: log.signals };
  });
}

export function resetBehaviourLog(): void {
  localStorage.removeItem(STORAGE_KEY);
}
