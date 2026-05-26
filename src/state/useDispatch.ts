import { useContext } from 'react';
import { DispatchContext, DispatcherContext } from './dispatchContexts';

export function useDispatchContext() {
  const ctx = useContext(DispatchContext);
  if (!ctx) throw new Error('useDispatchContext called outside <DispatchProvider>.');
  return ctx;
}

export function useDispatcher() {
  return useContext(DispatcherContext);
}
