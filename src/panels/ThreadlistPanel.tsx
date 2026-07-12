import { useCallback, useEffect, useRef, useState } from 'react';
import { PanelHeader } from '../layout/PanelHeader';
import { useDispatchContext, useDispatcher, useRefreshState } from '../state/useDispatch';
import { useRowSwipe } from '../input/useRowSwipe';
import { useTriggerHandler } from '../triggers/useTriggerHandler';
import { click, pressLong } from '../triggers/triggers';
import type { TriggerName } from '../triggers/types';
import type { IconName } from '../input/swipeIntents';
import type { ActionId } from '../input/types';
import { Icon } from '../ui/icons';
import { fetchByLabel } from '../lib/gmail/fetchByLabel';
import { cacheThreadSummaries } from '../state/threadSummaryCache';
import { recordSightings } from '../lib/heuristics/triageLog';
import { SuggestionCard } from '../feedback/SuggestionCard';
import type { EmailSummary } from '../lib/gmail/types';

// Taps still flow through the generic trigger pipeline; swipes are owned by
// useRowSwipe (see src/input/swipeIntents.ts for the bindings).
const ROW_TAP_PIPELINE: ReadonlySet<TriggerName> = new Set([click, pressLong]);

// Swipe actions that take a thread out of the INBOX list — used for optimistic
// removal so an archived/deleted/snoozed row disappears without waiting on the
// eventually-consistent refetch. (Apply-label keeps the thread in the inbox.)
const INBOX_REMOVING_ACTIONS: ReadonlySet<ActionId> = new Set([
  'archive-thread', 'delete-thread', 'snooze-thread',
]);

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

interface RowProps {
  email: EmailSummary;
  isSelected: boolean;
  removesFromList: (action: ActionId) => boolean;
  onCommitted: (threadId: string, action: ActionId) => void;
}

// Fly-off slide + vertical collapse duration; the row is dropped from the list
// after this so the animation is seen before the row unmounts.
const EXIT_MS = 340;

function Row({ email, isSelected, removesFromList, onCommitted }: RowProps) {
  const ref = useRef<HTMLLIElement>(null);
  const onTrigger = useTriggerHandler(ROW_TAP_PIPELINE);
  const dispatch = useDispatcher();
  const ctx = useDispatchContext();
  // A committed removing write flies the tile off then collapses the row; after
  // the animation the panel drops it from the list.
  const [filing, setFiling] = useState(false);
  const committedActionRef = useRef<ActionId | null>(null);
  const { reveal, commitReveal } = useRowSwipe(ref, {
    onTrigger, dispatch, ctx, removesFromList,
    onCommit: (action) => { committedActionRef.current = action; setFiling(true); },
  });

  useEffect(() => {
    if (!filing) return;
    const t = setTimeout(() => {
      if (committedActionRef.current) onCommitted(email.threadId, committedActionRef.current);
    }, EXIT_MS);
    return () => clearTimeout(t);
  }, [filing, email.threadId, onCommitted]);

  const className = [
    'email',
    email.unread ? 'email--unread' : null,
    isSelected ? 'email--selected' : null,
    filing ? 'email--releasing email--filing' : null,
  ]
    .filter(Boolean)
    .join(' ');

  // For an end-pull the strip is on the inline-start edge (and vice versa);
  // row-reverse there keeps the light action nearest the tile.
  const side = reveal?.direction === 'end' ? 'start' : 'end';

  return (
    <li ref={ref} data-thread-id={email.threadId} data-surface="row" className={className}>
      <div className="email__reveal" aria-hidden="true">
        {REVEAL_ICONS.map((name) => (
          <span key={name} className="email__reveal-icon" data-swipe-icon={name}>
            <Icon name={name} />
          </span>
        ))}
      </div>
      {/* Trackpad reveal: snapped-open action button(s), clickable to commit.
          Real <button>s, so they bypass the row gesture and get native clicks. */}
      {reveal && (
        <div className="email__actions" data-side={side}>
          {reveal.actions.map((a) => (
            <button
              key={a.action}
              type="button"
              className="email__action"
              data-tone={a.tone}
              aria-label={a.label}
              onClick={() => commitReveal(a.action)}
            >
              <Icon name={a.icon} />
            </button>
          ))}
        </div>
      )}
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
  // Threads dropped optimistically on a committed write so the row vanishes at
  // once; a fresh load is authoritative and clears this.
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const ctx = useDispatchContext();
  const selectionSet = new Set(ctx.selection);

  // Which swipe actions take a thread out of THIS list. Only these fly the row
  // away; e.g. archiving from a tag list keeps the thread in that tag.
  const removesFromList = useCallback((action: ActionId) => {
    if (label === 'INBOX') return INBOX_REMOVING_ACTIONS.has(action);
    return action === 'delete-thread';
  }, [label]);

  const onCommitted = useCallback((threadId: string, action: ActionId) => {
    if (removesFromList(action)) {
      setRemoved((prev) => new Set(prev).add(threadId));
    }
  }, [removesFromList]);
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
      // Keep suppressing an optimistically-removed thread only while the server
      // still (staleley) returns it; once it's gone, stop tracking it. This
      // holds an archived row hidden through an eventually-consistent refetch.
      setRemoved((prev) => {
        if (prev.size === 0) return prev;
        const present = new Set(result.emails.map((e) => e.threadId));
        return new Set([...prev].filter((id) => present.has(id)));
      });
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
        {(() => {
          const shown = emails.filter((e) => !removed.has(e.threadId));
          return shown.length === 0 && !loading && !error ? (
            <p style={{ padding: '1rem', color: '#888' }}>
              {label === 'INBOX' ? 'Inbox zero 🎉' : 'No messages here.'}
            </p>
          ) : (
            <ul className="inbox-list">
              {shown.map((e) => (
                <Row
                  key={e.id}
                  email={e}
                  isSelected={selectionSet.has(e.threadId)}
                  removesFromList={removesFromList}
                  onCommitted={onCommitted}
                />
              ))}
            </ul>
          );
        })()}
      </div>
    </>
  );
}
