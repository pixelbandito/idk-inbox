import type { ActionId, ActionCategory, PickerId, PredicateId, ReadonlyContext } from '../input/types';
import {
  // Thread-targeted
  archiveThreadAction,
  deleteThreadAction,
  spamThreadAction,
  snoozeThreadAction,
  addLabelThreadAction,
  removeLabelThreadAction,
  unsubscribeThreadAction,
  modifyThreadLabelsAction,
  // Layout
  openPanelAction,
  closePanelAction,
  navPanelPrevAction,
  navPanelNextAction,
  refreshPanelAction,
  // Selection
  enterSelectionAction,
  exitSelectionAction,
  toggleSelectionAction,
  // App
  signInAction,
  signOutAction,
  undoAction,
  redoAction,
  openCommandPaletteAction,
  exitModeAction,
  // Models
  threadModel,
  // Types
  type Action,
  type ActionName,
} from './types';

export type { Action, ActionName, ModelName } from './types';
export {
  archiveThreadAction, deleteThreadAction, spamThreadAction, snoozeThreadAction,
  addLabelThreadAction, removeLabelThreadAction, unsubscribeThreadAction,
  modifyThreadLabelsAction, openPanelAction, closePanelAction, navPanelPrevAction,
  navPanelNextAction, refreshPanelAction, enterSelectionAction, exitSelectionAction,
  toggleSelectionAction, signInAction, signOutAction, undoAction, redoAction,
  openCommandPaletteAction, exitModeAction, threadModel,
} from './types';

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

// ----- Source of truth -----

export const ACTIONS: Action[] = [
  // Thread-targeted
  { name: archiveThreadAction,      modelName: threadModel },
  { name: deleteThreadAction,       modelName: threadModel },
  { name: spamThreadAction,         modelName: threadModel },
  { name: snoozeThreadAction,       modelName: threadModel },
  { name: addLabelThreadAction,     modelName: threadModel },
  { name: removeLabelThreadAction,  modelName: threadModel },
  { name: unsubscribeThreadAction,  modelName: threadModel },
  { name: modifyThreadLabelsAction, modelName: threadModel },

  // Layout (open-panel takes a threadId; the rest operate on the focused panel
  // / app state and have no model target)
  { name: openPanelAction,    modelName: threadModel },
  { name: closePanelAction },
  { name: navPanelPrevAction },
  { name: navPanelNextAction },
  { name: refreshPanelAction },

  // Selection (toggle operates on a thread; enter/exit are UI mode)
  { name: enterSelectionAction },
  { name: exitSelectionAction },
  { name: toggleSelectionAction, modelName: threadModel },

  // App
  { name: signInAction },
  { name: signOutAction },
  { name: undoAction },
  { name: redoAction },
  { name: openCommandPaletteAction },
  { name: exitModeAction },
];

export const ACTION_BY_NAME_MAP = new Map<ActionName, Action>(
  ACTIONS.map((action) => [action.name, action])
);

// ----- Side-map: human-readable label per action -----

export const labelByActionName: Record<ActionName, string> = {
  [archiveThreadAction]:      'Archive',
  [deleteThreadAction]:       'Delete',
  [spamThreadAction]:         'Mark as spam',
  [snoozeThreadAction]:       'Snooze',
  [addLabelThreadAction]:     'Apply label',
  [removeLabelThreadAction]:  'Remove label',
  [unsubscribeThreadAction]:  'Unsubscribe',
  [modifyThreadLabelsAction]: 'Modify labels…',

  [openPanelAction]:          'Open',
  [closePanelAction]:         'Close panel',
  [navPanelPrevAction]:       'Previous panel',
  [navPanelNextAction]:       'Next panel',
  [refreshPanelAction]:       'Refresh',

  [enterSelectionAction]:     'Select',
  [exitSelectionAction]:      'Exit selection',
  [toggleSelectionAction]:    'Toggle selection',

  [signInAction]:             'Sign in',
  [signOutAction]:            'Sign out',
  [undoAction]:               'Undo',
  [redoAction]:               'Redo',
  [openCommandPaletteAction]: 'Command palette',
  [exitModeAction]:           'Cancel',
};

// ----- Side-map: Cmd-K preview (context-aware string) per action -----
// Only thread-targeted actions have meaningful previews right now; layout and
// app actions are listed verbatim by their label.

export const previewByActionName: Partial<Record<ActionName, (ctx: ReadonlyContext) => string>> = {
  [archiveThreadAction]:     previewTargets('Archive'),
  [deleteThreadAction]:      previewTargets('Delete'),
  [spamThreadAction]:        previewTargets('Mark as spam'),
  [snoozeThreadAction]:      previewTargets('Snooze'),
  [addLabelThreadAction]:    previewTargets('Apply label to'),
  [removeLabelThreadAction]: previewTargets('Remove label from'),
  [unsubscribeThreadAction]: previewTargets('Unsubscribe from'),
};

// ----- Side-map: keyboard shortcut cue (display only) per action -----
// The actual binding lives in defaultBindings.ts; this is the human-readable
// hint for the Cmd-K palette. Anticipates being auto-derived from the binding
// registry once the trigger-redesign lands; static for now.

export const shortcutCueByActionName: Partial<Record<ActionName, string>> = {
  [archiveThreadAction]:      'J',
  [deleteThreadAction]:       '#',
  [spamThreadAction]:         '!',
  [snoozeThreadAction]:       'B',
  [undoAction]:               '⌘Z',
  [redoAction]:               '⌘⇧Z',
  [openCommandPaletteAction]: '⌘K',
  [exitModeAction]:           'Esc',
};

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
