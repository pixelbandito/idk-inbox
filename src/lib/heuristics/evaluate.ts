// Runs the heuristic catalog over the behaviour log and returns the suggestions
// worth surfacing — the reading side of the algebra. Pure over the log + "now";
// respects per-suggestion resolution so a dismissed sender stays quiet.

import { allFingerprints, type FingerprintRecord } from '../signals/behaviourLog';
import { isSuggestionResolved } from './resolvedSuggestions';
import { FATIGUE_WINDOW_DAYS } from './senderFatigue';
import { HEURISTICS, type Suggestion } from './catalog';

/**
 * Every fingerprint gets at most one suggestion — the first catalog entry it
 * matches (catalog order is priority). Resolved fingerprints are skipped, a
 * newsletter's sender is folded into its list suggestion, and results are
 * ranked by score, highest first.
 */
export function evaluateHeuristics(now: number = Date.now()): Suggestion[] {
  const matched: Array<{ record: FingerprintRecord; suggestion: Suggestion }> = [];
  for (const record of allFingerprints(FATIGUE_WINDOW_DAYS, now)) {
    if (isSuggestionResolved(record.value)) continue;
    const heuristic = HEURISTICS.find((h) => h.matches(record));
    if (heuristic) matched.push({ record, suggestion: heuristic.suggest(record) });
  }

  // Dedup: when a mailing list is itself suggested, drop the sender suggestions
  // that belong to it — the list rule covers them and survives address churn.
  const suggestedLists = new Set(
    matched.filter((m) => m.suggestion.fingerprint.kind === 'list').map((m) => m.suggestion.fingerprint.value),
  );
  return matched
    .filter((m) => !(m.record.kind === 'sender' && m.record.signals?.listId
      && suggestedLists.has(m.record.signals.listId)))
    .map((m) => m.suggestion)
    .sort((a, b) => b.score - a.score);
}

/** The single suggestion to show right now, or null if none apply. */
export function topSuggestion(now: number = Date.now()): Suggestion | null {
  return evaluateHeuristics(now)[0] ?? null;
}
