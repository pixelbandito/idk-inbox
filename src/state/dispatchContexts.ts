import { createContext } from 'react';
import type { ActionId, ReadonlyContext, DispatchRequest, ActionResult, UndoEntry } from '../input/types';
import type { Panel } from '../layout/types';

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

export interface LayoutState {
  panels: Panel[];
  focusIndex: number;
  setPanels: (updater: (p: Panel[]) => Panel[]) => void;
  setFocusIndex: (updater: (i: number) => number) => void;
}

const noopLayoutState: LayoutState = {
  panels: [],
  focusIndex: 0,
  setPanels: () => {},
  setFocusIndex: () => {},
};

export const LayoutStateContext = createContext<LayoutState>(noopLayoutState);

export interface PendingRequest {
  action: ActionId;
  args:   Record<string, unknown>;
}

export interface PendingState {
  pending: PendingRequest | null;
  setPending: (req: PendingRequest | null) => void;
}

const noopPendingState: PendingState = { pending: null, setPending: () => {} };

export const PendingStateContext = createContext<PendingState>(noopPendingState);
