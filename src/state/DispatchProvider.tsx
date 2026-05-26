import { useMemo, useState, type ReactNode } from 'react';
import type { Mode, ReadonlyContext, ThreadRef } from '../input/types';
import { DispatchContext, DispatcherContext, noopDispatcher } from './dispatchContexts';

export interface DispatchProviderProps {
  children: ReactNode;
  signedIn?: boolean;
}

export function DispatchProvider({ children, signedIn = false }: DispatchProviderProps) {
  const [selection, _setSelection] = useState<ThreadRef[]>([]);
  const [mode, _setMode]           = useState<Mode>('idle');

  // Layout + undo state added in later tasks.

  const ctx: ReadonlyContext = useMemo(() => ({
    focusedPanelIndex: 1,
    focusedPanelKind:  'threadlist',
    focusedLabel:      'INBOX',
    selection,
    mode,
    signedIn,
  }), [selection, mode, signedIn]);

  // Real dispatcher wired in Task 12. For now: noop.
  const dispatcher = noopDispatcher;

  return (
    <DispatchContext.Provider value={ctx}>
      <DispatcherContext.Provider value={dispatcher}>
        {children}
      </DispatcherContext.Provider>
    </DispatchContext.Provider>
  );
}
