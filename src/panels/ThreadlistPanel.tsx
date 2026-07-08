import { useCallback, useEffect, useRef, useState } from 'react';
import { PanelHeader } from '../layout/PanelHeader';
import { useDispatchContext, useDispatcher, useRefreshState } from '../state/useDispatch';
import { useRowSwipe } from '../input/useRowSwipe';
import { useTriggerHandler } from '../triggers/useTriggerHandler';
import { click, pressLong } from '../triggers/triggers';
import type { TriggerName } from '../triggers/types';
import type { IconName } from '../input/swipeIntents';
import { Icon } from '../ui/icons';
import { fetchByLabel } from '../lib/gmail/fetchByLabel';
import { cacheThreadSummaries } from '../state/threadSummaryCache';
import { recordSightings } from '../lib/heuristics/triageLog';
import { SuggestionCard } from '../feedback/SuggestionCard';
import type { EmailSummary } from '../lib/gmail/types';

// Taps still flow through the generic trigger pipeline; swipes are owned by
// useRowSwipe (see src/input/swipeIntents.ts for the bindings).
const ROW_TAP_PIPELINE: ReadonlySet<TriggerName> = new Set([click, pressLong]);

// All reveal icons render once; CSS shows the one matching the row's
// data-armed-icon (set imperatively by useRowSwipe — no re-render per frame).
const REVEAL_ICONS: readonly IconName[] = ['archive', 'trash', 'clock', 'tag'];

export interface ThreadlistPanelProps {
  label: string;
  displayName: string;
  getToken: () => string | null;
  /** Present for on-demand lists (a tag opened from the Labels panel). */
  onClose?: () => void;
}

function Row({ email, isSelected }: { email: EmailSummary; isSelected: boolean }) {
  const ref = useRef<HTMLLIElement>(null);
  const onTrigger = useTriggerHandler(ROW_TAP_PIPELINE);
  const dispatch = useDispatcher();
  const ctx = useDispatchContext();
  useRowSwipe(ref, { onTrigger, dispatch, ctx });
  const className = [
    'email',
    email.unread ? 'email--unread' : null,
    isSelected ? 'email--selected' : null,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <li ref={ref} data-thread-id={email.threadId} data-surface="row" className={className}>
      <div className="email__reveal" aria-hidden="true">
        {REVEAL_ICONS.map((name) => (
          <span key={name} className="email__reveal-icon" data-swipe-icon={name}>
            <Icon name={name} />
          </span>
        ))}
      </div>
      <div className="email__tile">
        <span className="email__from">{email.from}</span>
        <span className="email__subject">{email.subject}</span>
        <span className="email__snippet">{email.snippet}</span>
      </div>
    </li>
  );
}

export function ThreadlistPanel({
  label,
  displayName,
  getToken,
  onClose,
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
          <>
            <button onClick={() => void load()} disabled={loading} aria-label="Refresh">
              {loading ? '…' : '↻'}
            </button>
            {onClose && (
              <button onClick={onClose} aria-label={`Close ${displayName}`}>×</button>
            )}
          </>
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
