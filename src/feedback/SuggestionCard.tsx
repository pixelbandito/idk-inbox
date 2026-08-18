import { useEffect, useState } from 'react';
import { useDispatchContext, useDispatcher } from '../state/useDispatch';
import { topSuggestion } from '../lib/heuristics/evaluate';
import type { Suggestion } from '../lib/heuristics/catalog';
import { previewInboxMatches, type InboxPreview } from '../lib/heuristics/preview';
import { resolveSuggestionFor } from '../lib/heuristics/resolvedSuggestions';
import { isProcessorEnabled } from '../lib/automation/settings';
import { addAutoArchiveRule } from '../lib/rules/autoArchive';
import { normalizeListId } from '../lib/signals/behaviourLog';
import { isPlainEmailAddress, senderAddressOf } from '../lib/gmail/address';
import type { EmailSummary } from '../lib/gmail/types';

export interface SuggestionCardProps {
  /** The inbox rows currently shown — used to find an unsubscribe target. */
  emails: EmailSummary[];
  getToken: () => string | null;
}

/** Honest, forward-looking consequence of accepting an auto-archive suggestion. */
function previewText(preview: InboxPreview): string {
  if (preview.count === 0) {
    return 'Nothing from them is in your inbox right now — this only affects future mail.';
  }
  const n = preview.atLeast ? `${preview.count}+` : `${preview.count}`;
  return `This archives ${n} already in your inbox, plus future mail.`;
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
export function SuggestionCard({ emails, getToken }: SuggestionCardProps) {
  const ctx = useDispatchContext();
  const dispatch = useDispatcher();
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [preview, setPreview] = useState<InboxPreview | null>(null);

  // Recomputed per list refresh; effect (not render) because it reads
  // localStorage and "now".
  useEffect(() => {
    queueMicrotask(() => {
      // Respect the user's switch in Settings → suggestions go quiet.
      if (!isProcessorEnabled('sender-fatigue')) { setSuggestion(null); return; }
      setSuggestion(topSuggestion());
    });
  }, [emails]);

  // Fetch the honest "what would this do to my inbox now" count for an
  // auto-archive suggestion — a live, read-only search, so the consequence is
  // visible before the user confirms.
  useEffect(() => {
    let live = true;
    queueMicrotask(() => {
      if (!live) return;
      setPreview(null);
      const token = getToken();
      if (!suggestion || suggestion.action.kind !== 'auto-archive' || !token) return;
      previewInboxMatches(token, suggestion.fingerprint)
        .then((p) => { if (live) setPreview(p); })
        .catch(() => {});
    });
    return () => { live = false; };
  }, [suggestion, getToken]);

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
      {action.kind === 'auto-archive' && preview && (
        <p className="suggestion-card__preview">{previewText(preview)}</p>
      )}
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
