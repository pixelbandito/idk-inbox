import { useEffect, useState } from 'react';
import { PanelHeader } from '../layout/PanelHeader';
import { fetchThread, type ThreadView } from '../lib/gmail/fetchThread';

export interface ThreadPanelProps {
  threadId: string;
  getToken: () => string | null;
  onClose: () => void;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
}

export function ThreadPanel({
  threadId,
  getToken,
  onClose,
  onSwipeLeft = () => {},
  onSwipeRight = () => {},
}: ThreadPanelProps) {
  const [view, setView] = useState<ThreadView | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <>
      <PanelHeader
        title={view?.subject ?? ''}
        onSwipeLeft={onSwipeLeft}
        onSwipeRight={onSwipeRight}
        actions={<button onClick={onClose} aria-label="Close thread">×</button>}
      />
      <div className="panel__body">
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
