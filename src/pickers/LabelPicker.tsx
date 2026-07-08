import { useEffect, useState } from 'react';
import { useDispatchContext, useDispatcher, usePending } from '../state/useDispatch';
import { fetchUserLabels } from '../lib/gmail/fetchLabels';
import { displayNameOf } from '../lib/gmail/labelDisplay';

// Starter suggestions for a mailbox with no tags yet (or no token to ask with).
const SUGGESTED_SUBLABELS = ['Receipts', 'Todo', 'Reading', 'Followups'];
const APP_PREFIX = 'idk-inbox/';

function prefix(label: string): string {
  return label.startsWith(APP_PREFIX) ? label : APP_PREFIX + label;
}

interface SuggestedLabel {
  display: string;
  full: string;
}

const FALLBACK_SUGGESTIONS: SuggestedLabel[] =
  SUGGESTED_SUBLABELS.map((s) => ({ display: s, full: prefix(s) }));

export interface LabelPickerProps {
  /** When provided, suggestions come from the user's real Gmail labels. */
  getToken?: () => string | null;
}

export function LabelPicker({ getToken }: LabelPickerProps = {}) {
  const ctx = useDispatchContext();
  const dispatch = useDispatcher();
  const { pending, setPending } = usePending();
  const [text, setText] = useState('');
  const [realLabels, setRealLabels] = useState<SuggestedLabel[]>([]);

  const isOpen =
    ctx.mode === 'picker-label' &&
    (pending?.action === 'add-label-thread' || pending?.action === 'remove-label-thread');

  useEffect(() => {
    if (!isOpen || !getToken) return;
    const token = getToken();
    if (!token) return;
    let cancelled = false;
    fetchUserLabels(token)
      .then((labels) => {
        if (cancelled) return;
        setRealLabels(labels.map((l) => ({ display: displayNameOf(l.name), full: l.name })));
      })
      .catch(() => {}); // fall back to the static suggestions
    return () => { cancelled = true; };
  }, [isOpen, getToken]);

  if (!isOpen || !pending) return null;

  const suggestions = realLabels.length > 0 ? realLabels : FALLBACK_SUGGESTIONS;

  const fire = async (label: string) => {
    const action = pending.action;
    const targets = (pending.args as { targets?: string[] }).targets ?? [];
    setPending(null);
    setText('');
    await dispatch({ action, args: { targets, label }, context: { ...ctx, mode: 'idle' } });
    await dispatch({ action: 'exit-mode', args: {}, context: ctx });
  };

  const cancel = async () => {
    setPending(null);
    setText('');
    await dispatch({ action: 'exit-mode', args: {}, context: ctx });
  };

  const isAdd = pending.action === 'add-label-thread';
  const verb = isAdd ? 'Apply label' : 'Remove label';
  // Removing a non-app label is legitimate; only force the idk-inbox/ prefix
  // when applying (creating) a label.
  const submit = (raw: string) => void fire(isAdd ? prefix(raw) : raw);

  return (
    <div
      className="picker-backdrop"
      data-surface="overlay"
      onClick={(e) => { if (e.target === e.currentTarget) void cancel(); }}
    >
      <div role="dialog" aria-label="Label picker" className="picker">
        <h2 className="picker__title">{verb}</h2>
        <div className="picker__options">
          {suggestions.map((s) => (
            <button key={s.full} className="picker__option" onClick={() => void fire(s.full)}>
              {s.display}
            </button>
          ))}
        </div>
        <label className="picker__field">
          <span>Label name</span>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g. Receipts"
          />
        </label>
        <div className="picker__actions">
          <button className="picker__cancel" onClick={() => void cancel()}>Cancel</button>
          <button
            className="picker__primary"
            disabled={text.trim() === ''}
            onClick={() => { const t = text.trim(); if (t) submit(t); }}
          >
            {isAdd ? 'Apply' : 'Remove'}
          </button>
        </div>
      </div>
    </div>
  );
}
