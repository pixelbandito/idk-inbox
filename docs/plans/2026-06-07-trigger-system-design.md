# Trigger System Redesign — Design

**Date:** 2026-06-07
**Status:** Validated through brainstorm; ready for implementation planning.
**Branch:** `event-system` (long-lived feature branch).
**Builds on:**
- Phase 0c Part 1 — stubbed input model (merged to `event-system`).
- Action-shape decomposition committed `df7d0db` (types split).
- Side maps committed `5d75d9e` (labels / previews / shortcut-cues / confirmations).

## Why this exists

The Phase 0c Part 1 input model worked but the project owner pushed back on it during Checkpoint 2 — too much configuration baked into the action shape (label, preview, shortcut, destructive, requiresAuth, elicitVia, when, handler all in one record). The fix has two parts:

1. **Action shape becomes identity-only** (`{ name: symbol; modelName?: symbol }`) with everything else moved to per-concern side-maps. *Done in `5d75d9e` and `df7d0db`.*
2. **Bindings get rewritten** from a flat `Binding[]` array (one record per trigger, repeating `scope` and `action` per row) into an action-centric, surface-keyed map plus a separate trigger registry. *This document specifies it; implementation pending.*

This document specifies the binding rewrite.

## The user-facing model (vocabulary)

Three concepts, three layers:

- **Action** — definition of the thing that happens. Symbol-named. Identity-only (see above).
- **Trigger** — definition that translates one or more lower-level system events into a single named gesture/keypress/etc. that an action can be assigned to. Examples: `swipeInlineEnd`, `swipeInlineEndEdge`, `pressLong`, `keypressJ`.
- **Surface** — *where* on the screen a gesture happens (`row`, `panel-header`, `panel-body`, `document`, `overlay`).

We do **not** use the words "binding" or "predicate" in the new vocabulary. Bindings dissolve into the action map; predicates dissolve into surface routing + confirmation policy.

## The shape

```
{
  surface1: { trigger1: actionA, trigger2: actionB, … },
  surface2: { trigger1: actionC, … },
  …
}
```

Concrete sketch:

```ts
const ACTION_MAP: Map<Surface, Map<TriggerName, ActionName>> = new Map([
  ['row', new Map([
    [click,                  openPanelAction],
    [swipeInlineEnd,         archiveThreadAction],
    [swipeInlineEndEdge,     deleteThreadAction],
    [swipeInlineStart,       snoozeThreadAction],
    [swipeInlineStartEdge,   addLabelThreadAction],
    [pressLong,              enterSelectionAction],
  ])],
  ['panel-header', new Map([
    [swipeInlineEnd,         navPanelNextAction],
    [swipeInlineStart,       navPanelPrevAction],
  ])],
  ['panel-body', new Map([
    [overscrollBlockEnd,     closePanelAction],
  ])],
  ['document', new Map([
    [keypressJ,              archiveThreadAction],
    [keypressE,              archiveThreadAction],
    [keypressHash,           deleteThreadAction],
    [keypressBang,           spamThreadAction],
    [keypressB,              snoozeThreadAction],
    [keypressModK,           openCommandPaletteAction],
    [keypressEscape,         exitModeAction],
    [keypressModZ,           undoAction],
    [keypressModShiftZ,      redoAction],
  ])],
]);
```

(Surfaces are strings; triggers are symbols; actions are symbols. `ActionName` and the action symbols already exist in `src/actions/types.ts`.)

## The trigger registry

Each trigger is a small record:

```ts
type Trigger = {
  name:     TriggerName;        // symbol identity
  priority: number;             // higher wins when multiple match the same event
  match:    (event: AbstractEvent) => boolean;
};
```

There's no `scope` / `surface` field on the trigger itself — surface filtering happens in the resolver (event's surface is looked up in the action map).

`priority` is **explicit numeric**, with gaps of 5 or 10 between sibling triggers so insertions don't churn the rest. Single-fire per event (top-priority viable trigger wins, others are skipped). Same-priority collision = definition-order winner + `console.warn` in dev.

Triggers stay pure — `match` reads structured `AbstractEvent` data; it never walks the DOM.

## Abstract event shape

The producer (the layer above `useGesture` / `useDocumentKeyboard`) translates raw pointer/keyboard events into `AbstractEvent`s and publishes them onto a single bus. Triggers/the resolver consume from the bus.

