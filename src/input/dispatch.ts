import type { ActionRegistry, ActionResult, DispatchRequest } from './types';

export function createDispatcher(registry: ActionRegistry) {
  return async function dispatch(req: DispatchRequest): Promise<ActionResult> {
    const action = registry[req.action];
    if (!action) {
      return { ok: false, error: `Unknown action: ${req.action}` };
    }
    if (action.requiresAuth && !req.context.signedIn) {
      return { ok: false, error: 'Please sign in.' };
    }
    return action.handler(req.args, req.context);
  };
}
