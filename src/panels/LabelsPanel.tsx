import { useCallback, useEffect, useState } from 'react';
import { PanelHeader } from '../layout/PanelHeader';
import { useDispatchContext, useDispatcher, useRefreshState } from '../state/useDispatch';
import { fetchUserLabels, type UserLabel } from '../lib/gmail/fetchLabels';
import { displayNameOf } from '../lib/gmail/labelDisplay';

export interface LabelsPanelProps {
  getToken: () => string | null;
}

/** Every user tag as a tappable row — tapping opens that label as its own list. */
export function LabelsPanel({ getToken }: LabelsPanelProps) {
  const [labels, setLabels] = useState<UserLabel[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const ctx = useDispatchContext();
  const dispatch = useDispatcher();
  // Thread writes can create labels (tagging, snoozing), so reload with them.
  const { threadsVersion } = useRefreshState();

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      setLabels(await fetchUserLabels(token));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load labels.');
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    queueMicrotask(() => { void load(); });
  }, [load, threadsVersion]);

  const openLabel = (label: string) => {
    void dispatch({
      action: 'open-panel',
      args: { kind: 'threadlist', label },
      context: ctx,
    });
  };

  if (!getToken()) {
    return (
      <>
        <PanelHeader title="Labels" />
        <div className="panel__body" style={{ padding: '1rem' }}>
          <p>Sign in to view this panel.</p>
        </div>
      </>
    );
  }

  return (
    <>
      <PanelHeader
        title="Labels"
        actions={
          <button onClick={() => void load()} disabled={loading} aria-label="Refresh">
            {loading ? '…' : '↻'}
          </button>
        }
      />
      <div className="panel__body">
        {error && <p className="error">{error}</p>}
        {labels.length === 0 && !loading && !error ? (
          <p style={{ padding: '1rem', color: '#888' }}>No labels yet.</p>
        ) : (
          <ul className="label-list">
            {labels.map((label) => (
              <li key={label.id}>
                <button className="label-list__item" onClick={() => openLabel(label.name)}>
                  {displayNameOf(label.name)}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
