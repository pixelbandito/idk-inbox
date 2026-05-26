import { describe, it, expect, vi } from 'vitest';
import { createLayoutActions } from './layout';
import type { ReadonlyContext } from '../input/types';
import type { Panel } from '../layout/types';

const ctx: ReadonlyContext = {
  focusedPanelIndex: 1,
  focusedPanelKind: 'threadlist',
  focusedLabel: 'INBOX',
  selection: [],
  mode: 'idle',
  signedIn: true,
};

function makeSetters(initialPanels: Panel[], initialFocus = 0) {
  let panels = initialPanels;
  let focus = initialFocus;
  const setPanels = vi.fn((updater: (p: Panel[]) => Panel[]) => {
    panels = updater(panels);
  });
  const setFocusIndex = vi.fn((updater: (i: number) => number) => {
    focus = updater(focus);
  });
  const bumpRefresh = vi.fn();
  return {
    setters: {
      setPanels,
      setFocusIndex,
      getPanels: () => panels,
      getFocusIndex: () => focus,
      bumpRefresh,
    },
    getPanels: () => panels,
    getFocus: () => focus,
    setPanels,
    setFocusIndex,
    bumpRefresh,
  };
}

describe('createLayoutActions', () => {
  describe('openPanel', () => {
    it('inserts a thread panel after the matching threadlist and focuses it', async () => {
      const initial: Panel[] = [
        { kind: 'settings' },
        { kind: 'threadlist', label: 'INBOX' },
      ];
      const env = makeSetters(initial, 1);
      const actions = createLayoutActions(env.setters);
      const result = await actions.openPanel({ kind: 'thread', threadId: 'tA' }, ctx);
      expect(result.ok).toBe(true);
      expect(env.getPanels()).toEqual([
        { kind: 'settings' },
        { kind: 'threadlist', label: 'INBOX' },
        { kind: 'thread', threadId: 'tA', sourceLabel: 'INBOX' },
      ]);
      expect(env.getFocus()).toBe(2);
    });

    it('falls back to INBOX when no focusedLabel is in context', async () => {
      const initial: Panel[] = [{ kind: 'threadlist', label: 'INBOX' }];
      const env = makeSetters(initial, 0);
      const actions = createLayoutActions(env.setters);
      const noLabelCtx: ReadonlyContext = { ...ctx, focusedLabel: undefined };
      await actions.openPanel({ kind: 'thread', threadId: 'tB' }, noLabelCtx);
      expect(env.getPanels()).toEqual([
        { kind: 'threadlist', label: 'INBOX' },
        { kind: 'thread', threadId: 'tB', sourceLabel: 'INBOX' },
      ]);
    });
  });

  describe('closePanel', () => {
    it('removes the indexed panel and shifts focus back if focus was past it', async () => {
      const initial: Panel[] = [
        { kind: 'threadlist', label: 'INBOX' },
        { kind: 'thread', threadId: 't1', sourceLabel: 'INBOX' },
        { kind: 'thread', threadId: 't2', sourceLabel: 'INBOX' },
      ];
      const env = makeSetters(initial, 2);
      const actions = createLayoutActions(env.setters);
      await actions.closePanel({ panelIndex: 1 }, ctx);
      expect(env.getPanels()).toEqual([
        { kind: 'threadlist', label: 'INBOX' },
        { kind: 'thread', threadId: 't2', sourceLabel: 'INBOX' },
      ]);
      expect(env.getFocus()).toBe(1);
    });

    it('keeps focus index unchanged if focus was before the closed index', async () => {
      const initial: Panel[] = [
        { kind: 'threadlist', label: 'INBOX' },
        { kind: 'thread', threadId: 't1', sourceLabel: 'INBOX' },
      ];
      const env = makeSetters(initial, 0);
      const actions = createLayoutActions(env.setters);
      await actions.closePanel({ panelIndex: 1 }, ctx);
      expect(env.getFocus()).toBe(0);
    });

    it('clamps focus to 0 minimum', async () => {
      const initial: Panel[] = [{ kind: 'threadlist', label: 'INBOX' }];
      const env = makeSetters(initial, 0);
      const actions = createLayoutActions(env.setters);
      await actions.closePanel({ panelIndex: 0 }, ctx);
      expect(env.getFocus()).toBe(0);
    });
  });

  describe('navPanelPrev / navPanelNext', () => {
    it('navPanelPrev decrements focus but never below zero', async () => {
      const env = makeSetters([{ kind: 'threadlist', label: 'INBOX' }, { kind: 'thread', threadId: 't1', sourceLabel: 'INBOX' }], 1);
      const actions = createLayoutActions(env.setters);
      await actions.navPanelPrev({}, ctx);
      expect(env.getFocus()).toBe(0);
      await actions.navPanelPrev({}, ctx);
      expect(env.getFocus()).toBe(0);
    });

    it('navPanelNext increments focus but never above panels.length - 1', async () => {
      const env = makeSetters(
        [
          { kind: 'threadlist', label: 'INBOX' },
          { kind: 'thread', threadId: 't1', sourceLabel: 'INBOX' },
        ],
        0,
      );
      const actions = createLayoutActions(env.setters);
      await actions.navPanelNext({}, ctx);
      expect(env.getFocus()).toBe(1);
      await actions.navPanelNext({}, ctx);
      expect(env.getFocus()).toBe(1);
    });
  });

  describe('refreshPanel', () => {
    it('calls bumpRefresh with focusedLabel when set', async () => {
      const env = makeSetters([{ kind: 'threadlist', label: 'INBOX' }], 0);
      const actions = createLayoutActions(env.setters);
      await actions.refreshPanel({}, ctx);
      expect(env.bumpRefresh).toHaveBeenCalledWith('INBOX');
    });

    it('falls back to idx:N key when focusedLabel is undefined', async () => {
      const env = makeSetters([{ kind: 'settings' }], 0);
      const actions = createLayoutActions(env.setters);
      const noLabelCtx: ReadonlyContext = { ...ctx, focusedLabel: undefined, focusedPanelIndex: 3 };
      await actions.refreshPanel({}, noLabelCtx);
      expect(env.bumpRefresh).toHaveBeenCalledWith('idx:3');
    });
  });
});
