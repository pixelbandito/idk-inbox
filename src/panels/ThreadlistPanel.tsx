import { useCallback, useEffect, useRef, useState } from 'react';
import { PanelHeader } from '../layout/PanelHeader';
import { useDispatchContext, useRefreshState } from '../state/useDispatch';
import { useGestureProducer } from '../triggers/producers/fromGesture';
import { useTriggerHandler } from '../triggers/useTriggerHandler';
import {
  click,
  pressLong,
  swipeInlineEnd,
  swipeInlineEndEdge,
  swipeInlineStart,
  swipeInlineStartEdge,
} from '../triggers/triggers';
import type { TriggerName } from '../triggers/types';
import { fetchByLabel } from '../lib/gmail/fetchByLabel';
import { cacheThreadSummaries } from '../state/threadSummaryCache';
import { recordSightings } from '../lib/heuristics/triageLog';
import { SuggestionCard } from '../feedback/SuggestionCard';
import type { EmailSummary } from '../lib/gmail/types';

// All row interactions flow through the trigger pipeline:
// click, the four inline swipes, and long-press.
const ROW_NEW_PIPELINE: ReadonlySet<TriggerName> = new Set([
  click,
  swipeInlineEnd,
  swipeInlineEndEdge,
  swipeInlineStart,
  swipeInlineStartEdge,
  pressLong,
]);

export interface ThreadlistPanelProps {
  label: string;
  displayName: string;
  getToken: () => string | null;
}

function Row({ email, isSelected }: { email: EmailSummary; isSelected: boolean }) {
  const ref = useRef<HTMLLIElement>(null);
  const onTrigger = useTriggerHandler(ROW_NEW_PIPELINE);
  useGestureProducer('row', ref, onTrigger);
  const className = [
    'email',
    email.unread ? 'email--unread' : null,
    isSelected ? 'email--selected' : null,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <li ref={ref} data-thread-id={email.threadId} data-surface="row" className={className}>
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
}: ThreadlistPanelProps) {
  const [emails, setEmails] = useState<EmailSummary[]>([]);
  const [failed, setFailed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const ctx = useDispatchContext();
  const selectionSet = new Set(ctx.selection);
  const { threadsVersion, labelVersions } = useRefreshState();
  // Any thread write (or a refresh-panel aimed at this label) invalidates the
  // list; combining the two versions gives the effect one number to watch.
  // hasOwn guards against a label literally named "toString" etc.
  const labelVersion = Object.hasOwn(labelVersions, label) ? labelVersions[label] : 0;
  const refreshTick = threadsVersion + labelVersion;

  // Loads can overlap (write-triggered refetch + manual ↻); only the newest
  // may set state, or a slow stale response would resurrect old rows.
  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    const seq = ++loadSeq.current;
    setLoading(true);
    setError(null);
    setFailed(0);
    try {
      const result = await fetchByLabel(token, label);
      if (seq !== loadSeq.current) return;
      cacheThreadSummaries(result.emails);
      // Inbox arrivals feed the sender-fatigue heuristic.
      if (label === 'INBOX') recordSightings(result.emails);
      setEmails(result.emails);
      setFailed(result.failed);
    } catch (e) {
      if (seq !== loadSeq.current) return;
      console.error(e);
      setError(e instanceof Error ? e.message : 'Failed to load.');
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [getToken, label]);

  useEffect(() => {
    // Defer to a microtask so the setState calls inside load() don't fire
    // synchronously within the effect body (react-hooks/set-state-in-effect).
    queueMicrotask(() => {
      void load();
    });
  }, [load, refreshTick]);

  const token = getToken();
  if (!token) {
    return (
      <>
        <PanelHeader title={displayName} />
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
        actions={
          <button onClick={() => void load()} disabled={loading} aria-label="Refresh">
            {loading ? '…' : '↻'}
          </button>
        }
      />
      <div className="panel__body">
        {label === 'INBOX' && <SuggestionCard emails={emails} />}
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
