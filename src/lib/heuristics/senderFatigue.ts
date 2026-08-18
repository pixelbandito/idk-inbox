// The one heuristic the app currently knows: "this sender keeps mailing you,
// and you keep discarding it without a look." Pure evaluation over SenderStats;
// `fatiguedSenders` bridges to the behaviour log for the live data.

import { allFingerprintStats, parseFingerprintKey } from '../signals/behaviourLog';

/** A sender's fatigue-relevant tallies over the window. */
export interface SenderStats {
  sender: string;
  seen: number;
  /** Times mail from this sender was dismissed without being opened first. */
  dismissedUnread: number;
}

export interface FatigueThresholds {
  /** Minimum messages seen in the window before we dare suggest anything. */
  minSeen: number;
  /** Fraction of seen mail dismissed-without-opening that marks fatigue. */
  minDismissRate: number;
}

export const DEFAULT_FATIGUE_THRESHOLDS: FatigueThresholds = {
  minSeen: 5,
  minDismissRate: 0.8,
};

/** The window fatigue is computed over. */
export const FATIGUE_WINDOW_DAYS = 14;

/** Pure: which of these senders are fatigued, worst offender first. */
export function findFatiguedSenders(
  stats: SenderStats[],
  thresholds: FatigueThresholds = DEFAULT_FATIGUE_THRESHOLDS,
): SenderStats[] {
  return stats
    .filter((s) =>
      s.seen >= thresholds.minSeen &&
      s.dismissedUnread / s.seen >= thresholds.minDismissRate)
    .sort((a, b) => b.dismissedUnread - a.dismissedUnread);
}

/**
 * Fatigued senders from the live behaviour log, using the stronger
 * archived-without-opening signal. Only sender fingerprints are considered
 * (the suggestion's actions — unsubscribe, auto-archive by sender — are
 * address-oriented).
 */
export function fatiguedSenders(
  now: number = Date.now(),
  thresholds: FatigueThresholds = DEFAULT_FATIGUE_THRESHOLDS,
): SenderStats[] {
  const stats: SenderStats[] = allFingerprintStats(FATIGUE_WINDOW_DAYS, now)
    .filter((s) => parseFingerprintKey(s.key).kind === 'sender')
    .map((s) => ({
      sender: parseFingerprintKey(s.key).value,
      seen: s.seen,
      dismissedUnread: s.archivedWithoutOpen,
    }));
  return findFatiguedSenders(stats, thresholds);
}
