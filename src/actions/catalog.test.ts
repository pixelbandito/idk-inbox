import { describe, it, expect } from 'vitest';
import { ACTION_CATALOG, ACTIONS, labelByActionName } from './catalog';
import { confirmationByActionName } from './confirmations';

describe('ACTION_CATALOG', () => {
  it('has no duplicate action ids', () => {
    const ids = ACTION_CATALOG.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('orders thread-write first, then layout, selection, app', () => {
    const categories = ACTION_CATALOG.map((e) => e.category);
    const firstAppearance = (cat: (typeof categories)[number]) => categories.indexOf(cat);
    expect(firstAppearance('thread-write')).toBeLessThan(firstAppearance('layout'));
    expect(firstAppearance('layout')).toBeLessThan(firstAppearance('selection'));
    expect(firstAppearance('selection')).toBeLessThan(firstAppearance('app'));
  });

  it('every entry has a non-empty label', () => {
    for (const e of ACTION_CATALOG) {
      expect(e.label).toMatch(/\S/);
    }
  });

  it('previewFor produces a useful context-aware string when present', () => {
    const archive = ACTION_CATALOG.find((e) => e.id === 'archive-thread')!;
    expect(archive.previewFor).toBeDefined();
    const ctx = {
      focusedPanelIndex: 1, focusedPanelKind: 'threadlist' as const, focusedLabel: 'INBOX',
      selection: ['t1', 't2', 't3'], mode: 'idle' as const, signedIn: true,
    };
    expect(archive.previewFor!(ctx)).toMatch(/3.*selected/i);
  });
});

describe('catalog parity', () => {
  // Registering an action by string id alone silently skips the dispatcher's
  // auth gate and trigger resolution — this net catches the next one.
  it('every ACTION_CATALOG id has a matching symbol in ACTIONS', () => {
    const symbolIds = new Set(ACTIONS.map((a) => a.name.description));
    for (const entry of ACTION_CATALOG) {
      expect(symbolIds, `missing symbol for catalog id ${entry.id}`).toContain(entry.id);
    }
  });

  it('every ACTIONS symbol has a label and a confirmation policy', () => {
    for (const action of ACTIONS) {
      expect(labelByActionName[action.name]).toBeTruthy();
      expect(confirmationByActionName[action.name]).toBeTruthy();
    }
  });
});
