import type { ActionId, ActionCategory, PickerId, PredicateId, ReadonlyContext } from '../input/types';

export interface ActionCatalogEntry {
  id:           ActionId;
  label:        string;
  category:     ActionCategory;
  destructive?: boolean;
  requiresAuth?: boolean;
  elicitVia?:   PickerId;
  /** Optional pure function producing a context-aware preview string for Cmd-K. */
  previewFor?:  (ctx: ReadonlyContext) => string;
  /** Optional default keyboard combo to display in the palette. */
  keyboardCue?: string;
  /** Optional predicate id (or array) listed for the palette to filter ineligible entries. */
  when?:        PredicateId | PredicateId[];
}

function targetCount(ctx: ReadonlyContext): number {
  return ctx.selection.length > 0 ? ctx.selection.length : ctx.focusedPanelKind === 'thread' ? 1 : 1;
}

function targetWord(n: number): string { return n === 1 ? 'thread' : 'threads'; }

function previewTargets(verb: string) {
  return (ctx: ReadonlyContext) => {
    if (ctx.selection.length > 0) return `${verb} ${ctx.selection.length} selected`;
    if (ctx.focusedPanelKind === 'thread') return `${verb} this thread`;
    return `${verb} focused ${targetWord(targetCount(ctx))}`;
  };
}

export const ACTION_CATALOG: ActionCatalogEntry[] = [
  // Thread-write
  { id: 'archive-thread',      label: 'Archive',          category: 'thread-write', requiresAuth: true, keyboardCue: 'J', previewFor: previewTargets('Archive') },
  { id: 'delete-thread',       label: 'Delete',           category: 'thread-write', requiresAuth: true, destructive: true, keyboardCue: '#', previewFor: previewTargets('Delete') },
  { id: 'spam-thread',         label: 'Mark as spam',     category: 'thread-write', requiresAuth: true, destructive: true, keyboardCue: '!', previewFor: previewTargets('Mark as spam') },
  { id: 'snooze-thread',       label: 'Snooze',           category: 'thread-write', requiresAuth: true, elicitVia: 'picker-snooze', keyboardCue: 'B', previewFor: previewTargets('Snooze') },
  { id: 'add-label-thread',    label: 'Apply label',      category: 'thread-write', requiresAuth: true, elicitVia: 'picker-label', previewFor: previewTargets('Apply label to') },
  { id: 'remove-label-thread', label: 'Remove label',     category: 'thread-write', requiresAuth: true, elicitVia: 'picker-label', previewFor: previewTargets('Remove label from') },
  { id: 'unsubscribe-thread',  label: 'Unsubscribe',      category: 'thread-write', requiresAuth: true, destructive: true, previewFor: previewTargets('Unsubscribe from') },
  { id: 'modify-thread-labels',label: 'Modify labels…',   category: 'thread-write', requiresAuth: true },

  // Layout
  { id: 'open-panel',          label: 'Open',             category: 'layout' },
  { id: 'close-panel',         label: 'Close panel',      category: 'layout' },
  { id: 'nav-panel-prev',      label: 'Previous panel',   category: 'layout' },
  { id: 'nav-panel-next',      label: 'Next panel',       category: 'layout' },
  { id: 'refresh-panel',       label: 'Refresh',          category: 'layout' },

  // Selection
  { id: 'enter-selection',     label: 'Select',           category: 'selection' },
  { id: 'exit-selection',      label: 'Exit selection',   category: 'selection' },
  { id: 'toggle-selection',    label: 'Toggle selection', category: 'selection' },

  // App
  { id: 'sign-in',             label: 'Sign in',          category: 'app' },
  { id: 'sign-out',            label: 'Sign out',         category: 'app' },
  { id: 'undo',                label: 'Undo',             category: 'app', keyboardCue: '⌘Z' },
  { id: 'redo',                label: 'Redo',             category: 'app', keyboardCue: '⌘⇧Z' },
  { id: 'open-command-palette',label: 'Command palette',  category: 'app', keyboardCue: '⌘K' },
  { id: 'exit-mode',           label: 'Cancel',           category: 'app', keyboardCue: 'Esc' },
];
