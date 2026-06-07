// argsFor — derive the dispatcher args payload for a given action + event +
// readonly context. This is the analog of resolveArgs() in the legacy
// src/input/fireBinding.ts but driven by the new symbol-based Action shape
// rather than string ids.
//
// Rules (carried over from the legacy resolver):
//
//   1. openPanelAction → { kind: 'thread', threadId } from the row's
//      data-thread-id (walked up from event.target). Empty object if no row.
//
//   2. Thread-targeted actions (action.modelName === threadModel, excluding
//      openPanelAction which is special-cased): prefer ctx.selection when
//      non-empty, else fall back to a single-target list from the row's
//      data-thread-id. Empty list if neither yields a target.
//
//   3. Layout / app / selection / non-thread actions: empty args.

import {
  openPanelAction,
  threadModel,
  type Action,
} from '../actions/types';
import { targetFromRow, targetsFromSelection } from '../input/helpers';
import type { ReadonlyContext, ThreadRef } from '../input/types';
import type { AbstractEvent } from './types';

export type ArgsForResult =
  | Record<string, never>
  | { targets: ThreadRef[] }
  | { kind: 'thread'; threadId: ThreadRef };

function eventTarget(event: AbstractEvent): Element | null {
  // Only gesture events carry a target. keypress events do not.
  if (
    event.kind === 'gesture-click'
    || event.kind === 'gesture-long-press'
    || event.kind === 'gesture-swipe'
  ) {
    return event.target;
  }
  return null;
}

export function argsFor(
  action: Action,
  event:  AbstractEvent,
  ctx:    ReadonlyContext,
): ArgsForResult {
  // Special-case: open-panel needs a single threadId from the row.
  if (action.name === openPanelAction) {
    const threadId = targetFromRow(eventTarget(event));
    return threadId ? { kind: 'thread', threadId } : {};
  }

  // Thread-targeted actions: prefer selection, fall back to event-derived row.
  if (action.modelName === threadModel) {
    if (ctx.selection.length > 0) {
      return { targets: targetsFromSelection(ctx) };
    }
    const t = targetFromRow(eventTarget(event));
    return { targets: t ? [t] : [] };
  }

  // Layout / app / selection-mode actions take no args from the event.
  return {};
}
