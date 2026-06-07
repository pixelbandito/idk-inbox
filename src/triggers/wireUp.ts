// wireUp — small bridge between the new symbol-based trigger pipeline and
// the existing string-keyed dispatcher.
//
// resolveAndFire() wants a TriggerDispatchFn that takes an action symbol.
// The existing dispatcher from <DispatchProvider> takes a string ActionId.
// makeStringDispatchBridge() builds the adaptor.
//
// The mapping uses Symbol.description, which holds the kebab-case ActionId
// the legacy dispatcher already keys on (see src/actions/types.ts where
// every symbol is constructed as Symbol('<action-id>')). This is the
// single-source-of-truth for the symbol↔string correspondence; no separate
// map is needed.
//
// During Step 2 the new pipeline is gated off (USE_NEW_TRIGGERS = false in
// App.tsx); the bridge exists primarily so resolveAndFire compiles.

import type { ActionResult, ReadonlyContext } from '../input/types';
import { ACTION_MAP } from './actionMap';
import { resolveAndFire, type TriggerDispatchFn, type TriggerDispatchRequest } from './resolve';
import { TRIGGERS } from './triggers';
import type { AbstractEvent, TriggerName } from './types';

/** Adapt the legacy string-keyed dispatcher to TriggerDispatchFn. */
export function makeStringDispatchBridge(
  stringDispatch: (req: { action: string; args: Record<string, unknown>; context: ReadonlyContext }) =>
    Promise<ActionResult>,
): TriggerDispatchFn {
  return (req: TriggerDispatchRequest) => {
    const id = req.action.description;
    if (!id) {
      // Defensive — every ActionName symbol is constructed with a description.
      console.warn('[triggers] action symbol missing description', req.action);
      return Promise.resolve({ ok: false, error: 'Internal: action has no string id.' });
    }
    return stringDispatch({
      action:  id,
      args:    req.args as Record<string, unknown>,
      context: req.context,
    });
  };
}

/**
 * One-shot helper: feed an AbstractEvent into the canonical pipeline.
 *
 * `enabledTriggers` is an optional allowlist for incremental migration — when
 * supplied, only triggers in the set are eligible. Step 3 (the canary) uses
 * a single-element set; Step 4 expands it batch-by-batch; Step 5 drops it.
 */
export function fireThrough(
  event:    AbstractEvent,
  ctx:      ReadonlyContext,
  dispatch: TriggerDispatchFn,
  enabledTriggers?: ReadonlySet<TriggerName>,
): Promise<ActionResult | null> {
  return resolveAndFire(event, ctx, dispatch, ACTION_MAP, TRIGGERS, enabledTriggers);
}
