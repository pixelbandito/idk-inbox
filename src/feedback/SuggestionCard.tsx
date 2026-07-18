import { useEffect, useState } from 'react';
import { useDispatchContext, useDispatcher } from '../state/useDispatch';
import { topSuggestion } from '../lib/heuristics/evaluate';
import type { Suggestion } from '../lib/heuristics/catalog';
import { resolveSuggestionFor } from '../lib/heuristics/resolvedSuggestions';
import { isProcessorEnabled } from '../lib/automation/settings';
import { addAutoArchiveRule } from '../lib/rules/autoArchive';
import { normalizeListId } from '../lib/signals/behaviourLog';
import { isPlainEmailAddress, senderAddressOf } from '../lib/gmail/address';
import type { EmailSummary } from '../lib/gmail/types';

export interface SuggestionCardProps {
  /** The inbox rows currently shown — used to find an unsubscribe target. */
  emails: EmailSummary[];
}

/** Does this row belong to the suggestion's fingerprint (sender or list)? */
function matchesFingerprint(email: EmailSummary, fingerprint: Suggestion['fingerprint']): boolean {
  if (fingerprint.kind === 'sender') return senderAddressOf(email.from) === fingerprint.value;
  const listId = email.signals?.listId;
  return !!listId && normalizeListId(listId) === fingerprint.value;
}

/**
 * The proactive side of the heuristics engine: it surfaces the top suggestion
 * (unsubscribe / auto-archive) for a fingerprint you consistently ignore. The
 * user decides; the card never acts on its own.
 */
export function SuggestionCard({ emails }: SuggestionCardProps) {
  const ctx = useDispatchContext();
  const dispatch = useDispatcher();
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);

  // Recomputed per list refresh; effect (not render) because it reads
  // localStorage and "now".
  useEffect(() => {
    queueMicrotask(() => {
      // Respect the user's switch in Settings → suggestions go quiet.
      if (!isProcessorEnabled('sender-fatigue')) { setSuggestion(null); return; }
      setSuggestion(topSuggestion());
    });
  }, [emails]);

  if (!suggestion) return null;
  const { fingerprint, action } = suggestion;

  const resolve = () => {
    resolveSuggestionFor(fingerprint.value);
    setSuggestion(null);
  };

  const unsubscribeTarget = emails.find(
    (e) => matchesFingerprint(e, fingerprint) && e.listUnsubscribe,
  );

  const unsubscribe = async () => {
    if (!unsubscribeTarget) return;
    const result = await dispatch({
      action: 'unsubscribe-thread',
      args: { targets: [unsubscribeTarget.threadId] },
      context: ctx,
    });
    // Only settle if the unsubscribe page actually opened — a blocked popup or
    // missing link should leave the offer standing.
    if (result.ok) resolve();
  };

  const autoArchive = () => {
    addAutoArchiveRule(fingerprint.value);
    resolve();
    void dispatch({ action: 'apply-auto-archive', args: {}, context: ctx });
  };

  const canAutoArchive =
    action.kind === 'auto-archive' &&
    fingerprint.kind === 'sender' &&
    isPlainEmailAddress(fingerprint.value);

  return (
    <section className="suggestion-card" aria-label="Suggestion">
      <p><strong>{suggestion.headline}</strong></p>
      <p>{suggestion.detail}</p>
      {action.kind === 'unsubscribe' && unsubscribeTarget && (
        <button onClick={() => void unsubscribe()}>Unsubscribe</button>
      )}
      {canAutoArchive && (
        <button onClick={autoArchive}>Auto-archive this sender</button>
      )}
      <button onClick={resolve}>Don’t suggest again</button>
    </section>
  );
}
