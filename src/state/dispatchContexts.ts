import { createContext } from 'react';
import type { ReadonlyContext, DispatchRequest, ActionResult, UndoEntry } from '../input/types';

export const noopDispatcher = async (_req: DispatchRequest): Promise<ActionResult> => ({
  ok: false, error: 'Dispatcher not initialised.',
});

export const DispatchContext   = createContext<ReadonlyContext | null>(null);
export const DispatcherContext = createContext<(req: DispatchRequest) => Promise<ActionResult>>(noopDispatcher);

export interface UndoState {
  undoStack: UndoEntry[];
  redoStack: UndoEntry[];
  pushUndo: (e: UndoEntry) => void;
  popUndo:  () => UndoEntry | undefined;
  pushRedo: (e: UndoEntry) => void;
  popRedo:  () => UndoEntry | undefined;
  clearStacks: () => void;
}

export const noopUndoState: UndoState = {
  undoStack: [],
  redoStack: [],
  pushUndo: () => {},
  popUndo:  () => undefined,
  pushRedo: () => {},
  popRedo:  () => undefined,
  clearStacks: () => {},
};

export const UndoStateContext = createContext<UndoState | null>(null);
