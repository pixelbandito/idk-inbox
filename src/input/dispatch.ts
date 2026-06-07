import type { ActionRegistry, ActionResult, DispatchRequest } from './types';
import { ACTIONS } from '../actions/catalog';
import type { ActionName } from '../actions/types';
import { confirmationByActionName, CONFIRMATION_REQUIREMENTS } from '../actions/confirmations';

// Reverse lookup: action-id string → ActionName symbol. Each symbol's
// description is exactly the kebab-case action id (see src/actions/types.ts),
// so the map is built once at module scope from the canonical ACTIONS list.
const ACTION_NAME_BY_ID: Map<string, ActionName> = new Map(
  ACTIONS.map((a) => [a.name.description as string, a.name]),
);

function requiresAuthFor(actionId: string): boolean {
  const name = ACTION_NAME_BY_ID.get(actionId);
  if (!name) return false;
  const confirmationId = confirmationByActionName[name];
  return CONFIRMATION_REQUIREMENTS.get(confirmationId)?.requiresAuth === true;
}

export function createDispatcher(registry: ActionRegistry) {
  return async function dispatch(req: DispatchRequest): Promise<ActionResult> {
    const action = registry[req.action];
    if (!action) {
      return { ok: false, error: `Unknown action: ${req.action}` };
    }
    if (requiresAuthFor(req.action) && !req.context.signedIn) {
      return { ok: false, error: 'Please sign in.' };
    }
    return action.handler(req.args, req.context);
  };
}
