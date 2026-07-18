// Runs the heuristic catalog over the behaviour log and returns the suggestions
// worth surfacing — the reading side of the algebra. Pure over the log + "now";
// respects per-suggestion resolution so a dismissed sender stays quiet.

import { allFingerprints } from '../signals/behaviourLog';
import { isSuggestionResolved } from './resolvedSuggestions';
import { FATIGUE_WINDOW_DAYS } from './senderFatigue';
import { HEURISTICS, type Suggestion } from './catalog';

/**
 * Every fingerprint gets at most one suggestion — the first catalog entry it
 * matches (catalog order is priority). Resolved fingerprints are skipped;
 * results are ranked by score, highest first.
 */
export function evaluateHeuristics(now: number = Date.now()): Suggestion[] {
  const suggestions: Suggestion[] = [];
  for (const record of allFingerprints(FATIGUE_WINDOW_DAYS, now)) {
    if (isSuggestionResolved(record.value)) continue;
    const heuristic = HEURISTICS.find((h) => h.matches(record));
    if (heuristic) suggestions.push(heuristic.suggest(record));
  }
  return suggestions.sort((a, b) => b.score - a.score);
}

/** The single suggestion to show right now, or null if none apply. */
export function topSuggestion(now: number = Date.now()): Suggestion | null {
  return evaluateHeuristics(now)[0] ?? null;
}
