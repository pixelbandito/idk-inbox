# Trigger System Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (or superpowers:subagent-driven-development) to implement this plan task-by-task.

**Goal:** Replace today's flat `Binding[]` array + `fireBinding` glue with an action-centric, surface-keyed action map plus a pure trigger registry and event resolver. Old pipeline stays running until the very last step.

**Design doc:** `docs/plans/2026-06-07-trigger-system-design.md` — read it first.

**Branch:** `event-system` (long-lived feature branch).

**Builds on:**
- Action-shape decomposition committed `df7d0db` (types split into `src/actions/types.ts`).
- Side maps committed `5d75d9e` (labels, previews, shortcut-cues, confirmations).

---

## Conventions

- **TDD where the skill applies.** Pure functions (helpers, resolver, match functions): failing test first. UI integration: manual verification on the dev server.
- **One commit per task** with conventional prefixes (`feat:`, `refactor:`, `chore:`, `test:`).
- **Every commit ends with this trailer:**
  ```
  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  ```
- **Working directory:** project root `/Users/pixelbandito/Code/email`. The trigger system work is on `event-system` directly (no separate worktree — this is iterative within an active feature branch).
- **Node 22.13+ required.** Prepend `export PATH="/Users/pixelbandito/.nvm/versions/node/v22.13.0/bin:$PATH" && ` to every npm command.
- **Baseline at start:** 332 tests passing, build + lint clean.

## Vocabulary reminder

- **Action** — the thing that happens (symbol-named, identity-only).
- **Trigger** — the named gesture/keypress an action is assigned to.
- **Surface** — *where* on the screen the gesture happens (`row`, `panel-header`, `panel-body`, `document`, `overlay`).

Do **not** use "binding" or "predicate" in new code or commit messages.

## Step overview

| Step | What lands | Risk | User-visible? |
|---|---|---|---|
| 1 | Trigger types, helpers, registry, action map, resolver — all new files, no consumers | None | No |
| 2 | Producers (gesture + keyboard) parallel to existing hooks; `data-surface` attrs added; events published into bus | None — old path still runs | No |
| 3 | **Canary** — migrate row `click → open-panel` to the new pipeline; verify end-to-end | Low — one trigger, easy to revert | Yes |
| 4 | Migrate remaining bindings in batches (row gestures, panel-header swipes, document keyboard, overscroll) | Medium per batch | Yes |
| 5 | Delete the old (`defaultBindings.ts`, `fireBinding.ts`, `useGestureBindings.ts`, shrink `predicates.ts`) | None — code removal only | No |

Estimated commits: ~10–12 total. Each is independently shippable.

---

# Step 1 — New infrastructure, no consumers

## Task 1: AbstractEvent + Distance + Surface types

**Files:**
- Create: `src/triggers/types.ts`

**Content** (copy verbatim — design-doc reflected):

```ts
export type Surface = 'row' | 'panel-header' | 'panel-body' | 'document' | 'overlay';

export type Distance = { fraction: number; pixels: number };

export type TriggerName = symbol;

export type AbstractEvent =
  | { kind: 'gesture-click';
      surface: Surface; target: Element | null }
  | { kind: 'gesture-long-press';
      surface: Surface; target: Element | null; dt: number }
  | { kind: 'gesture-swipe';
      surface: Surface; target: Element | null;
      axis: 'inline' | 'block';
      towards: 'start' | 'end';
      distance:          Distance;
      startEdgeDistance: Distance;
      endEdgeDistance:   Distance;
      dt: number }
  | { kind: 'gesture-overscroll';
      surface: Surface; edge: 'block-start' | 'block-end';
      distance: Distance }
  | { kind: 'keypress';
      surface: Surface; combo: string };

export type Trigger = {
  name:     TriggerName;
  priority: number;
  match:    (event: AbstractEvent) => boolean;
};
```

Verify: `npm run build` clean, `npm run lint` clean.
Commit: `feat: trigger system — AbstractEvent + Distance + Trigger types`.

## Task 2: within / beyond helpers (TDD)

**Files:**
- Create: `src/triggers/helpers.ts`, `src/triggers/helpers.test.ts`

**Failing test first:**

