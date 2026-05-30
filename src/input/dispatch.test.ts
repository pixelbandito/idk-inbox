import { describe, it, expect, vi } from 'vitest';
import { createDispatcher } from './dispatch';
import type { ReadonlyContext, ActionRegistry } from './types';

function makeCtx(over: Partial<ReadonlyContext> = {}): ReadonlyContext {
  return {
    focusedPanelIndex: 1, focusedPanelKind: 'threadlist', focusedLabel: 'INBOX',
    selection: [], mode: 'idle', signedIn: true, ...over,
  };
}

describe('createDispatcher', () => {
  it('looks up the action and invokes its handler', async () => {
    const handler = vi.fn().mockResolvedValue({ ok: true, description: 'done' });
    const registry: ActionRegistry = {
      'do-thing': { id: 'do-thing', label: 'Do', category: 'app', handler },
    };
    const dispatch = createDispatcher(registry);
    const result = await dispatch({ action: 'do-thing', args: { x: 1 }, context: makeCtx() });
    expect(result).toEqual({ ok: true, description: 'done' });
    expect(handler).toHaveBeenCalledWith({ x: 1 }, expect.objectContaining({ mode: 'idle' }));
  });

  it('returns ok:false when the action is not in the registry', async () => {
    const dispatch = createDispatcher({});
    const result = await dispatch({ action: 'nope', args: {}, context: makeCtx() });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/unknown action/i);
  });

  it('refuses Gmail-write actions when not signed in', async () => {
    const handler = vi.fn();
    const registry: ActionRegistry = {
      'archive-thread': {
        id: 'archive-thread', label: 'Archive', category: 'thread-write',
        handler, requiresAuth: true,
      },
    };
    const dispatch = createDispatcher(registry);
    const result = await dispatch({
      action: 'archive-thread', args: { targets: ['t1'] },
      context: makeCtx({ signedIn: false }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/sign in/i);
    expect(handler).not.toHaveBeenCalled();
  });
});
