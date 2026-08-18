import type { ActionResult, ReadonlyContext, ThreadRef } from '../input/types';
import { openThread, openThreadlist, openSingletonPanel, closeAt } from '../layout/operations';
import { displayNameOf } from '../lib/gmail/labelDisplay';
import type { Panel } from '../layout/types';

export type OpenPanelArgs =
  | { kind: 'thread'; threadId: ThreadRef }
  | { kind: 'threadlist'; label: string }
  | { kind: 'automations' };

interface LayoutSetters {
  setPanels:      (updater: (p: Panel[]) => Panel[]) => void;
  setFocusIndex:  (updater: (i: number) => number) => void;
  getPanels:      () => Panel[];
  getFocusIndex:  () => number;
  bumpRefresh:    (panelKey: string) => void;
}

export function createLayoutActions(s: LayoutSetters) {
  return {
    openPanel: async (
      args: OpenPanelArgs,
      ctx: ReadonlyContext,
    ): Promise<ActionResult> => {
      if (args.kind === 'threadlist') {
        let focusAt = -1;
        s.setPanels((p) => {
          const result = openThreadlist(p, args.label);
          focusAt = result.focusIndex;
          return result.panels;
        });
        if (focusAt >= 0) s.setFocusIndex(() => focusAt);
        return { ok: true, description: `Opened ${displayNameOf(args.label)}` };
      }

      if (args.kind === 'automations') {
        let focusAt = -1;
        s.setPanels((p) => {
          const result = openSingletonPanel(p, { kind: 'automations', closable: true });
          focusAt = result.focusIndex;
          return result.panels;
        });
        if (focusAt >= 0) s.setFocusIndex(() => focusAt);
        return { ok: true, description: 'Opened automations' };
      }

      const sourceLabel = ctx.focusedLabel ?? 'INBOX';
      let insertedIndex = -1;
      s.setPanels((p) => {
        const next = openThread(p, sourceLabel, args.threadId);
        insertedIndex = next.findIndex(
          (panel) =>
            panel.kind === 'thread' &&
            panel.threadId === args.threadId &&
            panel.sourceLabel === sourceLabel,
        );
        return next;
      });
      if (insertedIndex >= 0) s.setFocusIndex(() => insertedIndex);
      return { ok: true, description: `Opened thread ${args.threadId}` };
    },

    closePanel: async (
      args: { panelIndex: number },
      _ctx: ReadonlyContext,
    ): Promise<ActionResult> => {
      s.setPanels((p) => closeAt(p, args.panelIndex));
      s.setFocusIndex((i) => Math.max(0, i > args.panelIndex ? i - 1 : i));
      return { ok: true, description: 'Closed panel' };
    },

    navPanelPrev: async (
      _args: Record<string, unknown>,
      _ctx: ReadonlyContext,
    ): Promise<ActionResult> => {
      s.setFocusIndex((i) => Math.max(0, i - 1));
      return { ok: true, description: 'Previous panel' };
    },

    navPanelNext: async (
      _args: Record<string, unknown>,
      _ctx: ReadonlyContext,
    ): Promise<ActionResult> => {
      s.setFocusIndex((i) => Math.min(s.getPanels().length - 1, i + 1));
      return { ok: true, description: 'Next panel' };
    },

    refreshPanel: async (
      _args: Record<string, unknown>,
      ctx: ReadonlyContext,
    ): Promise<ActionResult> => {
      const key = ctx.focusedLabel ?? `idx:${ctx.focusedPanelIndex}`;
      s.bumpRefresh(key);
      return { ok: true, description: 'Refresh requested' };
    },
  };
}
