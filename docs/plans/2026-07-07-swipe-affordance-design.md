# Swipe Affordance — Design

**Date:** 2026-07-07
**Status:** Validated design, ready for implementation planning

## Summary

Replace the current fire-on-release row swipes with a live, distance-tiered
drag affordance in the style of Clear / Mailbox / Google Inbox: the row tile
follows your finger, a colored layer with an icon is revealed behind it, and
the color/icon change as you pull further, so the row itself tells you what
releasing will do. Row swipes become **data**: two small tables define what
each swipe does and how it looks, so adding, recoloring, retuning, or (later)
letting a user remap them is editing a table, not touching the gesture engine.

## Interaction model

Rows only. Other surfaces (panel-header swipes, keyboard, overscroll, click,
long-press) are unchanged.

Dragging a row horizontally has three zones per direction, measured as a
fraction of the row's inline size (so it feels the same on any screen):

| Pull distance | State | Right (inline-end) | Left (inline-start) |
|---|---|---|---|
| 0 → 25% | neutral | — springs back | — springs back |
| 25% → 70% | tier 1 armed | **Archive** (safe/green) | **Snooze** (info/amber) |
| past 70% | tier 2 armed | **Delete** (danger/red) | **Label** (warn/blue) |

- **Release** past a tier commits that tier's action; the tile animates off
  that way and the action fires. Release under 25% springs the tile back and
  nothing happens.
- **Haptics**: a short `navigator.vibrate` tick fires each time the armed tier
  changes — up *or* down — so the tiers are felt, not just seen. No-ops where
  the API is absent (desktop).
- **Pickers vs immediate**: snooze and label carry `elicitVia`, so releasing
  those opens their existing chooser (cancelable). Archive and delete fire
  immediately; the undo toast is the safety net (no modal confirm, by
  decision — the long pull is the deliberateness).

Thresholds (25% / 70%) live as named constants in one module so tuning is a
one-line change; they can become per-surface config later without rework.

## Architecture

### Two declarative tables — the source of truth

`src/input/swipeIntents.ts` holds everything about row swipes:

```ts
// How each triage action presents — keyed by the ACTION, not the slot, so a
// remapped action keeps its color/icon wherever it lands.
export const ACTION_PRESENTATION: Record<ActionId, ActionPresentation> = {
  'archive-thread':   { tone: 'safe',   icon: 'archive', label: 'Archive' },
  'delete-thread':    { tone: 'danger', icon: 'trash',   label: 'Delete' },
  'snooze-thread':    { tone: 'info',   icon: 'clock',   label: 'Snooze' },
  'add-label-thread': { tone: 'warn',   icon: 'tag',     label: 'Label' },
};

// Which action sits in which swipe slot — the overridable part. Ordered
// thresholds per direction; the resolver picks the furthest one armed.
export const ROW_SWIPE_BINDINGS: SwipeBinding[] = [
  { direction: 'end',   armAtFraction: 0.25, action: 'archive-thread' },
  { direction: 'end',   armAtFraction: 0.70, action: 'delete-thread' },
  { direction: 'start', armAtFraction: 0.25, action: 'snooze-thread' },
  { direction: 'start', armAtFraction: 0.70, action: 'add-label-thread' },
];

export interface SwipeBinding {
  direction: 'start' | 'end';   // CSS-logical → RTL-safe
  armAtFraction: number;
  action: ActionId;
  /** Pre-fill an elicitable arg to skip the picker, e.g. { label: '…' }. */
  args?: Record<string, unknown>;
}
```

One pure resolver reads it:

```ts
resolveSwipeIntent(direction, fraction, bindings?): ResolvedIntent | null
// → { binding, presentation } for the furthest-armed tier, or null under tier 1.
```

**Both the live reveal and the commit call `resolveSwipeIntent`.** The reveal
asks "what would release do right now?" every drag frame; the commit asks the
same at release. They cannot drift because they share the function.

`bindings` defaults to `ROW_SWIPE_BINDINGS` but is a parameter, so a future
settings screen persists a user override and passes it in — the only wiring a
config feature needs.

### Gesture plumbing

