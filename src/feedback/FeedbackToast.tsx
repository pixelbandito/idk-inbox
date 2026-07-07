import { useEffect } from 'react';
import { useFeedback } from '../state/useDispatch';

const DEFAULT_DISMISS_MS = 6000;

export interface FeedbackToastProps {
  dismissAfterMs?: number;
}

/**
 * Renders the one-slot feedback from the dispatcher: write failures and
 * announced undo-less outcomes. UndoToast handles undoable successes; this
 * covers everything that would otherwise die silently.
 */
export function FeedbackToast({ dismissAfterMs = DEFAULT_DISMISS_MS }: FeedbackToastProps) {
  const { feedback, setFeedback } = useFeedback();

  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(null), dismissAfterMs);
    return () => clearTimeout(timer);
  }, [feedback, setFeedback, dismissAfterMs]);

  if (!feedback) return null;

  const isError = feedback.kind === 'error';
  return (
    <div
      role={isError ? 'alert' : 'status'}
      className={`feedback-toast feedback-toast--${feedback.kind}`}
    >
      <span>{feedback.message}</span>
      <button onClick={() => setFeedback(null)} aria-label="Dismiss">✕</button>
    </div>
  );
}
