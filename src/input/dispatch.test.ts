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

  it('refuses Gmail-write actions when not signed in (auth via confirmation lifecycle)', async () => {
    const handler = vi.fn();
    // archive-thread's confirmation policy is requiresAuthOnly, so the
    // dispatcher should reject it without invoking the handler when the
    // context says signedIn: false. The registry entry itself no longer
    // carries auth metadata — the side-map is the single source.
    const registry: ActionRegistry = {
      'archive-thread': {
        id: 'archive-thread', label: 'Archive', category: 'thread-write',
        handler,
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

  it('allows sign-in itself when not signed in (its confirmation is noConfirmation)', async () => {
    const handler = vi.fn().mockResolvedValue({ ok: true, description: 'signed in' });
    const registry: ActionRegistry = {
      'sign-in': { id: 'sign-in', label: 'Sign in', category: 'app', handler },
    };
    const dispatch = createDispatcher(registry);
    const result = await dispatch({
      action: 'sign-in', args: {}, context: makeCtx({ signedIn: false }),
    });
    expect(result).toEqual({ ok: true, description: 'signed in' });
    expect(handler).toHaveBeenCalled();
  });

  it('allows layout actions like open-panel even when not signed in', async () => {
    const handler = vi.fn().mockResolvedValue({ ok: true, description: 'opened' });
    const registry: ActionRegistry = {
      'open-panel': { id: 'open-panel', label: 'Open', category: 'layout', handler },
    };
    const dispatch = createDispatcher(registry);
    const result = await dispatch({
      action: 'open-panel', args: {}, context: makeCtx({ signedIn: false }),
    });
    expect(result.ok).toBe(true);
    expect(handler).toHaveBeenCalled();
  });
});
