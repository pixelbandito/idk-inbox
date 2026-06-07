// resolveAndFire — the single pure entry point for the new pipeline.
//
// Given an AbstractEvent + readonly context + dispatch + the surface→trigger→
// action map + the canonical trigger registry:
//
//   1. Filter triggers by match(event).
//   2. For each, look up the action assigned to (event.surface, trigger.name).
//      Drop the ones with no assignment.
//   3. Sort surviving candidates by priority descending.
//   4. On a top-two priority tie, console.warn (and let the first-defined win,
//      since Array.prototype.sort is stable in modern V8).
//   5. Dispatch the top candidate's action with args from argsFor().
//
// Returns the dispatcher's Promise<ActionResult>, or null if nothing fired.
//
// Auth gating is NOT done here — it lives in the dispatcher's confirmation
// lookup (see design doc § "Why predicates disappear").

import { ACTION_BY_NAME_MAP, type ActionName } from '../actions/catalog';
import type { ActionResult, ReadonlyContext } from '../input/types';
import { argsFor, type ArgsForResult } from './argsFor';
import type { AbstractEvent, Surface, Trigger, TriggerName } from './types';

export interface TriggerDispatchRequest {
  action:  ActionName;
  args:    ArgsForResult;
  context: ReadonlyContext;
}

export type TriggerDispatchFn = (req: TriggerDispatchRequest) => Promise<ActionResult>;

export async function resolveAndFire(
  event:    AbstractEvent,
  ctx:      ReadonlyContext,
  dispatch: TriggerDispatchFn,
  map:      Map<Surface, Map<TriggerName, ActionName>>,
  triggers: readonly Trigger[],
  /**
   * Optional allowlist for incremental migration: when defined, only triggers
   * whose name is in this set can produce candidates. `undefined` means all
   * triggers are eligible (production mode). See Step 3 of the trigger plan —
   * the canary uses a one-element set to enable a single trigger end-to-end
   * while the rest still route through the legacy pipeline.
   */
  enabledTriggers?: ReadonlySet<TriggerName>,
): Promise<ActionResult | null> {
  // 1. Match.
  const matched = triggers.filter((t) => t.match(event));
  if (matched.length === 0) return null;

  // 2. Look up the action assigned for this surface + trigger.
  const surfaceMap = map.get(event.surface);
  if (!surfaceMap) return null;

  type Candidate = { trigger: Trigger; action: ActionName };
  const candidates: Candidate[] = [];
  for (const trigger of matched) {
    if (enabledTriggers && !enabledTriggers.has(trigger.name)) continue;
    const action = surfaceMap.get(trigger.name);
    if (action !== undefined) candidates.push({ trigger, action });
  }
  if (candidates.length === 0) return null;

  // 3. Sort by priority desc. Array.prototype.sort is stable, so equal
  //    priorities preserve registry order — that's our tie-break rule.
  candidates.sort((a, b) => b.trigger.priority - a.trigger.priority);

  // 4. Warn on collision.
  if (
    candidates.length > 1
    && candidates[0].trigger.priority === candidates[1].trigger.priority
  ) {
    console.warn('[triggers] priority collision', candidates.slice(0, 2));
  }

  // 5. Dispatch the winner.
  const winner = candidates[0];
  const action = ACTION_BY_NAME_MAP.get(winner.action);
  if (!action) {
    // Defensive — the action map should never reference an unregistered name.
    console.warn('[triggers] unknown action in action map', winner.action);
    return null;
  }
  return dispatch({
    action: winner.action,
    args:   argsFor(action, event, ctx),
    context: ctx,
  });
}
