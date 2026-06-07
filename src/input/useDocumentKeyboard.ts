import { useEffect } from 'react';
import { DEFAULT_BINDINGS } from './defaultBindings';
import { fireBinding } from './fireBinding';
import { useDispatchContext, useDispatcher } from '../state/useDispatch';
import { comboString } from '../triggers/producers/combo';
import type { Binding } from './types';

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