```ts
type Surface = 'row' | 'panel-header' | 'panel-body' | 'document' | 'overlay';

type Distance = { fraction: number; pixels: number };

type AbstractEvent =
  | { kind: 'gesture-click';
      surface: Surface; target: Element | null }
  | { kind: 'gesture-long-press';
      surface: Surface; target: Element | null; dt: number }
  | { kind: 'gesture-swipe';
      surface: Surface; target: Element | null;
      axis:    'inline' | 'block';
      towards: 'start' | 'end';
      distance:          Distance;   // along the axis
      startEdgeDistance: Distance;   // from the start edge at pointerdown
      endEdgeDistance:   Distance;   // from the end edge at pointerup
      dt: number }
  | { kind: 'gesture-overscroll';
      surface: Surface; edge: 'block-start' | 'block-end';
      distance: Distance }
  | { kind: 'keypress';
      surface: Surface; combo: string };       // surface = 'document' by convention
```

Key properties of this shape:

- **CSS-logical axes.** Producer reads `getComputedStyle(html).direction` once and translates client-X/Y into `inline`/`block` and `start`/`end`. Triggers stay direction-agnostic (RTL works for free).
- **No overshoot.** `distance.fraction` caps at 1.0.
- **Surface element-relative normalisation.** `fraction = pixels / surfaceSize`. The surface element is the closest ancestor carrying `data-surface=…`. For `document`, the viewport. For a scrollable `panel-body`, the *scroll container's* visible height — not the content height.
- **Edge fields are dual** (`startEdgeDistance`, `endEdgeDistance`) to support "peek" gestures (start near the start edge) and "edge" gestures (release near the end edge) symmetrically.
- **Carry both fraction and pixels.** Triggers need both to express accessibility-aware thresholds — see helpers below.

## The threshold helpers

