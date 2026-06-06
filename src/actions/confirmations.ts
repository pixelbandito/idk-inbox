// Confirmation lifecycles — the set of "how does the user / system have to
// acknowledge this action" policies, and the per-action mapping. Multiple
// actions can share a policy; the policy defines auth requirements and how
// destructive / reversible the action is from the UX engine's standpoint.

import type { ActionName } from './types';
import {
  archiveThreadAction,
  deleteThreadAction,
  spamThreadAction,
  snoozeThreadAction,
  addLabelThreadAction,
  removeLabelThreadAction,
  unsubscribeThreadAction,
  modifyThreadLabelsAction,
  openPanelAction,
  closePanelAction,
  navPanelPrevAction,
  navPanelNextAction,
  refreshPanelAction,
  enterSelectionAction,
  exitSelectionAction,
  toggleSelectionAction,
  signInAction,
  signOutAction,
  undoAction,
  redoAction,
  openCommandPaletteAction,
  exitModeAction,
} from './types';

// ----- Confirmation lifecycle identities -----

export const noConfirmation              = Symbol('no-confirmation');
export const requiresAuthOnly            = Symbol('requires-auth-only');
export const confirmEachDestructive      = Symbol('confirm-each-destructive');
export const irreversibleAction          = Symbol('irreversible-action');

export type ConfirmationId =
  | typeof noConfirmation
  | typeof requiresAuthOnly
  | typeof confirmEachDestructive
  | typeof irreversibleAction;

// ----- Lifecycle config -----

/**
 * The shape currently captures the *requirements* of each lifecycle.
 * UI behaviour (prompt text, autonomy ladder graduation, etc.) layers on top.
 */
export type ConfirmationConfig = {
  /** Whether the action needs the user to be signed in before it can fire. */
  requiresAuth: boolean;
  /** Whether the action mutates state in a way the user should explicitly confirm each time. */
  confirmEach: boolean;
  /** Whether the action cannot be undone via the undo stack. */
  irreversible: boolean;
};

const CONFIRMATION_REQUIREMENT_ENTRIES: Array<[ConfirmationId, ConfirmationConfig]> = [
  [noConfirmation,         { requiresAuth: false, confirmEach: false, irreversible: false }],
  [requiresAuthOnly,       { requiresAuth: true,  confirmEach: false, irreversible: false }],
  [confirmEachDestructive, { requiresAuth: true,  confirmEach: true,  irreversible: false }],
  [irreversibleAction,     { requiresAuth: true,  confirmEach: true,  irreversible: true  }],
];

export const CONFIRMATION_REQUIREMENTS: Map<ConfirmationId, ConfirmationConfig> = new Map(
  CONFIRMATION_REQUIREMENT_ENTRIES,
);

// ----- Side-map: action → confirmation lifecycle -----

export const confirmationByActionName: Record<ActionName, ConfirmationId> = {
  // Thread-targeted writes
  [archiveThreadAction]:      requiresAuthOnly,
  [snoozeThreadAction]:       requiresAuthOnly,
  [addLabelThreadAction]:     requiresAuthOnly,
  [removeLabelThreadAction]:  requiresAuthOnly,
  [modifyThreadLabelsAction]: requiresAuthOnly,
  [deleteThreadAction]:       confirmEachDestructive,
  [spamThreadAction]:         confirmEachDestructive,
  [unsubscribeThreadAction]:  irreversibleAction,

  // Layout / selection / app actions don't need confirmation.
  [openPanelAction]:          noConfirmation,
  [closePanelAction]:         noConfirmation,
  [navPanelPrevAction]:       noConfirmation,
  [navPanelNextAction]:       noConfirmation,
  [refreshPanelAction]:       noConfirmation,
  [enterSelectionAction]:     noConfirmation,
  [exitSelectionAction]:      noConfirmation,
  [toggleSelectionAction]:    noConfirmation,
  [signInAction]:             noConfirmation,
  [signOutAction]:            noConfirmation,
  [undoAction]:               noConfirmation,
  [redoAction]:               noConfirmation,
  [openCommandPaletteAction]: noConfirmation,
  [exitModeAction]:           noConfirmation,
};
