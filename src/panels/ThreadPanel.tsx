import { useEffect, useRef, useState } from 'react';
import { PanelHeader } from '../layout/PanelHeader';
import { fetchThread, type ThreadView } from '../lib/gmail/fetchThread';
import { useOverscroll } from '../input/useOverscroll';
import { useDispatchContext, useDispatcher } from '../state/useDispatch';

export interface ThreadPanelProps {
  threadId: string;
  panelIndex: number;
  getToken: () => string | null;
  onClose: () => void;
}

export function ThreadPanel({
  threadId,
  panelIndex,
  getToken,
  onClose,
}: ThreadPanelProps) {
  const [view, setView] = useState<ThreadView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const ctx = useDispatchContext();
  const dispatch = useDispatcher();

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

  useOverscroll(bodyRef, {
    edge: 'bottom',
    minPx: 80,
    onFire: () => {
      void dispatch({ action: 'close-panel', args: { panelIndex }, context: ctx });
    },
  });

  return (
    <>
      <PanelHeader
        title={view?.subject ?? ''}
        actions={<button onClick={onClose} aria-label="Close thread">×</button>}
      />
      <div className="panel__body" data-surface="panel-body" ref={bodyRef}>
        {error && <p className="error">{error}</p>}
        {view && (
          <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {view.messages.map((m) => (
              <li key={m.id} style={{ padding: '1rem', borderBottom: '1px solid #eee' }}>
                <div style={{ fontSize: '0.85rem', color: '#555' }}>
                  <strong>{m.from}</strong> · {m.date}
                </div>
                <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', marginTop: '0.5rem' }}>
                  {m.body}
                </pre>
              </li>
            ))}
          </ol>
        )}
      </div>
    </>
  );
}
