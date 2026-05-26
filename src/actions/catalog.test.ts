import { describe, it, expect } from 'vitest';
import { ACTION_CATALOG } from './catalog';

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
