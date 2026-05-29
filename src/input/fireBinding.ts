import type { ActionResult, Binding, DispatchRequest, ReadonlyContext } from './types';
import { evaluateWhen } from './predicates';
import { targetFromRow, targetsFromSelection } from './helpers';

interface InputEventLike {
  target: Element | null;
}

type DispatchFn = (req: DispatchRequest) => Promise<ActionResult>;

const THREAD_WRITE_ACTIONS = new Set([
  'modify-thread-labels', 'archive-thread', 'delete-thread', 'spam-thread',
  'add-label-thread', 'remove-label-thread', 'snooze-thread', 'unsubscribe-thread',
]);

function resolveArgs(binding: Binding, event: InputEventLike, ctx: ReadonlyContext): Record<string, unknown> {
  // open-panel: thread target derived from the row's data-thread-id
  if (binding.action === 'open-panel') {
    const threadId = targetFromRow(event.target);
    return threadId ? { kind: 'thread', threadId } : {};
  }
  // thread-write actions: prefer non-empty selection over event-derived single target
  if (THREAD_WRITE_ACTIONS.has(binding.action)) {
    if (ctx.selection.length > 0) return { targets: targetsFromSelection(ctx) };
    const t = targetFromRow(event.target);
    return t ? { targets: [t] } : { targets: [] };
  }
  // Layout / app actions take no args from the event.
  return {};
}

export async function fireBinding(
  binding: Binding,
  event: InputEventLike,
  ctx: ReadonlyContext,
  dispatch: DispatchFn,
): Promise<ActionResult | null> {
  if (!evaluateWhen(binding.when, ctx)) return null;
  const args = resolveArgs(binding, event, ctx);
  return dispatch({ action: binding.action, args, context: ctx });
}
