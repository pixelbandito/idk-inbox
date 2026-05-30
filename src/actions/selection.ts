import type { ActionResult, Mode, ReadonlyContext, ThreadRef } from '../input/types';

interface Setters {
  setMode:      (m: Mode) => void;
  setSelection: (s: ThreadRef[]) => void;
}

export function createSelectionActions(s: Setters) {
  return {
    enterSelection: async (
      args: { initialTarget?: ThreadRef },
      _ctx: ReadonlyContext,
    ): Promise<ActionResult> => {
      s.setMode('selecting');
      s.setSelection(args.initialTarget ? [args.initialTarget] : []);
      return { ok: true, description: 'Entered selection mode' };
    },

    exitSelection: async (_args: Record<string, unknown>, _ctx: ReadonlyContext): Promise<ActionResult> => {
      s.setMode('idle');
      s.setSelection([]);
      return { ok: true, description: 'Exited selection mode' };
    },

    toggleSelection: async (
      args: { target: ThreadRef },
      ctx: ReadonlyContext,
    ): Promise<ActionResult> => {
      const exists = ctx.selection.includes(args.target);
      const next   = exists
        ? ctx.selection.filter((t) => t !== args.target)
        : [...ctx.selection, args.target];
      s.setSelection(next);
      return { ok: true, description: exists ? 'Deselected' : 'Selected' };
    },
  };
}
