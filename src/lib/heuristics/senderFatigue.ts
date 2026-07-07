// The one heuristic the app currently knows: "this sender keeps mailing you,
// and you keep discarding it unread." Pure evaluation over SenderStats — the
// windowing and persistence live in triageLog.

import type { SenderStats } from './triageLog';

export interface FatigueThresholds {
  /** Minimum messages received in the window before we dare suggest anything. */
  minReceived: number;
  /** Fraction of received mail dismissed unread that marks fatigue. */
  minDismissRate: number;
}

export const DEFAULT_FATIGUE_THRESHOLDS: FatigueThresholds = {
  minReceived: 5,
  minDismissRate: 0.8,
};

/** The window senderStats should be computed over for this heuristic. */
export const FATIGUE_WINDOW_DAYS = 14;

export function findFatiguedSenders(
  stats: SenderStats[],
  thresholds: FatigueThresholds = DEFAULT_FATIGUE_THRESHOLDS,
): SenderStats[] {
  return stats
    .filter((s) =>
      s.received >= thresholds.minReceived &&
      s.dismissedUnread / s.received >= thresholds.minDismissRate)
    .sort((a, b) => b.dismissedUnread - a.dismissedUnread);
}