Surface-relative fractions become tiny on small surfaces (5% of a 48px row = 2.5px, well below WCAG's hit-target floor). Triggers want both a fractional and an absolute floor in one expression. Two helpers cover every pattern we've thought of:

```ts
type Threshold = { fraction: number; minPx: number };

/** "ended close to / started near" — within the LARGER of fraction-or-px. */
function within(d: Distance, t: Threshold): boolean {
  return d.fraction <= t.fraction || d.pixels <= t.minPx;
}

/** "went far enough" — beyond BOTH the fraction AND the px floor. */
function beyond(d: Distance, t: Threshold): boolean {
  return d.fraction >= t.fraction && d.pixels >= t.minPx;
}
```

The asymmetry mirrors intent: `within` is forgiving (either condition suffices — easier to satisfy when "near the edge" matters); `beyond` is strict (both must hold — avoids false positives when "went far enough" matters).

Example triggers:

```ts
const swipeInlineEnd = Symbol('swipeInlineEnd');
const swipeInlineEndEdge = Symbol('swipeInlineEndEdge');

const TRIGGERS: Trigger[] = [
  { name: swipeInlineEnd, priority: 5,
    match: (e) => e.kind === 'gesture-swipe'
                && e.axis === 'inline' && e.towards === 'end'
                && beyond(e.distance, { fraction: 0.20, minPx: 60 }) },

  { name: swipeInlineEndEdge, priority: 10,
    match: (e) => e.kind === 'gesture-swipe'
                && e.axis === 'inline' && e.towards === 'end'
                && beyond(e.distance,        { fraction: 0.50, minPx: 240 })
                && within(e.endEdgeDistance, { fraction: 0.05, minPx: 48  }) },
  // …
];
```

A 300px-to-the-edge swipe matches both. Both have an action assigned (archive and delete respectively, both in `row` surface) → `swipeInlineEndEdge` wins by priority → `delete-thread` fires.

A 150px swipe matches only `swipeInlineEnd` → archive fires.

## Surface as a first-class field

Every `AbstractEvent` carries `surface`. The producer determines it once:

1. Walk up the DOM from `event.target` looking for an element with `data-surface="…"`.
2. Set `event.surface = thatElement.dataset.surface` (or `'document'` if no ancestor has it).
3. Retarget `event.target = thatElement` (so trigger code sees the surface element, not whatever nested span the user happened to land on).

DOM tagging is minimal:

```tsx
<li     data-surface="row" data-thread-id={…}>…
<header data-surface="panel-header">…
<div    data-surface="panel-body">…
// Overlay surfaces (pickers, palette, toast) get data-surface="overlay"
// so they intercept gestures when open.
// document scope is the default fallback.
```

The `overlay` surface is the structural replacement for the old `mode-idle` / `mode-picker-snooze` predicates: when an overlay is mounted, it covers the page (fixed position, full viewport). Pointer events hit it first. Whatever's mapped under `overlay` in the action map runs; row/panel-header gestures simply don't see the event. No predicate gating needed.

## Why predicates disappear

Today's `when` clauses handled three different concerns:

- **Surface gating** (`in-threadlist-panel`, `in-thread-panel`) — replaced by routing the event through its surface in the action map. The action map under `panel-header` simply has different entries than under `row`.
- **Mode gating** (`mode-idle`, `not-in-picker`) — replaced by overlay surfaces. When the picker is open it captures events; the row never sees them.
- **Auth gating** (`signed-in`) — replaced by the confirmation lifecycle map (`confirmationByActionName` → `requiresAuth` flag in `CONFIRMATION_REQUIREMENTS`). The dispatcher checks the policy before invoking the action handler.

So there's no separate "predicates" layer in the trigger system at all.

## Resolver algorithm

Single function — pure, no side-effects except calling the injected dispatch:

```ts
function resolveAndFire(
  event:    AbstractEvent,
  ctx:      ReadonlyContext,
  dispatch: (req: DispatchRequest) => Promise<ActionResult>,
  map:      Map<Surface, Map<TriggerName, ActionName>>,
  triggers: Trigger[],
): Promise<ActionResult | null> {
  // 1. Find triggers whose match() returns true for this event.
  const matched = triggers.filter((t) => t.match(event));

  // 2. For each matched trigger, check if the event's surface has it assigned.
  const candidates = matched
    .map((t) => ({ trigger: t, action: map.get(event.surface)?.get(t.name) }))
    .filter((c) => c.action !== undefined);

  if (candidates.length === 0) return Promise.resolve(null);

  // 3. Sort by priority desc; warn on collisions.
  candidates.sort((a, b) => b.trigger.priority - a.trigger.priority);
  if (candidates.length > 1 && candidates[0].trigger.priority === candidates[1].trigger.priority) {
    console.warn('[triggers] priority collision', candidates.slice(0, 2));
  }

  // 4. Fire the top one. (Auth gate is in the dispatcher, sourced from confirmations.)
  const winner = candidates[0];
  return dispatch({ action: winner.action!, args: argsFor(winner, event, ctx), context: ctx });
}
```

`argsFor` is a small per-action-or-per-trigger arg-resolution function (analogous to today's `resolveArgs` in `fireBinding`): for thread-targeted actions, derive `targets: ThreadRef[]` from event.target (or context selection); for layout actions, no args; etc.

## What this replaces

- `src/input/defaultBindings.ts` → deleted (replaced by the action map + trigger registry).
- `src/input/fireBinding.ts` → deleted (replaced by the resolver).
- `src/input/useGestureBindings.ts` → deleted (subsumed by the producer + resolver).
- `src/input/predicates.ts` → drastically shrunk or deleted. The remaining auth predicate moves into confirmation policy lookup in the dispatcher.

## What stays

- `src/input/useGesture.ts` — the pointer-event detection primitive. Continues to detect click/long-press/swipe/overscroll on a given ref. The new producer wraps it, computes `Distance` and surface, and emits `AbstractEvent`s.
- `src/input/useDocumentKeyboard.ts` — kept; same role wrapped by the keyboard producer.
- `src/state/DispatchProvider.tsx` — kept; dispatcher and registry. Confirmation auth-gating moves into the wrapping dispatcher (consult `confirmationByActionName` + `CONFIRMATION_REQUIREMENTS.get(id).requiresAuth`).
- All four pickers / palette / toast components — kept; they're consumers of the dispatcher and unaffected.

## Open items / explicitly not decided

- **Exact trigger names** beyond the obvious ones above. (Naming convention is `<verb><Axis><Towards>[Edge|FromStartEdge|FromEndEdge]` for swipes; `keypress<Combo>` for keyboard.)
- **Block-axis swipes** are part of the model but not wired into any current binding. Reserved.
- **Multi-touch / pinch / two-finger gestures** are not in scope for this redesign.
- **The `argsFor` function** — the design says "analogous to today's `resolveArgs`" but the exact factoring (per-action callbacks vs. one switch on action category) is an implementation detail.
- **Whether to publish a single event bus or have producers hand events directly to the resolver hook.** Implementation detail; either works.

## Recovery hint for future-Claude

If this conversation context is lost, the relevant artifacts on disk are:

- This document — captures the design.
- `docs/plans/2026-06-07-trigger-system-plan.md` — the bite-sized implementation plan.
- `src/actions/types.ts`, `src/actions/catalog.ts`, `src/actions/confirmations.ts` — the action-shape work that's already landed. The trigger redesign builds on these.
- The legacy code being replaced: `src/input/defaultBindings.ts`, `src/input/fireBinding.ts`, `src/input/useGestureBindings.ts`, `src/input/predicates.ts`.

The project owner's preferences this conversation surfaced (worth honoring in future work):

- **Plain language, no jargon.** Avoid the terms *binding* and *predicate*. Use *action*, *trigger*, *surface*.
- **Identity-only data shapes; metadata in side-maps.** Don't bloat the core `Action` record; add fields by adding side-maps.
- **Symbols, not strings, for in-memory IDs.** No JSON serialisation needed for bindings — runtime memory only.
- **CSS-logical axes** wherever it works.
- **One question at a time** in brainstorms, simple language, prose over multiple-choice for architecture exploration.
