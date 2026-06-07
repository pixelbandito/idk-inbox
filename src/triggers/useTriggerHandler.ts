// useTriggerHandler — a small hook producers can use to route AbstractEvents
// through the canonical pipeline (resolver + action map + dispatcher bridge),
// honoring an allowlist of enabled triggers for incremental migration.
//
// Call sites pass a stable (module-level) Set<TriggerName>. The returned
// callback is stable across renders given a stable context + dispatch + set.

import { useCallback, useMemo } from 'react';
import { useDispatchContext, useDispatcher } from '../state/useDispatch';
import { fireThrough, makeStringDispatchBridge } from './wireUp';
import type { AbstractEvent, TriggerName } from './types';

export function useTriggerHandler(
  enabledTriggers: ReadonlySet<TriggerName>,
): (event: AbstractEvent) => void {
  const ctx = useDispatchContext();
  const dispatch = useDispatcher();
  const bridge = useMemo(() => makeStringDispatchBridge(dispatch), [dispatch]);
  return useCallback((event: AbstractEvent) => {
    void fireThrough(event, ctx, bridge, enabledTriggers);
  }, [ctx, bridge, enabledTriggers]);
}
