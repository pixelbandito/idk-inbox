// The heuristic catalog: each entry is one row of the measurement algebra —
// a fingerprint condition over stats + signals, and the suggestion it proposes
// (docs/plans/2026-07-12-signal-catalog-and-measurement.md §4). Adding a
// heuristic is adding an entry here; the evaluator (evaluate.ts) runs them all.
//
// A heuristic only SUGGESTS. Nothing here acts — the user confirms first.

import type { FingerprintRecord } from '../signals/behaviourLog';
import { DEFAULT_FATIGUE_THRESHOLDS } from './senderFatigue';

/** What a suggestion proposes the user do. */
export type SuggestedAction = { kind: 'auto-archive' } | { kind: 'unsubscribe' };

export interface Suggestion {
  heuristicId: string;
  /** The fingerprint this is about — its value doubles as the resolve/dedupe key. */
  fingerprint: { kind: 'sender' | 'list'; value: string };
  action: SuggestedAction;
  /** Plain-language ask, e.g. "Auto-archive mail from deals@shop.example?". */
  headline: string;
  /** The evidence behind it, in the user's own behaviour. */
  detail: string;
  /** Cross-heuristic ranking; higher surfaces first. */
  score: number;
}

export interface Heuristic {
  id: string;
  name: string;
  /** Whether this fingerprint warrants the suggestion. */
  matches(record: FingerprintRecord): boolean;
  /** Build the user-facing suggestion for a matched fingerprint. */
  suggest(record: FingerprintRecord): Suggestion;
}

function rate(part: number, whole: number): number {
  return whole > 0 ? part / whole : 0;
}

// --- Heuristics, in priority order (first match per fingerprint wins) --------

/** A dead newsletter you can leave outright — preferred over perpetual archiving. */
const deadNewsletterUnsubscribe: Heuristic = {
  id: 'dead-newsletter-unsubscribe',
  name: 'Unsubscribe from unread newsletters',
  matches: ({ stats, signals }) =>
    !!signals?.hasUnsubscribe && stats.seen >= 4 && rate(stats.opened, stats.seen) < 0.1,
  suggest: ({ kind, value, stats }) => ({
    heuristicId: 'dead-newsletter-unsubscribe',
    fingerprint: { kind, value },
    action: { kind: 'unsubscribe' },
    headline: `Unsubscribe from ${value}?`,
    detail: `You’ve opened ${stats.opened} of the last ${stats.seen} — and it offers a one-tap unsubscribe.`,
    score: 100 + stats.seen,
  }),
};

/** Sender fatigue: mostly archived without a look. Offer to auto-archive it. */
const fatigueAutoArchive: Heuristic = {
  id: 'fatigue-auto-archive',
  name: 'Auto-archive senders you ignore',
  matches: ({ kind, stats }) =>
    kind === 'sender' &&
    stats.seen >= DEFAULT_FATIGUE_THRESHOLDS.minSeen &&
    rate(stats.archivedWithoutOpen, stats.seen) >= DEFAULT_FATIGUE_THRESHOLDS.minDismissRate,
  suggest: ({ kind, value, stats }) => ({
    heuristicId: 'fatigue-auto-archive',
    fingerprint: { kind, value },
    action: { kind: 'auto-archive' },
    headline: `Auto-archive mail from ${value}?`,
    detail: `You’ve archived ${stats.archivedWithoutOpen} of the last ${stats.seen} without opening them.`,
    score: 80 + stats.archivedWithoutOpen,
  }),
};

/** Automated role senders (noreply/notifications) you mostly discard unopened. */
const roleNoiseAutoArchive: Heuristic = {
  id: 'role-noise-auto-archive',
  name: 'Auto-archive automated notifications',
  matches: ({ kind, stats, signals }) =>
    kind === 'sender' && !!signals?.rolePattern &&
    stats.seen >= 5 && rate(stats.archivedWithoutOpen, stats.seen) >= 0.6,
  suggest: ({ kind, value, stats }) => ({
    heuristicId: 'role-noise-auto-archive',
    fingerprint: { kind, value },
    action: { kind: 'auto-archive' },
    headline: `Auto-archive notifications from ${value}?`,
    detail: `It’s an automated sender you archived ${stats.archivedWithoutOpen} of the last ${stats.seen} times unopened.`,
    score: 60 + stats.archivedWithoutOpen,
  }),
};

/** Ordered by priority: unsubscribe (cleanest) before auto-archive. */
export const HEURISTICS: Heuristic[] = [
  deadNewsletterUnsubscribe,
  fatigueAutoArchive,
  roleNoiseAutoArchive,
];
