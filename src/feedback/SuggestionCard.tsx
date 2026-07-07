import { useEffect, useState } from 'react';
import { useDispatchContext, useDispatcher } from '../state/useDispatch';
import { senderStats, type SenderStats } from '../lib/heuristics/triageLog';
import { findFatiguedSenders, FATIGUE_WINDOW_DAYS } from '../lib/heuristics/senderFatigue';
import { resolveSuggestionFor, isSuggestionResolved } from '../lib/heuristics/resolvedSuggestions';
import { addAutoArchiveRule } from '../lib/rules/autoArchive';
import { isPlainEmailAddress, senderAddressOf } from '../lib/gmail/address';
import type { EmailSummary } from '../lib/gmail/types';

export interface SuggestionCardProps {
  /** The inbox rows currently shown — used to find an unsubscribe target. */
  emails: EmailSummary[];
}

/**
 * The proactive side of the fatigue heuristic: when a sender's mail keeps
 * getting dismissed unread, offer to unsubscribe or auto-archive. The user
 * decides; the card never acts on its own.
 */
export function SuggestionCard({ emails }: SuggestionCardProps) {
  const ctx = useDispatchContext();
  const dispatch = useDispatcher();
  const [suggestion, setSuggestion] = useState<SenderStats | null>(null);

  // Recomputed per list refresh; effect (not render) because the heuristic
  // reads localStorage and "now".
  useEffect(() => {
    queueMicrotask(() => {
      const fatigued = findFatiguedSenders(senderStats(FATIGUE_WINDOW_DAYS));
      setSuggestion(fatigued.find((f) => !isSuggestionResolved(f.sender)) ?? null);
    });
  }, [emails]);

  if (!suggestion) return null;

  const unsubscribeTarget = emails.find(
    (e) => senderAddressOf(e.from) === suggestion.sender && e.listUnsubscribe,
  );

  const resolve = () => {
    resolveSuggestionFor(suggestion.sender);
    setSuggestion(null);
  };

  const unsubscribe = async () => {
    if (!unsubscribeTarget) return;
    const result = await dispatch({
      action: 'unsubscribe-thread',
      args: { targets: [unsubscribeTarget.threadId] },
      context: ctx,
    });
    // Only settle the card if the unsubscribe page actually opened — a blocked
    // popup or missing link should leave the offer standing.
    if (result.ok) resolve();
  };

  const autoArchive = () => {
    addAutoArchiveRule(suggestion.sender);
    resolve();
    void dispatch({ action: 'apply-auto-archive', args: {}, context: ctx });
  };

  return (
    <section className="suggestion-card" aria-label="Suggestion">
      <p>
        You’ve been dismissing mail from <strong>{suggestion.sender}</strong> without
        reading it ({Math.min(suggestion.dismissedUnread, suggestion.seen)} of the
        last {suggestion.seen} seen).
      </p>
      {unsubscribeTarget && (
        <button onClick={() => void unsubscribe()}>Unsubscribe</button>
      )}
      {isPlainEmailAddress(suggestion.sender) && (
        <button onClick={autoArchive}>Auto-archive this sender</button>
      )}
      <button onClick={resolve}>Don’t suggest again</button>
    </section>
  );
}
