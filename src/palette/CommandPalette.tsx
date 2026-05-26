import { useMemo, useRef, useState, useEffect } from 'react';
import { ACTION_CATALOG, type ActionCatalogEntry } from '../actions/catalog';
import { evaluateWhen } from '../input/predicates';
import { targetsFromSelection } from '../input/helpers';
import { useDispatchContext, useDispatcher } from '../state/useDispatch';
import type { ReadonlyContext } from '../input/types';

const THREAD_WRITE_ACTIONS = new Set([
  'modify-thread-labels', 'archive-thread', 'delete-thread', 'spam-thread',
  'add-label-thread', 'remove-label-thread', 'snooze-thread', 'unsubscribe-thread',
]);

function resolvePaletteArgs(actionId: string, ctx: ReadonlyContext): Record<string, unknown> {
  // Palette has no event-derived row target, so for thread-write actions we
  // pass selection-derived targets (or an empty list, which yields ok:false).
  if (THREAD_WRITE_ACTIONS.has(actionId)) {
    return { targets: ctx.selection.length > 0 ? targetsFromSelection(ctx) : [] };
  }
  return {};
}

export function CommandPalette() {
  const ctx = useDispatchContext();
  if (ctx.mode !== 'cmd-k') return null;
  return <CommandPaletteInner />;
}

function CommandPaletteInner() {
  const ctx = useDispatchContext();
  const dispatch = useDispatcher();
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Autofocus on mount. The component is mounted only while the palette is
  // open, so no cascading-render concern: this runs once per open.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filtered = useMemo<ActionCatalogEntry[]>(() => {
    const q = query.trim().toLowerCase();
    return ACTION_CATALOG.filter((e) => {
      if (!evaluateWhen(e.when, ctx)) return false;
      if (!q) return true;
      return e.label.toLowerCase().includes(q);
    });
  }, [query, ctx]);

  const fire = async (entry: ActionCatalogEntry) => {
    // Close first to avoid "still in cmd-k" gating issues on the dispatched action.
    await dispatch({ action: 'exit-mode', args: {}, context: ctx });
    const args = resolvePaletteArgs(entry.id, ctx);
    await dispatch({ action: entry.id, args, context: { ...ctx, mode: 'idle' } });
  };

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      void dispatch({ action: 'exit-mode', args: {}, context: ctx });
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const entry = filtered[activeIdx];
      if (entry) void fire(entry);
    }
  };

  return (
    <div role="dialog" aria-label="Command palette" className="command-palette">
      <input
        ref={inputRef}
        placeholder="Type a command…"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setActiveIdx(0); }}
        onKeyDown={handleKey}
      />
      <ul role="listbox">
        {filtered.map((e, i) => (
          <li
            key={e.id}
            role="option"
            aria-selected={i === activeIdx}
            onClick={() => void fire(e)}
            data-active={i === activeIdx ? 'true' : undefined}
            style={{ cursor: 'pointer' }}
          >
            <span>{e.label}</span>
            {e.previewFor && <span style={{ opacity: 0.7, marginLeft: '0.5rem' }}>{e.previewFor(ctx)}</span>}
            {e.keyboardCue && <kbd style={{ marginLeft: '0.5rem', opacity: 0.7 }}>{e.keyboardCue}</kbd>}
          </li>
        ))}
        {filtered.length === 0 && <li role="option" style={{ opacity: 0.6 }}>No matching commands</li>}
      </ul>
    </div>
  );
}
