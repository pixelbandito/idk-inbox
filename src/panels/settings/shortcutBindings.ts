// Human-readable views of the input bindings for the Settings reference. The
// gesture list is derived straight from ROW_SWIPE_BINDINGS so it can't drift;
// the keyboard list is authored here beside ACTION_MAP (symbols have no key
// labels to reflect), with a test asserting it stays in sync with the map.

import { ROW_SWIPE_BINDINGS, ACTION_PRESENTATION } from '../../input/swipeIntents';

export interface GestureRow {
  /** e.g. "Short swipe" / "Full swipe". */
  distance: string;
  /** The action's display label, e.g. "Archive". */
  action: string;
}

export interface GestureGroup {
  /** The light (shortest) action names the group so users orient by outcome. */
  heading: string;
  rows: GestureRow[];
}

/** Row-swipe bindings grouped by direction, each ordered light → heavy. */
export function gestureGroups(): GestureGroup[] {
  const directions: Array<'end' | 'start'> = ['end', 'start'];
  return directions.map((direction) => {
    const bindings = ROW_SWIPE_BINDINGS
      .filter((b) => b.direction === direction)
      .sort((a, b) => a.armAtFraction - b.armAtFraction);
    const rows = bindings.map((b, i) => ({
      distance: i === 0 ? 'Short swipe' : 'Full swipe',
      action: ACTION_PRESENTATION[b.action]?.label ?? b.action,
    }));
    return { heading: rows.map((r) => r.action).join(' / '), rows };
  });
}

export interface ShortcutRow {
  keys: string;
  action: string;
}

/** Keyboard shortcuts, mirroring the 'document' surface of ACTION_MAP. */
export const KEYBOARD_SHORTCUTS: ShortcutRow[] = [
  { keys: 'J or E', action: 'Archive' },
  { keys: '#', action: 'Delete' },
  { keys: '!', action: 'Report spam' },
  { keys: 'B', action: 'Snooze' },
  { keys: '⌘K', action: 'Command palette' },
  { keys: 'Esc', action: 'Cancel / exit selection' },
  { keys: '⌘Z', action: 'Undo' },
  { keys: '⇧⌘Z', action: 'Redo' },
];
