import { useEffect, useRef, useState } from 'react';
import { PanelHeader } from '../layout/PanelHeader';
import { SanitizedEmailBody } from '../mail/SanitizedEmailBody';
import { fetchThread, type ThreadView } from '../lib/gmail/fetchThread';
import { useOverscrollClose, type ClosePhase, type CloseMode } from '../input/useOverscrollClose';
import { useDispatchContext, useDispatcher } from '../state/useDispatch';
import { Icon } from '../ui/icons';
import type { ActionId } from '../input/types';

export interface ThreadPanelProps {
  threadId: string;
  /**
   * Layout index of this panel. No longer consumed by ThreadPanel —
   * close-panel reads the focused index from context via argsFor — but
   * retained for callers that already pass it (e.g. App.tsx).
   */
  panelIndex?: number;
  getToken: () => string | null;
  onClose: () => void;
}

/** The affordance for the pull-to-close gesture, by phase and input. */
function closeHint(phase: ClosePhase, mode: CloseMode): string {
  if (phase === 'ready') return 'Release to close';
  if (phase === 'armed') return mode === 'wheel' ? 'Scroll back to cancel' : 'Hold to close';
  if (phase === 'pulling') return mode === 'wheel' ? 'Keep scrolling to close' : 'Keep pulling to close';
  return '';
}

export function ThreadPanel({ threadId, getToken, onClose }: ThreadPanelProps) {
  const [view, setView] = useState<ThreadView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [close, setClose] = useState<{ phase: ClosePhase; mode: CloseMode }>({ phase: 'idle', mode: null });
  const bodyRef = useRef<HTMLDivElement>(null);
  const dispatch = useDispatcher();
  const ctx = useDispatchContext();

  // Button fallbacks for the triage gestures — always available while reading.
  // Archive/delete take the thread out of the inbox, so they close the panel;
  // snooze opens its picker and leaves the panel for it to settle.
  const triage = async (action: ActionId, closesPanel: boolean) => {
    const result = await dispatch({ action, args: { targets: [threadId] }, context: ctx });
    if (closesPanel && result.ok) onClose();
  };

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

  useOverscrollClose(bodyRef, {
    onFire: onClose,
    onPhase: (phase, mode) => setClose({ phase, mode }),
  });

  return (
    <>
      <PanelHeader
        title={view?.subject ?? ''}
        actions={
          <>
            <button onClick={() => void triage('archive-thread', true)} aria-label="Archive"><Icon name="archive" /></button>
            <button onClick={() => void triage('snooze-thread', false)} aria-label="Snooze"><Icon name="clock" /></button>
            <button onClick={() => void triage('delete-thread', true)} aria-label="Delete"><Icon name="trash" /></button>
            <button onClick={onClose} aria-label="Close thread">×</button>
          </>
        }
      />
      {/* The stage doesn't scroll, so the reveal drawer stays pinned to the
          panel's visual bottom while the scroller's content lifts. */}
      <div className="thread-close-stage">
        <div className="panel__body thread-scroll" data-surface="panel-body" ref={bodyRef}>
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
        </div>
        <div className="thread-close-reveal" aria-hidden="true">
          <span className="thread-close-reveal__label">{closeHint(close.phase, close.mode)}</span>
        </div>
      </div>
    </>
  );
}
