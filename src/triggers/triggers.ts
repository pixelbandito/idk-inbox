// Canonical trigger registry.
//
// Each Trigger is a symbol-named record with an explicit numeric priority and
// a pure match() over AbstractEvent. Surface filtering is NOT done here — the
// resolver routes events through the action map's surface dimension.
//
// Priority bands (with gaps so future insertions don't churn):
//   - Edge-qualified swipes:  10
//   - Bulk swipes:             5
//   - Long-press:              5
//   - Overscroll:              5
//   - Keypress:                5  (a combo can only match one event anyway)
//   - Click:                   1  (lowest — most ambiguous gesture)

import { beyond, within } from './helpers';
import type { Trigger, TriggerName } from './types';

// ----- Trigger identities (symbols) -----

export const click                = Symbol('click');
export const pressLong            = Symbol('pressLong');

export const swipeInlineEnd       = Symbol('swipeInlineEnd');
export const swipeInlineEndEdge   = Symbol('swipeInlineEndEdge');
export const swipeInlineStart     = Symbol('swipeInlineStart');
export const swipeInlineStartEdge = Symbol('swipeInlineStartEdge');

// Reserved — no current action assignment, but defined so the producer can
// publish block-axis swipes without losing data.
export const swipeBlockEnd        = Symbol('swipeBlockEnd');
export const swipeBlockStart      = Symbol('swipeBlockStart');

export const overscrollBlockEnd   = Symbol('overscrollBlockEnd');

export const keypressJ            = Symbol('keypressJ');
export const keypressE            = Symbol('keypressE');
export const keypressHash         = Symbol('keypressHash');
export const keypressBang         = Symbol('keypressBang');
export const keypressB            = Symbol('keypressB');
export const keypressModK         = Symbol('keypressModK');
export const keypressEscape       = Symbol('keypressEscape');
export const keypressModZ         = Symbol('keypressModZ');
export const keypressModShiftZ    = Symbol('keypressModShiftZ');

// ----- Threshold constants -----

const BULK_SWIPE = { fraction: 0.20, minPx: 60 };   // "went far enough"
const EDGE_SWIPE = { fraction: 0.50, minPx: 240 };  // "went almost all the way"
const NEAR_EDGE  = { fraction: 0.05, minPx: 48 };   // "released right at the edge"
const OVERSCROLL = { fraction: 0.10, minPx: 40 };

// ----- Helpers for keyboard matchers -----

const keyMatcher = (combo: string) => (e: { kind: string; combo?: string }) =>
  e.kind === 'keypress' && e.combo === combo;

// ----- The registry -----

export const TRIGGERS: Trigger[] = [
  {
    name: click,
    priority: 1,
    match: (e) => e.kind === 'gesture-click',
  },
  {
    name: pressLong,
    priority: 5,
    match: (e) => e.kind === 'gesture-long-press',
  },

  {
    name: swipeInlineEnd,
    priority: 5,
    match: (e) =>
      e.kind === 'gesture-swipe'
      && e.axis === 'inline' && e.towards === 'end'
      && beyond(e.distance, BULK_SWIPE),
  },
  {
    name: swipeInlineEndEdge,
    priority: 10,
    match: (e) =>
      e.kind === 'gesture-swipe'
      && e.axis === 'inline' && e.towards === 'end'
      && beyond(e.distance,        EDGE_SWIPE)
      && within(e.endEdgeDistance, NEAR_EDGE),
  },
  {
    name: swipeInlineStart,
    priority: 5,
    match: (e) =>
      e.kind === 'gesture-swipe'
      && e.axis === 'inline' && e.towards === 'start'
      && beyond(e.distance, BULK_SWIPE),
  },
  {
    name: swipeInlineStartEdge,
    priority: 10,
    match: (e) =>
      e.kind === 'gesture-swipe'
      && e.axis === 'inline' && e.towards === 'start'
      && beyond(e.distance,          EDGE_SWIPE)
      && within(e.startEdgeDistance, NEAR_EDGE),
  },

  {
    name: swipeBlockEnd,
    priority: 5,
    match: (e) =>
      e.kind === 'gesture-swipe'
      && e.axis === 'block' && e.towards === 'end'
      && beyond(e.distance, BULK_SWIPE),
  },
  {
    name: swipeBlockStart,
    priority: 5,
    match: (e) =>
      e.kind === 'gesture-swipe'
      && e.axis === 'block' && e.towards === 'start'
      && beyond(e.distance, BULK_SWIPE),
  },

  {
    name: overscrollBlockEnd,
    priority: 5,
    match: (e) =>
      e.kind === 'gesture-overscroll'
      && e.edge === 'block-end'
      && beyond(e.distance, OVERSCROLL),
  },

  { name: keypressJ,         priority: 5, match: keyMatcher('j') },
  { name: keypressE,         priority: 5, match: keyMatcher('e') },
  { name: keypressHash,      priority: 5, match: keyMatcher('#') },
  { name: keypressBang,      priority: 5, match: keyMatcher('!') },
  { name: keypressB,         priority: 5, match: keyMatcher('b') },
  { name: keypressModK,      priority: 5, match: keyMatcher('mod+k') },
  { name: keypressEscape,    priority: 5, match: keyMatcher('escape') },
  { name: keypressModZ,      priority: 5, match: keyMatcher('mod+z') },
  { name: keypressModShiftZ, priority: 5, match: keyMatcher('mod+shift+z') },
];

export const TRIGGER_BY_NAME: Map<TriggerName, Trigger> = new Map(
  TRIGGERS.map((t) => [t.name, t]),
);
