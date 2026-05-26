import { useContext } from 'react';
import { DispatchContext, DispatcherContext, LayoutStateContext, UndoStateContext } from './dispatchContexts';

export function useDispatchContext() {
  const ctx = useContext(DispatchContext);
  if (!ctx) throw new Error('useDispatchContext called outside <DispatchProvider>.');
  return ctx;
}

export function useDispatcher() {
  return useContext(DispatcherContext);
}

export function useUndoState() {
  const ctx = useContext(UndoStateContext);
  if (!ctx) throw new Error('useUndoState called outside <DispatchProvider>.');
  return ctx;
}

export function useLayoutState() {
  return useContext(LayoutStateContext);
}
