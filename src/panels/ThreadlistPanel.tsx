import { useCallback, useEffect, useRef, useState } from 'react';
import { PanelHeader } from '../layout/PanelHeader';
import { useGestureBindings } from '../input/useGestureBindings';
import { useDispatchContext } from '../state/useDispatch';
import { fetchByLabel } from '../lib/gmail/fetchByLabel';
import type { EmailSummary } from '../lib/gmail/types';

export interface ThreadlistPanelProps {
  label: string;
  displayName: string;
  getToken: () => string | null;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
}

function Row({ email, isSelected }: { email: EmailSummary; isSelected: boolean }) {
  const ref = useRef<HTMLLIElement>(null);
  useGestureBindings('row', ref);
  const className = [
    'email',
    email.unread ? 'email--unread' : null,
    isSelected ? 'email--selected' : null,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <li ref={ref} data-thread-id={email.threadId} className={className}>
      <span className="email__from">{email.from}</span>
      <span className="email__subject">{email.subject}</span>
      <span className="email__snippet">{email.snippet}</span>
    </li>
  );
}

export function ThreadlistPanel({
  label,
  displayName,
  getToken,
  onSwipeLeft = () => {},
  onSwipeRight = () => {},
}: ThreadlistPanelProps) {
  const [emails, setEmails] = useState<EmailSummary[]>([]);
  const [failed, setFailed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const ctx = useDispatchContext();
  const selectionSet = new Set(ctx.selection);

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
              <Row key={e.id} email={e} isSelected={selectionSet.has(e.threadId)} />
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
