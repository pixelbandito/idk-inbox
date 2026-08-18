import { describe, it, expect } from 'vitest';
import { gestureGroups, KEYBOARD_SHORTCUTS } from './shortcutBindings';
import { ACTION_MAP } from '../../triggers/actionMap';

describe('gestureGroups', () => {
  it('lists both swipe directions, ordered short → full', () => {
    const groups = gestureGroups();
    expect(groups).toHaveLength(2);
    for (const group of groups) {
      expect(group.rows[0].distance).toBe('Short swipe');
      expect(group.rows.map((r) => r.action)).toContain(group.rows[0].action);
    }
    const actions = groups.flatMap((g) => g.rows.map((r) => r.action));
    expect(actions).toEqual(expect.arrayContaining(['Archive', 'Delete', 'Snooze', 'Label']));
  });
});

describe('KEYBOARD_SHORTCUTS', () => {
  it('covers every document-surface keyboard binding', () => {
    // One row per key, but J and E share the Archive row, so account for that.
    const documentBindings = ACTION_MAP.get('document')?.size ?? 0;
    const rowKeyCount = KEYBOARD_SHORTCUTS.reduce(
      (n, r) => n + r.keys.split(' or ').length,
      0,
    );
    expect(rowKeyCount).toBe(documentBindings);
  });
});
