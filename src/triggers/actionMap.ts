// The action map: surface → trigger → action.
//
// The resolver looks up
//   ACTION_MAP.get(event.surface)?.get(triggerName)
// to find the assigned action (if any) for a matched trigger on the event's
// surface.
//
// Surfaces are strings; triggers and actions are symbols.

import {
  archiveThreadAction,
  deleteThreadAction,
  spamThreadAction,
  snoozeThreadAction,
  enterSelectionAction,
  openPanelAction,
  closePanelAction,
  navPanelPrevAction,
  navPanelNextAction,
  openCommandPaletteAction,
  exitModeAction,
  undoAction,
  redoAction,
  type ActionName,
} from '../actions/types';
import {
  click,
  pressLong,
  swipeInlineEnd,
  swipeInlineStart,
  overscrollBlockEnd,
  keypressJ,
  keypressE,
  keypressHash,
  keypressBang,
  keypressB,
  keypressModK,
  keypressEscape,
  keypressModZ,
  keypressModShiftZ,
} from './triggers';
import type { Surface, TriggerName } from './types';

export const ACTION_MAP: Map<Surface, Map<TriggerName, ActionName>> = new Map([
  // Row swipes are handled by the swipe-intent pipeline (src/input/swipeIntents.ts), not here.
  ['row', new Map<TriggerName, ActionName>([
    [click,     openPanelAction],
    [pressLong, enterSelectionAction],
  ])],
  ['panel-header', new Map<TriggerName, ActionName>([
    [swipeInlineEnd,   navPanelNextAction],
    [swipeInlineStart, navPanelPrevAction],
  ])],
  ['panel-body', new Map<TriggerName, ActionName>([
    [overscrollBlockEnd, closePanelAction],
  ])],
  ['document', new Map<TriggerName, ActionName>([
    [keypressJ,         archiveThreadAction],
    [keypressE,         archiveThreadAction],
    [keypressHash,      deleteThreadAction],
    [keypressBang,      spamThreadAction],
    [keypressB,         snoozeThreadAction],
    [keypressModK,      openCommandPaletteAction],
    [keypressEscape,    exitModeAction],
    [keypressModZ,      undoAction],
    [keypressModShiftZ, redoAction],
  ])],
  // 'overlay' is intentionally absent: open overlays capture pointer events
  // and decide for themselves what to do (no fall-through to row/panel/etc.).
]);
