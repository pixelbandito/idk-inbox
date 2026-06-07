// Action identities and the structural types that depend on them.
// The data (ACTIONS array, label side-map, etc.) lives in ./catalog.ts.

// ----- Action identities (symbols) -----

// Thread-targeted
export const archiveThreadAction      = Symbol('archive-thread');
export const deleteThreadAction       = Symbol('delete-thread');
export const spamThreadAction         = Symbol('spam-thread');
export const snoozeThreadAction       = Symbol('snooze-thread');
export const addLabelThreadAction     = Symbol('add-label-thread');
export const removeLabelThreadAction  = Symbol('remove-label-thread');
export const unsubscribeThreadAction  = Symbol('unsubscribe-thread');
export const modifyThreadLabelsAction = Symbol('modify-thread-labels');

// Layout
export const openPanelAction      = Symbol('open-panel');
export const closePanelAction     = Symbol('close-panel');
export const navPanelPrevAction   = Symbol('nav-panel-prev');
export const navPanelNextAction   = Symbol('nav-panel-next');
export const refreshPanelAction   = Symbol('refresh-panel');

// Selection
export const enterSelectionAction  = Symbol('enter-selection');
export const exitSelectionAction   = Symbol('exit-selection');
export const toggleSelectionAction = Symbol('toggle-selection');

// App
export const signInAction             = Symbol('sign-in');
export const signOutAction            = Symbol('sign-out');
export const undoAction               = Symbol('undo');
export const redoAction               = Symbol('redo');
export const openCommandPaletteAction = Symbol('open-command-palette');
export const exitModeAction           = Symbol('exit-mode');

export type ActionName =
  | typeof archiveThreadAction
  | typeof deleteThreadAction
  | typeof spamThreadAction
  | typeof snoozeThreadAction
  | typeof addLabelThreadAction
  | typeof removeLabelThreadAction
  | typeof unsubscribeThreadAction
  | typeof modifyThreadLabelsAction
  | typeof openPanelAction
  | typeof closePanelAction
  | typeof navPanelPrevAction
  | typeof navPanelNextAction
  | typeof refreshPanelAction
  | typeof enterSelectionAction
  | typeof exitSelectionAction
  | typeof toggleSelectionAction
  | typeof signInAction
  | typeof signOutAction
  | typeof undoAction
  | typeof redoAction
  | typeof openCommandPaletteAction
  | typeof exitModeAction;

// ----- Model identities -----

export const threadModel = Symbol('thread');
export type ModelName = typeof threadModel;

// ----- Action shape (identity only — labels/handlers/confirmation live in side-maps) -----

export type Action = {
  name: ActionName;
  modelName?: ModelName;
};
