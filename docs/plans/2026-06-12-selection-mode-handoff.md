# Selection-Mode + Focused-Panel Affordances — Handoff

**Status:** Brainstorm not yet started. State model exists, UI does not, and one design gap surfaced before the conversation began.

**Why it's next:** Two of the followups items in `docs/followups.md` § UX:

- *Selection-mode indicator.* Dispatch state carries `mode: 'selecting'` and `selection: ThreadRef[]`, but nothing renders them. Every selection-scoped action (delete N, batch label, etc.) is untestable by hand without this.
- *Focused-panel indicator.* `ctx.focusedPanelIndex` is now wired (b07e5c4), but the user has no visual cue for which panel is "focused" — meaningful because focus determines what overscroll-close closes, what refresh refreshes, etc.

The two are one design conversation because they both answer "what mode / focus state am I in right now?" with visual feedback.

## What already exists

### Selection state (live; just no UI)

```ts
// src/input/types.ts
type Mode = 'idle' | 'selecting' | 'picker-snooze' | 'picker-label' | 'cmd-k';

interface ReadonlyContext {
  // …
  mode: Mode;
  selection: ThreadRef[];   // ThreadRef = Gmail threadId string
}
```

Setters and actions are wired:

- `src/actions/selection.ts` — `enterSelection`, `exitSelection`, `toggleSelection` (all working, tested).
- `src/triggers/actionMap.ts` — `row.pressLong → enterSelectionAction`.
- `src/state/DispatchProvider.tsx` — state setters, registry entries.

### Row visual state (partial)

`src/panels/ThreadlistPanel.tsx`'s `Row` already computes `isSelected` and applies `email--selected` className when the threadId is in `ctx.selection`. **But there is no CSS rule for `.email--selected`** — so the styling is a no-op visually.

### Focused-panel state (live; just no UI)

`ctx.focusedPanelIndex` and the `LayoutContainer`'s `focusIndex` track it and update on `openPanel` / `closePanel` / `navPanelPrev` / `navPanelNext`. Smooth-scroll-into-view fires on focus change (`LayoutContainer.useEffect`). No visual focus indicator beyond that scroll.

### Focused-panel state NOT wired

Manual scrolling between panels (scroll-snap CSS, no action involved) doesn't update `focusIndex`. So if the user swipes between panels via touch scroll, `focusIndex` and the actual visually-focused panel drift apart. Out of scope for this brainstorm unless we choose to fix it.

## Design gaps to resolve before any code

### 1. Multi-select interaction model (real gap)

There is no `toggleSelection` trigger anywhere in the action map. `pressLong → enterSelectionAction` *replaces* the selection with `[initialTarget]`. There's no row trigger to *add* a second item once you're in selection mode.

The trigger-system redesign intentionally dissolved predicates ("when: in-selecting-mode"). So routing "row click means open in idle mode, but means toggle in selecting mode" isn't directly expressible — you'd need one of:

- **A mode-aware action wrapper.** Single `openOrToggleAction` whose handler branches on `ctx.mode`. Pros: keeps the trigger map clean. Cons: smuggles predicate-logic into action handlers.
- **Per-mode action maps.** `ACTION_MAP` becomes `Map<Mode, Map<Surface, Map<TriggerName, ActionName>>>`. Pros: explicit, follows the existing pattern. Cons: combinatorial expansion; most cells empty.
- **Overlay surfaces approach (the design's intent).** Mount a transparent "selection-mode" overlay that re-intercepts row events and re-routes them. Pros: mirrors how pickers work. Cons: invisible overlay catching events is spooky; tricky for nested-row layout.
- **Resolve at the producer level.** Producers consult mode and emit different events (`row-click` vs `row-click-selecting`). Pros: explicit triggers. Cons: producers gain mode awareness, blurring the layer.

This needs to be decided before drawing any pixels.

### 2. Entering selection mode — gesture model

Today: long-press one row = enter selecting with that row as the only selected. Open questions:

- Does long-press always pre-select the row, or sometimes "enter selecting with empty selection"?
- Can you long-press a *second* row while already selecting, or does that no-op?
- Selecting a single thread and tapping the same thread to deselect — does that exit selection mode, or stay in it with empty selection?

### 3. Exiting selection mode

Today: `exitSelection` action exists (sets mode to idle, clears selection). Triggers that fire it:

- `keypressEscape → exitModeAction` (which presumably routes through to exit anything modal — verify in `src/actions/app.ts`).
- No explicit row trigger.

UI question: does the indicator have its own "done" button? A tap-outside-rows-to-exit affordance?

### 4. Batch action affordance

While selecting, the user needs a way to *do something* with the selection (delete N, snooze N, label N). Options:

- **Per-row triggers stay live** (swipe-end-edge → delete still works, just acts on the whole selection because `argsFor` already prefers `ctx.selection` when non-empty). Pro: zero new affordance. Con: less discoverable.
- **Floating action bar** at the bottom/top with verbs (Archive 3, Delete 3, …). Pro: visible, classic. Con: takes vertical space, mobile-fragile.
- **Header morphs** to selection-mode toolbar. Pro: discoverable, no extra real estate. Con: more rendering complexity in PanelHeader.
- **Cmd-K** as the only batch path. Pro: already works (palette uses `ctx.selection`). Con: not visible to new users.

### 5. Focused-panel indicator — separate or combined?

The two affordances overlap (both signal "current state") but operate on different axes (panels vs. rows). Visual treatment options:

- **Same visual language** (e.g., a subtle border / shadow on the focused panel AND on selected rows).
- **Different languages** (panel uses a header tint; rows use a checkmark / highlight).
- **Skip focused-panel for now,** ship selection only, revisit if the focus invisibility becomes a felt problem in real use.

## Owner preferences to honor (from prior brainstorms)

- **Prose over multiple-choice for design questions.** [[prefers-prose-for-conceptual-brainstorming]] in memory.
- **One question at a time.** Don't pile them up.
- **Plain language, no jargon.** Avoid "binding" / "predicate."
- **Symbols not strings; identity-only `Action` shape; CSS-logical axes.** (Active from trigger redesign.)
- **High control over markup + CSS** — owner wants newest elegant patterns; defer until explicit direction. So: brainstorm the *interaction model* first, only sketch implementation once that's settled.

## Pointers

- `src/input/types.ts` — `Mode`, `ReadonlyContext`, `ThreadRef`.
- `src/actions/selection.ts` — the three selection actions.
- `src/triggers/actionMap.ts` — current trigger → action wiring under `row`.
- `src/panels/ThreadlistPanel.tsx:14-31` — `Row` component; already applies `email--selected` className.
- `src/state/DispatchProvider.tsx:139-154` — ctx derivation; `mode` and `selection` are live here.
- `src/actions/app.ts` — `exitMode` action; check what it does in selecting mode.
- `docs/followups.md` § UX — the items this brainstorm is addressing.

## Recommended next-session starter

> Read `docs/plans/2026-06-12-selection-mode-handoff.md`, then let's brainstorm
> the selection-mode + focused-panel affordances. Start with the multi-select
> interaction model (design gap #1 in the doc) — that decision constrains
> everything downstream.
