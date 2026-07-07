import type { ActionResult, Mode, ReadonlyContext, UndoEntry } from '../input/types';

interface AppSetters {
  setMode:      (m: Mode) => void;
  clearStacks: () => void;
  popUndo:     () => UndoEntry | undefined;
  popRedo:     () => UndoEntry | undefined;
  pushUndo:    (e: UndoEntry) => void;
  pushRedo:    (e: UndoEntry) => void;
  externalSignIn:  () => Promise<void>;
  externalSignOut: () => void;
  /** Re-dispatches an action through the provider's dispatcher; used by undo/redo. */
  redispatch:  (request: { action: string; args: Record<string, unknown> }) => Promise<ActionResult>;
}

export function createAppActions(s: AppSetters) {
  return {
    signIn: async (_args: Record<string, unknown>, _ctx: ReadonlyContext): Promise<ActionResult> => {
      await s.externalSignIn();
      return { ok: true, description: 'Signed in' };
    },

    signOut: async (_args: Record<string, unknown>, _ctx: ReadonlyContext): Promise<ActionResult> => {
      s.externalSignOut();
      s.clearStacks();
      return { ok: true, description: 'Signed out' };
    },

    undo: async (_args: Record<string, unknown>, _ctx: ReadonlyContext): Promise<ActionResult> => {
      const entry = s.popUndo();
      if (!entry) return { ok: false, error: 'Nothing to undo.' };
      const result = await s.redispatch({ action: entry.inverse.action, args: entry.inverse.args });
      if (!result.ok) {
        // A failed inverse (offline, expired token) must not eat the entry —
        // restore it so the user can retry.
        s.pushUndo(entry);
        return result;
      }
      s.pushRedo(entry);
      return { ok: true, description: entry.inverse.description };
    },

    redo: async (_args: Record<string, unknown>, _ctx: ReadonlyContext): Promise<ActionResult> => {
      const entry = s.popRedo();
      if (!entry) return { ok: false, error: 'Nothing to redo.' };
      const result = await s.redispatch({ action: entry.original.action, args: entry.original.args });
      if (!result.ok) {
        s.pushRedo(entry);
        return result;
      }
      // Prefer the fresh inverse: the redo may have succeeded for threads the
      // original run failed on, and the stale inverse would skip them on undo.
      s.pushUndo(result.inverse
        ? { original: { ...entry.original, description: result.description }, inverse: result.inverse }
        : entry);
      return { ok: true, description: entry.original.description };
    },

    openCommandPalette: async (_args: Record<string, unknown>, _ctx: ReadonlyContext): Promise<ActionResult> => {
      s.setMode('cmd-k');
      return { ok: true, description: 'Opened command palette' };
    },

    exitMode: async (_args: Record<string, unknown>, _ctx: ReadonlyContext): Promise<ActionResult> => {
      s.setMode('idle');
      return { ok: true, description: 'Exited mode' };
    },
  };
}
