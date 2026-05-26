import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Mode, ReadonlyContext, ThreadRef, UndoEntry } from '../input/types';
import {
  DispatchContext,
  DispatcherContext,
  UndoStateContext,
  noopDispatcher,
  type UndoState,
} from './dispatchContexts';

export interface DispatchProviderProps {
  children: ReactNode;
  signedIn?: boolean;
}

export function DispatchProvider({ children, signedIn = false }: DispatchProviderProps) {
  const [selection, _setSelection] = useState<ThreadRef[]>([]);
  const [mode, _setMode]           = useState<Mode>('idle');
  const [undoStack, setUndoStack]  = useState<UndoEntry[]>([]);
  const [redoStack, setRedoStack]  = useState<UndoEntry[]>([]);

  // Refs mirror the stacks so popUndo/popRedo can return the popped entry
  // synchronously even when React defers the setState updater.
  const undoRef = useRef<UndoEntry[]>(undoStack);
  const redoRef = useRef<UndoEntry[]>(redoStack);
  useEffect(() => { undoRef.current = undoStack; }, [undoStack]);
  useEffect(() => { redoRef.current = redoStack; }, [redoStack]);

  // Layout state added in later tasks.

  const ctx: ReadonlyContext = useMemo(() => ({
    focusedPanelIndex: 1,
    focusedPanelKind:  'threadlist',
    focusedLabel:      'INBOX',
    selection,
    mode,
    signedIn,
  }), [selection, mode, signedIn]);

  const pushUndo = useCallback((entry: UndoEntry) => {
    const next = [...undoRef.current, entry];
    undoRef.current = next;
    setUndoStack(next);
    redoRef.current = [];
    setRedoStack([]);
  }, []);

  const popUndo = useCallback((): UndoEntry | undefined => {
    const stack = undoRef.current;
    if (stack.length === 0) return undefined;
    const popped = stack[stack.length - 1];
    const next = stack.slice(0, -1);
    undoRef.current = next;
    setUndoStack(next);
    return popped;
  }, []);

  const pushRedo = useCallback((entry: UndoEntry) => {
    const next = [...redoRef.current, entry];
    redoRef.current = next;
    setRedoStack(next);
  }, []);

  const popRedo = useCallback((): UndoEntry | undefined => {
    const stack = redoRef.current;
    if (stack.length === 0) return undefined;
    const popped = stack[stack.length - 1];
    const next = stack.slice(0, -1);
    redoRef.current = next;
    setRedoStack(next);
    return popped;
  }, []);

  const clearStacks = useCallback(() => {
    undoRef.current = [];
    redoRef.current = [];
    setUndoStack([]);
    setRedoStack([]);
  }, []);

  const undoState: UndoState = useMemo(() => ({
    undoStack,
    redoStack,
    pushUndo,
    popUndo,
    pushRedo,
    popRedo,
    clearStacks,
  }), [undoStack, redoStack, pushUndo, popUndo, pushRedo, popRedo, clearStacks]);

  // Real dispatcher wired in Task 12. For now: noop.
  const dispatcher = noopDispatcher;

  return (
    <DispatchContext.Provider value={ctx}>
      <DispatcherContext.Provider value={dispatcher}>
        <UndoStateContext.Provider value={undoState}>
          {children}
        </UndoStateContext.Provider>
      </DispatcherContext.Provider>
    </DispatchContext.Provider>
  );
}
