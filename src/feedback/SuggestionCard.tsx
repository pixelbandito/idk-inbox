import { useEffect, useState } from 'react';
import { useDispatchContext, useDispatcher } from '../state/useDispatch';
import { senderStats, type SenderStats } from '../lib/heuristics/triageLog';
import { findFatiguedSenders, FATIGUE_WINDOW_DAYS } from '../lib/heuristics/senderFatigue';
import { dismissSuggestionFor, isSuggestionDismissed } from '../lib/heuristics/dismissals';
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
      setSuggestion(fatigued.find((f) => !isSuggestionDismissed(f.sender)) ?? null);
    });
  }, [emails]);

  if (!suggestion) return null;

  const unsubscribeTarget = emails.find(
    (e) => senderAddressOf(e.from) === suggestion.sender && e.listUnsubscribe,
  );

  const settle = () => {
    dismissSuggestionFor(suggestion.sender);
    setSuggestion(null);
  };

  const unsubscribe = () => {
    if (!unsubscribeTarget) return;
    void dispatch({
      action: 'unsubscribe-thread',
      args: { targets: [unsubscribeTarget.threadId] },
      context: ctx,
    });
    settle();
  };

  const autoArchive = () => {
    addAutoArchiveRule(suggestion.sender);
    settle();
    void dispatch({ action: 'apply-auto-archive', args: {}, context: ctx });
  };

  return (
    <section className="suggestion-card" aria-label="Suggestion">
      <p>
        You’ve dismissed {suggestion.dismissedUnread} of {suggestion.received} emails
        from <strong>{suggestion.sender}</strong> without reading.
      </p>
      {unsubscribeTarget && (
        <button onClick={unsubscribe}>Unsubscribe</button>
      )}
      {isPlainEmailAddress(suggestion.sender) && (
        <button onClick={autoArchive}>Auto-archive new mail</button>
      )}
      <button onClick={() => settle()}>Dismiss</button>
    </section>
  );
}
