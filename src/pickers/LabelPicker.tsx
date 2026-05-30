import { useState } from 'react';
import { useDispatchContext, useDispatcher, usePending } from '../state/useDispatch';

const SUGGESTED_SUBLABELS = ['Receipts', 'Todo', 'Reading', 'Followups'];
const APP_PREFIX = 'idk-inbox/';

function prefix(label: string): string {
  return label.startsWith(APP_PREFIX) ? label : APP_PREFIX + label;
}

export function LabelPicker() {
  const ctx = useDispatchContext();
  const dispatch = useDispatcher();
  const { pending, setPending } = usePending();
  const [text, setText] = useState('');

  if (ctx.mode !== 'picker-label') return null;
  if (pending?.action !== 'add-label-thread' && pending?.action !== 'remove-label-thread') return null;

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

  const verb = pending.action === 'add-label-thread' ? 'Apply label' : 'Remove label';

  return (
    <div role="dialog" aria-label="Label picker" className="label-picker">
      <h2>{verb}</h2>
      <ul>
        {SUGGESTED_SUBLABELS.map((s) => (
          <li key={s}>
            <button onClick={() => void fire(prefix(s))}>{s}</button>
          </li>
        ))}
      </ul>
      <label>
        Label name
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. Receipts"
        />
      </label>
      <button onClick={() => text.trim() && void fire(prefix(text.trim()))}>Apply</button>
      <button onClick={() => void cancel()}>Cancel</button>
    </div>
  );
}