`src/input/useGesture.ts` gains one callback: `onDrag(dx, dy)`, fired on every
pointer-move during an active drag. Everything else (`onSwipe` at release,
`onClick`, `onLongPress`, pointer capture, long-press cancel) is untouched.

`src/input/useRowSwipe.ts` (new) wraps `useGesture` for rows:

- **On `onDrag`**: compute CSS-logical direction + inline fraction (reusing the
  geometry helpers already in `producers/fromGesture.ts`, extracted to a pure
  `swipeGeometry` module so both share it). Resolve the intent. Update visuals
  *imperatively* — set a `--drag-x` custom property and a `data-armed-tone`
  attribute on the row — so we don't re-render per frame. Fire a haptic when
  the resolved intent's identity changes.
- **On release**: resolve the intent from the final fraction. If non-null,
  build args (selection-or-row via the shared `input/helpers.ts` target
  functions — no duplication) merged with the binding's `args`, and dispatch
  the action through the normal dispatcher (so `elicitVia` pickers, undo, and
  refresh all work as they do today). If null, spring back.

### What changes in the existing pipeline

- `triggers/actionMap.ts`: the four `row` swipe rows are **removed**, leaving
  `click → open-panel` and `pressLong → enter-selection`. A one-line comment
  points to `swipeIntents.ts` as the home of row swipes.
- `triggers/triggers.ts`: the now-unused `swipeInlineEndEdge` /
  `swipeInlineStartEdge` triggers are deleted. `swipeInlineEnd` /
  `swipeInlineStart` stay (panel-header nav still uses them).
- `panels/ThreadlistPanel.tsx`: the `Row` uses `useRowSwipe` instead of
  `useGestureProducer`.

Non-row surfaces keep the generic producer → trigger → action-map path
verbatim. Discoverability: "what does swiping a row do?" → `swipeIntents.ts`
(one table); "what does swiping the header / a key do?" → `actionMap.ts`.

## Visual structure

Each row is a track with a sliding tile over a reveal layer:

```html
<li class="email" data-thread-id="…" data-surface="row">
  <div class="email__reveal" aria-hidden="true"><Icon/></div>  <!-- behind -->
  <div class="email__tile">…from / subject / snippet…</div>     <!-- slides -->
</li>
```

- The tile is `translateX(var(--drag-x, 0))`. The reveal fills the track; the
  icon is pinned to the edge you pull *from* (drag inline-end → icon at the
  inline-start edge), revealed as the tile moves away.
- `tone` maps to theme custom properties (`--tone-safe`, `--tone-danger`,
  `--tone-info`, `--tone-warn` in `theme.css`, defined for light and dark), so
  the reveal's `background` is `var(--tone-…)` selected by `data-armed-tone`.
- Commit animates `--drag-x` to ±100% then the list refetch drops the row.
  Spring-back is a `transition` on `--drag-x` back to 0.

Icons: a small inline-SVG set in `src/ui/icons.tsx` — `archive`, `trash`,
`clock`, `tag` — icon-only (no labels; color carries the meaning). Icons keyed
by `IconName` so `ACTION_PRESENTATION` references them by name.

## Testing

- **`resolveSwipeIntent`** (pure): table-driven — each fraction/direction maps
  to the expected action; boundaries at 0.25 / 0.70; null under tier 1; both
  directions; RTL via CSS-logical direction.
- **`useGesture` `onDrag`**: extend the existing synthetic-pointer gesture
  tests to assert `onDrag` fires during move with correct deltas and does not
  fire for a plain click.
- **`useRowSwipe` commit**: synthetic drag to tier-1-end dispatches
  `archive-thread`; tier-2-end dispatches `delete-thread`; under-threshold
  dispatches nothing; a binding with `args.label` dispatches with the label
  pre-filled (and thus no picker). Targets come from selection when present,
  else the swiped row.
- **Tier-change detection** (haptics): pure function "did the armed intent
  change between frames?" tested directly; the `navigator.vibrate` call is
  guarded and mocked.

Imperative DOM transforms and real layout aren't unit-tested (jsdom has no
layout); the pure resolver + commit dispatch + geometry carry the logic.

## Out of scope (deliberate)

- The settings UI for user remapping — the data shape is ready; the screen is
  later.
- Vertical swipe gestures on rows.
- HTML mail rendering (tracked separately).
