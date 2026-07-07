// The behavioral signal for proactive suggestions: who sends mail, and how
// often the user discards it without reading. Deterministic, local-only
// (localStorage), and windowed — old behavior ages out on every write.
//
// Privacy note: only sender addresses, message ids, and timestamps are
// stored. Never subjects or bodies.

import { threadSummaryOf } from '../../state/threadSummaryCache';
import { senderAddressOf } from '../gmail/address';
import type { EmailSummary } from '../gmail/types';

import { STORAGE_KEYS } from '../storageKeys';

const STORAGE_KEY = STORAGE_KEYS.triageLog;
const RETENTION_DAYS = 30;
const DAY_MS = 24 * 3600 * 1000;

export type TriageAction = 'archive' | 'delete' | 'spam';

interface TriageEvent {
  action: TriageAction;
  wasUnread: boolean;
  at: number;
}

interface SenderLog {
  /** messageId → first-seen timestamp. Dedupes refetches of the same mail. */
  sightings: Record<string, number>;
  triage: TriageEvent[];
}

type Log = Record<string, SenderLog>;

export interface SenderStats {
  sender: string;
  /**
   * Messages from this sender seen in the top-of-inbox fetch while the app was
   * open, within the window — a sample, not a true received count (deduped by
   * message id, capped by the fetch size).
   */
  seen: number;
  /** Threads from this sender dismissed (archive/delete/spam) while unread. */
  dismissedUnread: number;
}

function readLog(): Log {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Log;
  } catch {
    return {};
  }
}

function writeLog(log: Log): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(log));
}

function prune(log: Log, now: number): Log {
  const cutoff = now - RETENTION_DAYS * DAY_MS;
  const pruned: Log = {};
  for (const [sender, entry] of Object.entries(log)) {
    const sightings = Object.fromEntries(
      Object.entries(entry.sightings).filter(([, at]) => at >= cutoff),
    );
    const triage = entry.triage.filter((e) => e.at >= cutoff);
    if (Object.keys(sightings).length > 0 || triage.length > 0) {
      pruned[sender] = { sightings, triage };
    }
  }
  return pruned;
}

function entryFor(log: Log, sender: string): SenderLog {
  return (log[sender] ??= { sightings: {}, triage: [] });
}

export function recordSightings(emails: EmailSummary[], now: number = Date.now()): void {
  if (emails.length === 0) return;
  const log = prune(readLog(), now);
  for (const email of emails) {
    const entry = entryFor(log, senderAddressOf(email.from));
    entry.sightings[email.id] ??= now;
  }
  writeLog(log);
}

/**
 * Records a triage action against each thread's sender, capturing whether the
 * mail was still unread — that combination ("keeps sending, I keep discarding
 * unread") is what the fatigue heuristic feeds on. Threads without a cached
 * summary are skipped: no sender, no signal.
 */
export function recordTriageForThreads(
  threadIds: string[],
  action: TriageAction,
  now: number = Date.now(),
): void {
  const summaries = threadIds
    .map((id) => threadSummaryOf(id))
    .filter((s): s is EmailSummary => s !== undefined);
  if (summaries.length === 0) return;

  const log = prune(readLog(), now);
  for (const summary of summaries) {
    entryFor(log, senderAddressOf(summary.from)).triage.push({
      action,
      wasUnread: summary.unread,
      at: now,
    });
  }
  writeLog(log);
}

export function senderStats(windowDays: number, now: number = Date.now()): SenderStats[] {
  const cutoff = now - windowDays * DAY_MS;
  const stats: SenderStats[] = [];
  for (const [sender, entry] of Object.entries(readLog())) {
    const seen = Object.values(entry.sightings).filter((at) => at >= cutoff).length;
    const dismissedUnread = entry.triage
      .filter((e) => e.at >= cutoff && e.wasUnread).length;
    if (seen > 0 || dismissedUnread > 0) {
      stats.push({ sender, seen, dismissedUnread });
    }
  }
  return stats;
}

export function resetTriageLog(): void {
  localStorage.removeItem(STORAGE_KEY);
}
