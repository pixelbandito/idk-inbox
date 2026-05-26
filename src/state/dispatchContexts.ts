import { createContext } from 'react';
import type { ReadonlyContext, DispatchRequest, ActionResult } from '../input/types';

export const noopDispatcher = async (_req: DispatchRequest): Promise<ActionResult> => ({
  ok: false, error: 'Dispatcher not initialised.',
});

export const DispatchContext   = createContext<ReadonlyContext | null>(null);
export const DispatcherContext = createContext<(req: DispatchRequest) => Promise<ActionResult>>(noopDispatcher);
