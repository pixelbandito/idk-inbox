import { useEffect, useRef, useState } from 'react';
import { PanelHeader } from '../layout/PanelHeader';
import { SanitizedEmailBody } from '../mail/SanitizedEmailBody';
import { fetchThread, type ThreadView } from '../lib/gmail/fetchThread';
import { useOverscrollProducer } from '../triggers/producers/fromOverscroll';
import { useTriggerHandler } from '../triggers/useTriggerHandler';
import { overscrollBlockEnd } from '../triggers/triggers';
import type { TriggerName } from '../triggers/types';

export interface ThreadPanelProps {
  threadId: string;
  /**
   * Layout index of this panel. No longer consumed by ThreadPanel —
   * close-panel reads the focused index from context via argsFor — but
   * retained for callers that already pass it (e.g. App.tsx). Will be
   * dropped in Step 5 once we're sure nothing relies on it.
   */
  panelIndex?: number;
  getToken: () => string | null;
  onClose: () => void;
}

// Step 4 Task 15: panel-body overscroll → close-panel flows through the new
// pipeline. The legacy useOverscroll consumer that called dispatch directly
// is gone; the producer below emits a gesture-overscroll AbstractEvent that
// the resolver maps to closePanelAction via ACTION_MAP['panel-body'].
const PANEL_BODY_NEW_PIPELINE: ReadonlySet<TriggerName> = new Set([
  overscrollBlockEnd,
]);

export function ThreadPanel({
  threadId,
  getToken,
  onClose,
}: ThreadPanelProps) {
  const [view, setView] = useState<ThreadView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [closePull, setClosePull] = useState(0); // 0..1 overscroll-to-close progress
  const bodyRef = useRef<HTMLDivElement>(null);
  const onTrigger = useTriggerHandler(PANEL_BODY_NEW_PIPELINE);

  useEffect(() => {
    // Defer to a microtask so the setState calls don't fire synchronously
    // within the effect body (react-hooks/set-state-in-effect).
    queueMicrotask(() => {
      const token = getToken();
      if (!token) {
        setView(null);
        setError('Not signed in.');
        return;
      }
      fetchThread(token, threadId)
        .then(setView)
        .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load thread.'));
    });
  }, [threadId, getToken]);

  useOverscrollProducer(bodyRef, onTrigger, setClosePull);

  return (
    <>
      <PanelHeader
        title={view?.subject ?? ''}
        actions={<button onClick={onClose} aria-label="Close thread">×</button>}
      />
      <div className="panel__body" data-surface="panel-body" ref={bodyRef}>
        {error && <p className="error">{error}</p>}
        {view && (
          <ol className="thread">
            {view.messages.map((m) => (
              <li key={m.id} className="thread__message">
                <div className="thread__meta">
                  <strong>{m.from}</strong> · {m.date}
                </div>
                {m.html
                  ? <SanitizedEmailBody html={m.html} />
                  : <pre className="thread__body">{m.body}</pre>}
              </li>
            ))}
          </ol>
        )}
        {closePull > 0 && (
          <div
            className="thread__close-hint"
            data-armed={closePull >= 1 ? 'true' : undefined}
            style={{ opacity: Math.min(1, 0.4 + closePull * 0.6) }}
            aria-hidden="true"
          >
            {closePull >= 1 ? 'Release to close ▾' : 'Keep pulling to close ▾'}
          </div>
        )}
      </div>
    </>
  );
}