```ts
import { describe, it, expect } from 'vitest';
import { within, beyond } from './helpers';

describe('within', () => {
  it('passes when fraction is at or below threshold', () => {
    expect(within({ fraction: 0.05, pixels: 100 }, { fraction: 0.05, minPx: 48 })).toBe(true);
    expect(within({ fraction: 0.04, pixels: 100 }, { fraction: 0.05, minPx: 48 })).toBe(true);
  });
  it('passes when pixels is at or below the minPx floor (even if fraction exceeds)', () => {
    expect(within({ fraction: 0.30, pixels: 48 }, { fraction: 0.05, minPx: 48 })).toBe(true);
  });
  it('fails when both exceed', () => {
    expect(within({ fraction: 0.30, pixels: 100 }, { fraction: 0.05, minPx: 48 })).toBe(false);
  });
});

describe('beyond', () => {
  it('passes when both fraction and pixels meet/exceed', () => {
    expect(beyond({ fraction: 0.20, pixels: 60 }, { fraction: 0.20, minPx: 60 })).toBe(true);
    expect(beyond({ fraction: 0.50, pixels: 200 }, { fraction: 0.20, minPx: 60 })).toBe(true);
  });
  it('fails when fraction meets but pixels does not (small surface)', () => {
    expect(beyond({ fraction: 0.50, pixels: 30 }, { fraction: 0.20, minPx: 60 })).toBe(false);
  });
  it('fails when pixels meets but fraction does not (huge surface)', () => {
    expect(beyond({ fraction: 0.05, pixels: 200 }, { fraction: 0.20, minPx: 60 })).toBe(false);
  });
});
```

**Implementation:**

```ts
import type { Distance } from './types';

export type Threshold = { fraction: number; minPx: number };

export function within(d: Distance, t: Threshold): boolean {
  return d.fraction <= t.fraction || d.pixels <= t.minPx;
}

export function beyond(d: Distance, t: Threshold): boolean {
  return d.fraction >= t.fraction && d.pixels >= t.minPx;
}
```

Run: `npm test -- helpers`. Expect 6/6 pass. Full suite still passes.
Commit: `feat: trigger system — within / beyond helpers`.

## Task 3: The canonical trigger registry (TDD)

**Files:**
- Create: `src/triggers/triggers.ts`, `src/triggers/triggers.test.ts`

**Content:** A curated set of trigger definitions. Start with what we need for the current default bindings (everything in `src/input/defaultBindings.ts` today). Group by category. Name the symbols.

Trigger names to define (initial set — extend as needed):

- `click`, `pressLong`
- `swipeInlineEnd`, `swipeInlineEndEdge`, `swipeInlineStart`, `swipeInlineStartEdge`
- `swipeBlockEnd`, `swipeBlockStart` (reserved; no current binding)
- `overscrollBlockEnd`
- `keypressJ`, `keypressE`, `keypressHash`, `keypressBang`, `keypressB`
- `keypressModK`, `keypressEscape`, `keypressModZ`, `keypressModShiftZ`

For each: a Trigger record with explicit priority. Suggested priority bands:

- Edge-qualified swipes: priority 10
- Bulk swipes: priority 5
- Long-press: priority 5
- Click: priority 1
- Overscroll: priority 5
- Keypress: priority 5 (single combo can only match one event anyway)

**TDD approach:** for each Trigger, write a unit test that synthesises an `AbstractEvent` and asserts `match()` returns the expected boolean. Cover both positive and negative cases per trigger.

Run: `npm test -- triggers`. Full suite still passes.
Commit: `feat: trigger system — canonical trigger registry`.

## Task 4: Action map (surface → trigger → action)

**Files:**
- Create: `src/triggers/actionMap.ts`, `src/triggers/actionMap.test.ts`

The map mirrors today's `DEFAULT_BINDINGS` content but in the new shape. Reference the design doc's "concrete sketch" for the full content.

**Tests:** mostly sanity — `actionMap.get('row')!.get(swipeInlineEnd)` returns `archiveThreadAction`, etc. Also verify no surface lookup returns `undefined` for the surfaces we ship.

Run: `npm test -- actionMap`.
Commit: `feat: trigger system — surface → trigger → action map`.

## Task 5: argsFor — action argument resolution

**Files:**
- Create: `src/triggers/argsFor.ts`, `src/triggers/argsFor.test.ts`

This is the analog of today's `resolveArgs` in `fireBinding.ts`. For a given action + event + readonly context, produce the `args` payload to pass to the dispatcher.

Rules (carried from today):
- For thread-targeted actions (action `modelName === threadModel`): `targets` resolved from `ctx.selection` if non-empty, else from a `data-thread-id` walked up from `event.target`.
- For `open-panel`: `{ kind: 'thread', threadId }` from the row's `data-thread-id`.
- For layout / app / selection actions: empty args.

