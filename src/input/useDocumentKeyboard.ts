import { useEffect } from 'react';
import { DEFAULT_BINDINGS } from './defaultBindings';
import { fireBinding } from './fireBinding';
import { useDispatchContext, useDispatcher } from '../state/useDispatch';
import type { Binding } from './types';

function comboString(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.metaKey || e.ctrlKey) parts.push('mod');
  if (e.shiftKey) parts.push('shift');
  if (e.altKey)   parts.push('alt');
  const key = e.key.toLowerCase();
  // Map specials to canonical names
  const k = key === ' ' ? 'space'
          : key === 'arrowleft' ? 'left'
          : key === 'arrowright' ? 'right'
          : key === 'arrowup' ? 'up'
          : key === 'arrowdown' ? 'down'
          : key;
  parts.push(k);
  return parts.join('+');
}

export function useDocumentKeyboard(): void {
  const ctx = useDispatchContext();
  const dispatch = useDispatcher();

  useEffect(() => {
    const kbdBindings = DEFAULT_BINDINGS.filter(
      (b) => b.scope === 'document' && b.modality === 'keyboard',
    );

    const onKey = (e: KeyboardEvent) => {
      const combo = comboString(e);
      const matches = kbdBindings.filter(
        (b: Binding) => b.trigger.kind === 'key' && b.trigger.combo === combo,
      );
      for (const b of matches) {
        // fire-and-forget; await would block subsequent events.
        void fireBinding(b, { target: e.target as Element | null }, ctx, dispatch);
      }
    };

    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [ctx, dispatch]);
}
