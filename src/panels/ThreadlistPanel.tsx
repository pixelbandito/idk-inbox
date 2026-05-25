import { useCallback, useEffect, useState } from 'react';
import { PanelHeader } from '../layout/PanelHeader';
import { fetchByLabel } from '../lib/gmail/fetchByLabel';
import type { EmailSummary } from '../lib/gmail/types';

export interface ThreadlistPanelProps {
  label: string;
  displayName: string;
  getToken: () => string | null;
  onOpenThread: (sourceLabel: string, threadId: string) => void;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
}

export function ThreadlistPanel({
  label,
  displayName,
  getToken,
  onOpenThread,
  onSwipeLeft = () => {},
  onSwipeRight = () => {},
}: ThreadlistPanelProps) {
  const [emails, setEmails] = useState<EmailSummary[]>([]);
  const [failed, setFailed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    setLoading(true);
    setError(null);
    setFailed(0);
    try {
      const result = await fetchByLabel(token, label);
      setEmails(result.emails);
      setFailed(result.failed);
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : 'Failed to load.');
    } finally {
      setLoading(false);
    }
  }, [getToken, label]);

  useEffect(() => {
    // Defer to a microtask so the setState calls inside load() don't fire
    // synchronously within the effect body (react-hooks/set-state-in-effect).
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  const token = getToken();
  if (!token) {
    return (
      <>
        <PanelHeader title={displayName} onSwipeLeft={onSwipeLeft} onSwipeRight={onSwipeRight} />
        <div className="panel__body" style={{ padding: '1rem' }}>
          <p>Sign in to view this panel.</p>
        </div>
      </>
    );
  }

  return (
    <>
      <PanelHeader
        title={displayName}
        onSwipeLeft={onSwipeLeft}
        onSwipeRight={onSwipeRight}
        actions={
          <button onClick={() => void load()} disabled={loading} aria-label="Refresh">
            {loading ? '…' : '↻'}
          </button>
        }
      />
      <div className="panel__body">
        {error && <p className="error">{error}</p>}
        {failed > 0 && (
          <p className="error">
            {failed} message{failed === 1 ? '' : 's'} failed to load — try again.
          </p>
        )}
        {emails.length === 0 && !loading && !error ? (
          <p style={{ padding: '1rem', color: '#888' }}>
            {label === 'INBOX' ? 'Inbox zero 🎉' : 'No messages here.'}
          </p>
        ) : (
          <ul className="inbox-list">
            {emails.map((e) => (
              <li
                key={e.id}
                className={e.unread ? 'email email--unread' : 'email'}
                onClick={() => onOpenThread(label, e.threadId)}
              >
                <span className="email__from">{e.from}</span>
                <span className="email__subject">{e.subject}</span>
                <span className="email__snippet">{e.snippet}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