TDD with synthesised events.
Commit: `feat: trigger system — argsFor argument resolver`.

## Task 6: resolveAndFire (the resolver) (TDD)

**Files:**
- Create: `src/triggers/resolve.ts`, `src/triggers/resolve.test.ts`

Implement the algorithm from the design doc:

1. Filter triggers by `match(event)` → matched set.
2. Map each matched trigger to its action via `actionMap.get(event.surface)?.get(trigger.name)`; drop undefined.
3. Sort surviving candidates by `priority` desc.
4. `console.warn` on top-two priority collision.
5. Fire the top one via `dispatch({ action, args, context })`.

Tests should cover:
- One trigger matches, one action assigned → fires.
- Two triggers match, higher priority wins.
- Two triggers match, only lower-priority has an action in this surface → lower fires (the "fallback" case from the design doc).
- No triggers match → returns null, no dispatch.
- No assignments in this surface → returns null.
- Priority collision → console.warn called, first-defined wins.

Test all this against a synthesised dispatcher (`vi.fn()`) and synthesised events — no DOM.

Commit: `feat: trigger system — resolveAndFire`.

---

# Step 2 — Producers, parallel to existing hooks

## Task 7: data-surface attributes on existing elements

**Files:**
- Modify: `src/panels/ThreadlistPanel.tsx` (row `<li>`), `src/layout/PanelHeader.tsx`, `src/panels/ThreadPanel.tsx` (body `<div>`), `src/pickers/SnoozePicker.tsx`, `src/pickers/LabelPicker.tsx`, `src/palette/CommandPalette.tsx`, `src/feedback/UndoToast.tsx`

Add `data-surface="row" | "panel-header" | "panel-body" | "overlay"` to the appropriate elements. Pickers/palette/toast get `data-surface="overlay"`. Nothing else changes.

Verify: tests pass; build + lint clean.
Commit: `feat: trigger system — tag elements with data-surface`.

## Task 8: Gesture producer (TDD where possible)

**Files:**
- Create: `src/triggers/producers/fromGesture.ts`, `src/triggers/producers/fromGesture.test.tsx`

