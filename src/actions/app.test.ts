import { describe, it, expect, vi } from 'vitest';
import { createAppActions } from './app';
import type { ActionResult, ReadonlyContext, UndoEntry } from '../input/types';

const ctx: ReadonlyContext = {
  focusedPanelIndex: 1,
  focusedPanelKind: 'threadlist',
  focusedLabel: 'INBOX',
  selection: [],
  mode: 'idle',
  signedIn: true,
};

function makeSetters(overrides: Partial<Parameters<typeof createAppActions>[0]> = {}) {
  return {
    setMode: vi.fn(),
    clearStacks: vi.fn(),
    popUndo: vi.fn((): UndoEntry | undefined => undefined),
    popRedo: vi.fn((): UndoEntry | undefined => undefined),
    pushUndo: vi.fn(),
    pushRedo: vi.fn(),
    externalSignIn: vi.fn(async () => {}),
    externalSignOut: vi.fn(),
    redispatch: vi.fn(async (): Promise<ActionResult> => ({ ok: true, description: 'ok' })),
    ...overrides,
  };
}

const sampleEntry: UndoEntry = {
  original: { action: 'archive-thread', args: { targets: ['t1'] }, description: 'Archived 1 thread' },
  inverse:  { action: 'modify-thread-labels', args: { targets: ['t1'], add: ['INBOX'], remove: [] }, description: 'Restored 1 thread' },
};

describe('createAppActions', () => {
  it('signIn awaits externalSignIn and returns ok', async () => {
    const s = makeSetters();
    const actions = createAppActions(s);
    const result = await actions.signIn({}, ctx);
    expect(s.externalSignIn).toHaveBeenCalled();
    expect(result.ok).toBe(true);
  });

  it('signOut calls externalSignOut and clears stacks', async () => {
    const s = makeSetters();
    const actions = createAppActions(s);
    const result = await actions.signOut({}, ctx);
    expect(s.externalSignOut).toHaveBeenCalled();
    expect(s.clearStacks).toHaveBeenCalled();
    expect(result.ok).toBe(true);
  });

  it('openCommandPalette sets mode to cmd-k', async () => {
    const s = makeSetters();
    const actions = createAppActions(s);
    await actions.openCommandPalette({}, ctx);
    expect(s.setMode).toHaveBeenCalledWith('cmd-k');
  });

  it('exitMode sets mode to idle', async () => {
    const s = makeSetters();
    const actions = createAppActions(s);
    await actions.exitMode({}, ctx);
    expect(s.setMode).toHaveBeenCalledWith('idle');
  });

  describe('undo', () => {
    it('returns error when undo stack is empty', async () => {
      const s = makeSetters({ popUndo: vi.fn(() => undefined) });
      const actions = createAppActions(s);
      const result = await actions.undo({}, ctx);
      expect(result.ok).toBe(false);
      expect(s.redispatch).not.toHaveBeenCalled();
    });

    it('redispatches inverse and pushes entry to redo stack on success', async () => {
      const s = makeSetters({
        popUndo: vi.fn(() => sampleEntry),
        redispatch: vi.fn(async (): Promise<ActionResult> => ({ ok: true, description: 'restored' })),
      });
      const actions = createAppActions(s);
      const result = await actions.undo({}, ctx);
      expect(s.redispatch).toHaveBeenCalledWith({
        action: sampleEntry.inverse.action,
        args: sampleEntry.inverse.args,
      });
      expect(s.pushRedo).toHaveBeenCalledWith(sampleEntry);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.description).toBe(sampleEntry.inverse.description);
    });

    it('does not push to redo stack if redispatch fails', async () => {
      const s = makeSetters({
        popUndo: vi.fn(() => sampleEntry),
        redispatch: vi.fn(async (): Promise<ActionResult> => ({ ok: false, error: 'nope' })),
      });
      const actions = createAppActions(s);
      const result = await actions.undo({}, ctx);
      expect(s.pushRedo).not.toHaveBeenCalled();
      expect(result.ok).toBe(false);
    });

    it('restores the entry when the inverse fails, so undo can be retried', async () => {
      const s = makeSetters({
        popUndo: vi.fn(() => sampleEntry),
        redispatch: vi.fn(async (): Promise<ActionResult> => ({ ok: false, error: 'offline' })),
      });
      const actions = createAppActions(s);
      await actions.undo({}, ctx);
      expect(s.pushUndo).toHaveBeenCalledWith(sampleEntry);
    });
  });

  describe('redo', () => {
    it('returns error when redo stack is empty', async () => {
      const s = makeSetters({ popRedo: vi.fn(() => undefined) });
      const actions = createAppActions(s);
      const result = await actions.redo({}, ctx);
      expect(result.ok).toBe(false);
      expect(s.redispatch).not.toHaveBeenCalled();
    });

    it('redispatches original and pushes entry to undo stack on success', async () => {
      const s = makeSetters({
        popRedo: vi.fn(() => sampleEntry),
        redispatch: vi.fn(async (): Promise<ActionResult> => ({ ok: true, description: 'redone' })),
      });
      const actions = createAppActions(s);
      const result = await actions.redo({}, ctx);
      expect(s.redispatch).toHaveBeenCalledWith({
        action: sampleEntry.original.action,
        args: sampleEntry.original.args,
      });
      expect(s.pushUndo).toHaveBeenCalledWith(sampleEntry);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.description).toBe(sampleEntry.original.description);
    });

    it('prefers the fresh inverse from the redo run over the stale entry', async () => {
      // The redo may succeed for threads the original run failed on; the
      // stale inverse would skip them on the next undo.
      const freshInverse = {
        action: 'modify-thread-labels',
        args: { targets: ['t1', 't2'], add: ['INBOX'], remove: [] },
        description: 'Restored 2 threads',
      };
      const s = makeSetters({
        popRedo: vi.fn(() => sampleEntry),
        redispatch: vi.fn(async (): Promise<ActionResult> =>
          ({ ok: true, description: 'Archived 2 threads', inverse: freshInverse })),
      });
      const actions = createAppActions(s);
      await actions.redo({}, ctx);
      expect(s.pushUndo).toHaveBeenCalledWith({
        original: { ...sampleEntry.original, description: 'Archived 2 threads' },
        inverse: freshInverse,
      });
    });

    it('restores the entry when the redo fails', async () => {
      const s = makeSetters({
        popRedo: vi.fn(() => sampleEntry),
        redispatch: vi.fn(async (): Promise<ActionResult> => ({ ok: false, error: 'offline' })),
      });
      const actions = createAppActions(s);
      await actions.redo({}, ctx);
      expect(s.pushRedo).toHaveBeenCalledWith(sampleEntry);
      expect(s.pushUndo).not.toHaveBeenCalled();
    });
  });
});