A React hook `useGestureProducer(scope, ref, onEvent)`:
- Wraps the existing `useGesture` (don't reimplement).
- In each gesture callback (click / long-press / swipe / overscroll):
  - Walks up from the raw event target to find the surface element (closest `data-surface` ancestor).
  - Computes `Distance` for swipe deltas (fraction = pixels / surfaceElement.getBoundingClientRect()[axis]; cap at 1.0; for document scope use viewport).
  - Computes CSS-logical axis + towards from physical deltas + `getComputedStyle(html).direction`.
  - Computes `startEdgeDistance` / `endEdgeDistance` from start/release client coords vs. the surface element's bounding rect.
  - Calls `onEvent(abstractEvent)`.

Tests: mock `useGesture`'s callbacks, assert the synthesised `AbstractEvent` shape. jsdom can fake the DOM.

Commit: `feat: trigger system — gesture producer`.

## Task 9: Keyboard producer

**Files:**
- Create: `src/triggers/producers/fromKeyboard.ts`, `src/triggers/producers/fromKeyboard.test.tsx`

A React hook `useKeyboardProducer(onEvent)`:
- Wraps `useDocumentKeyboard` (or attaches its own document keydown listener).
- Translates each key event into `{ kind: 'keypress', surface: 'document', combo: '…' }`.
- Calls `onEvent`.

Commit: `feat: trigger system — keyboard producer`.

## Task 10: Wire producers + resolver behind a feature flag

**Files:**
- Modify: `src/App.tsx`

Mount the producers at the top of the app. Their `onEvent` calls a single handler that runs `resolveAndFire(event, ctx, dispatch, ACTION_MAP, TRIGGERS)`. The handler is gated by a feature flag (`const USE_NEW_TRIGGERS = false;` initially) so nothing fires through the new path yet.

The old pipeline keeps running unmodified.

Verify: tests pass; manual smoke = behaviour identical to before (flag is off).
Commit: `feat: trigger system — wire producers + resolver behind flag`.

---

# Step 3 — Canary

## Task 11: Migrate row click → open-panel

**Files:**
- Modify: `src/input/defaultBindings.ts` (remove the row-click binding), `src/App.tsx` (flip flag for the canary)

Actually safer: don't add a flag; just *replace* the click handling. Remove the row click binding from `defaultBindings.ts`. Verify a row tap still opens a thread end-to-end (manual + the `ThreadlistPanel` tests that exercise `useGestureBindings`).

If anything breaks, revert and debug.

Commit: `feat: trigger system — canary, row click → open-panel through new pipeline`.

---

# Step 4 — Migrate the rest, batch by batch

Each task is one batch, one commit. Same shape: remove entries from `defaultBindings.ts`, ensure they're in `ACTION_MAP`, verify manually + via tests.

## Task 12: Row gestures batch

Remove from `defaultBindings.ts`:
- `row` swipe-right (graduated archive/delete).
- `row` swipe-left (snooze, plus your in-progress swipe-left-edge → add-label).
- `row` long-press (enter-selection).

Verify the new triggers (`swipeInlineEnd`, `swipeInlineEndEdge`, `swipeInlineStart`, `swipeInlineStartEdge`, `pressLong`) have entries in `ACTION_MAP` under `row` and that manual gestures still fire the right actions.

Commit: `feat: trigger system — row gestures through new pipeline`.

## Task 13: Panel-header swipes batch

Remove from `defaultBindings.ts`:
- `panel-header` swipe-left (next).
- `panel-header` swipe-right (prev).

Verify nav swipes still work on the panel header.

Commit: `feat: trigger system — panel-header swipes through new pipeline`.

## Task 14: Document keyboard batch

Remove from `defaultBindings.ts`:
- All `document`-scope keyboard bindings (J/E/#/!/B/Esc/Mod+K/Mod+Z/Mod+Shift+Z).

Verify each shortcut still does what it did.

Commit: `feat: trigger system — document keyboard through new pipeline`.

## Task 15: Panel-body overscroll batch

Remove from `defaultBindings.ts`:
- `panel-body` overscroll-bottom (close-panel).

Verify overscroll-close still closes the open thread.

Commit: `feat: trigger system — panel-body overscroll through new pipeline`.

---

# Step 5 — Delete the old

## Task 16: Delete legacy binding files

**Files (deleted):**
- `src/input/defaultBindings.ts` (now empty array)
- `src/input/fireBinding.ts`
- `src/input/useGestureBindings.ts` (if not referenced; otherwise migrate consumers)
- `src/input/predicates.ts` (or shrink to only the auth check if anything still needs it — but auth gating should have moved into the dispatcher's confirmation lookup by now)

Verify: tests pass; build + lint clean. Final manual smoke.

Commit: `chore: trigger system — delete legacy binding/predicate code`.

## Task 17: Move confirmation auth gating into the dispatcher

**Files:**
- Modify: `src/state/DispatchProvider.tsx`

The wrapping dispatcher today consults `requiresAuth` on the action registry entry. After this refactor it should consult `confirmationByActionName.get(action.name)` → look up `CONFIRMATION_REQUIREMENTS.get(confirmationId).requiresAuth`. If true and `!ctx.signedIn`, return `{ ok: false, error: 'Please sign in.' }` without calling the handler.

(This task might naturally fold into Task 16; split if it's cleaner separately.)

Commit: `refactor: dispatcher gates auth via confirmation lifecycle`.

## Task 18: Final whole-branch review + manual e2e

Run the full Checkpoint-1-style manual exercise from the original Phase 0c plan (rows / picker / palette / toast / undo / keyboard / multi-select) to make sure nothing regressed.

Then: open a PR from `event-system` to `main` if you want to land it, or leave it for further iteration on the long-lived branch.

---

## Recovery hint for context-loss

If this session resets mid-execution:

1. Read the design doc first: `docs/plans/2026-06-07-trigger-system-design.md`.
2. Read this plan.
3. Check `git log` on `event-system` to see which steps are complete.
4. Look for `src/triggers/` to see what infrastructure exists.
5. The legacy code being replaced lives in `src/input/defaultBindings.ts`, `src/input/fireBinding.ts`, `src/input/useGestureBindings.ts`.
6. Pick up at the next un-committed task. Each step is independently committable; resuming mid-step shouldn't break things.

Project-owner preferences to honor (from the brainstorm):
- Plain language, no jargon. Don't use "binding" or "predicate."
- Symbols for in-memory IDs; no JSON serialisation needed.
- Side-maps for action metadata; keep the `Action` record identity-only.
- CSS-logical axes everywhere it works.
- One question at a time in brainstorms; prose over multiple-choice for design exploration.
