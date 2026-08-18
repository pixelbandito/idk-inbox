# Swipe Affordance Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (or
> subagent-driven-development) to implement this plan task-by-task.

**Goal:** Replace fire-on-release row swipes with a live, distance-tiered drag
affordance (tile follows finger, colored icon reveal, crossfade to a heavier
action past a second threshold), driven by two declarative tables so row
swipes are data, not engine code.

**Architecture:** A pure `swipeIntents` module is the single source of truth:
`ACTION_PRESENTATION` (how each action looks, keyed by action) and
`ROW_SWIPE_BINDINGS` (which action sits in which direction+distance slot, with
optional pre-filled args). One pure resolver drives both the live reveal and
the commit, so they can't drift. `useGesture` gains an `onDrag` callback;
`useRowSwipe` wraps it to render visuals imperatively and dispatch the resolved
action on release. Row swipes leave the generic `actionMap`; taps/keys/header
swipes stay on it. See `docs/plans/2026-07-07-swipe-affordance-design.md`.

**Tech stack:** React 19, TypeScript, Vitest + Testing Library, CSS custom
properties. Full logical (RTL-safe) directions.

**Working rules:** Node 22.13 (`nvm use`; Node 20 breaks vitest). Run tests
with `npx vitest run <path>`. TDD each task. Uncle Bob: small pure functions,
names over comments, terse why-comments. Commit after each task.

---

## Context for a fresh engineer

- **Dispatch:** `dispatch({ action, args, context })` runs a registered action;
  `snooze-thread` / `add-label-thread` carry `elicitVia`, so dispatching them
  with the elicitable arg *absent* opens a picker, and *present* skips it.
- **Targets:** `src/input/helpers.ts` has `targetFromRow(el)` (walks up to
  `data-thread-id`) and `targetsFromSelection(ctx)`. Reuse these; don't
  reimplement target logic.
- **Existing gesture core:** `src/input/useGesture.ts` turns pointer events
  into `onClick` / `onLongPress` / `onSwipe(atRelease)`. It already has pointer
  capture and long-press cancel-on-move.
- **Row today:** `src/panels/ThreadlistPanel.tsx` `Row` calls
  `useGestureProducer('row', ref, onTrigger)` and routes click + 4 swipes +
  long-press through `ACTION_MAP`.
- **Direction is CSS-logical:** `start`/`end`, not left/right, so RTL works.
  In LTR, `+dx` (drag right) = `end`.

---

## Task 1: Shared inline-swipe geometry helpers

**Files:**
- Create: `src/input/swipeGeometry.ts`
- Test: `src/input/swipeGeometry.test.ts`

**Step 1 — failing test** (`src/input/swipeGeometry.test.ts`):

```ts
import { describe, it, expect } from 'vitest';
import { logicalInlineDirection, inlineFraction } from './swipeGeometry';

describe('logicalInlineDirection', () => {
  it('maps drag right to end / left to start in LTR', () => {
    expect(logicalInlineDirection(50, 'ltr')).toBe('end');
    expect(logicalInlineDirection(-50, 'ltr')).toBe('start');
  });
  it('flips in RTL', () => {
    expect(logicalInlineDirection(50, 'rtl')).toBe('start');
    expect(logicalInlineDirection(-50, 'rtl')).toBe('end');
  });
});

describe('inlineFraction', () => {
  it('is the clamped magnitude over the inline size', () => {
    expect(inlineFraction(50, 200)).toBeCloseTo(0.25);
    expect(inlineFraction(-100, 200)).toBeCloseTo(0.5);
    expect(inlineFraction(500, 200)).toBe(1);   // clamped
    expect(inlineFraction(50, 0)).toBe(0);      // guard divide-by-zero
  });
});
```

**Step 2 — run, expect fail (module missing):**
`npx vitest run src/input/swipeGeometry.test.ts`

**Step 3 — implement** (`src/input/swipeGeometry.ts`):

```ts
// Pure inline-axis swipe math, shared by the row-swipe hook. Directions are
// CSS-logical (start/end) so right-to-left layouts need no special-casing.

export function logicalInlineDirection(dx: number, docDir: 'ltr' | 'rtl'): 'start' | 'end' {
  const positiveIsEnd = docDir !== 'rtl';
  if (dx >= 0) return positiveIsEnd ? 'end' : 'start';
  return positiveIsEnd ? 'start' : 'end';
}

/** |dx| as a fraction of the row's inline size, clamped to [0, 1]. */
export function inlineFraction(dx: number, inlineSize: number): number {
  if (inlineSize <= 0) return 0;
  const f = Math.abs(dx) / inlineSize;
  return f > 1 ? 1 : f;
}
```

**Step 4 — run, expect pass. Step 5 — commit:**
`git add src/input/swipeGeometry.* && git commit -m "feat: shared inline-swipe geometry helpers"`

---

## Task 2: `onDrag` callback on `useGesture`

**Files:**
- Modify: `src/input/useGesture.ts`
- Test: `src/input/useGesture.test.tsx` (append)

**Step 1 — failing test** (append a case): mount an element with `useGesture`,
dispatch pointerdown then several pointermoves, assert `onDrag` was called with
running `(dx, dy)` deltas relative to the start point, and that a plain
down→up with no movement does **not** call `onDrag`. Follow the existing
synthetic-pointer patterns already in that test file (reuse its helpers for
dispatching `PointerEvent`s and its `renderHook`/container setup).

```ts
it('fires onDrag with running deltas during a drag', () => {
  const onDrag = vi.fn();
  // …mount an element with useGesture({ onDrag }) per this file's helpers…
  // pointerdown at (100, 100); move to (130, 105); move to (160, 90)
  expect(onDrag).toHaveBeenNthCalledWith(1, 30, 5);
  expect(onDrag).toHaveBeenNthCalledWith(2, 60, -10);
});

it('does not fire onDrag for a tap with no movement', () => {
  // pointerdown then pointerup at the same point → onDrag never called
});
```

**Step 2 — run, expect fail.**

**Step 3 — implement:** in `src/input/useGesture.ts`:
- Add `onDrag?: (dx: number, dy: number) => void;` to `GestureCallbacks`.
- In the `onMove` handler, after the existing long-press-cancel check, call
  `optsRef.current.onDrag?.(ev.clientX - startX, ev.clientY - startY)`.
  (`onMove` already guards `pointerId`/`ev.pointerId`.) Do not change `onUp`,
  `onDown`, capture, or long-press logic.

**Step 4 — run, expect pass. Step 5 — commit:**
`git commit -am "feat: useGesture onDrag callback for live drag tracking"`

---

## Task 3: `swipeIntents` — the two tables + resolver + command builder

**Files:**
- Create: `src/input/swipeIntents.ts`
- Test: `src/input/swipeIntents.test.ts`

**Design notes:**
- `ActionId` is `string` (see `src/input/types.ts`).
- `IconName = 'archive' | 'trash' | 'clock' | 'tag'`.
- `resolveSwipeIntent` returns the *furthest-armed* binding for a direction, or
  null under the first threshold.
- `swipeCommandFor` is the pure commit builder: given the resolved intent plus
  the row's threadId and ctx, it returns `{ action, args }` or null. Targets
  prefer a non-empty selection, else the single row. The binding's `args` are
  merged in (so a preset `label` skips the picker).

**Step 1 — failing test** (`src/input/swipeIntents.test.ts`):

```ts
import { describe, it, expect } from 'vitest';
import {
  resolveSwipeIntent, swipeCommandFor, ROW_SWIPE_BINDINGS, ACTION_PRESENTATION,
} from './swipeIntents';
import type { ReadonlyContext } from './types';

const ctx = (selection: string[] = []): ReadonlyContext => ({
  focusedPanelIndex: 1, focusedPanelKind: 'threadlist', focusedLabel: 'INBOX',
  selection, mode: 'idle', signedIn: true,
});

describe('resolveSwipeIntent', () => {
  it('returns null under the first threshold', () => {
    expect(resolveSwipeIntent('end', 0.1)).toBeNull();
    expect(resolveSwipeIntent('start', 0.24)).toBeNull();
  });
  it('arms tier 1 between the thresholds', () => {
    expect(resolveSwipeIntent('end', 0.3)?.binding.action).toBe('archive-thread');
    expect(resolveSwipeIntent('start', 0.5)?.binding.action).toBe('snooze-thread');
  });
  it('arms tier 2 past the far threshold', () => {
    expect(resolveSwipeIntent('end', 0.8)?.binding.action).toBe('delete-thread');
    expect(resolveSwipeIntent('start', 0.9)?.binding.action).toBe('add-label-thread');
  });
  it('carries the presentation keyed by action', () => {
    expect(resolveSwipeIntent('end', 0.8)?.presentation).toEqual(
      ACTION_PRESENTATION['delete-thread'],
    );
  });
});

describe('swipeCommandFor', () => {
  it('is null under the first threshold', () => {
    expect(swipeCommandFor('end', 0.1, 't1', ctx())).toBeNull();
  });
  it('targets the swiped row when nothing is selected', () => {
    expect(swipeCommandFor('end', 0.3, 't1', ctx())).toEqual({
      action: 'archive-thread', args: { targets: ['t1'] },
    });
  });
  it('prefers the selection when non-empty', () => {
    expect(swipeCommandFor('end', 0.8, 't1', ctx(['a', 'b']))).toEqual({
      action: 'delete-thread', args: { targets: ['a', 'b'] },
    });
  });
  it('merges a binding args preset (fixed-label slot skips the picker)', () => {
    const bindings = [{ direction: 'start' as const, armAtFraction: 0.25,
      action: 'add-label-thread', args: { label: 'idk-inbox/Receipts' } }];
    expect(swipeCommandFor('start', 0.3, 't1', ctx(), bindings)).toEqual({
      action: 'add-label-thread', args: { targets: ['t1'], label: 'idk-inbox/Receipts' },
    });
  });
});
```

**Step 2 — run, expect fail.**

**Step 3 — implement** (`src/input/swipeIntents.ts`):

```ts
// The single source of truth for row swipes. Two tables:
//   ACTION_PRESENTATION — how each triage action looks, keyed by the action so
//     a remapped action keeps its colour/icon wherever it lands.
//   ROW_SWIPE_BINDINGS — which action sits in which direction+distance slot;
//     the overridable part (a future settings screen persists a replacement
//     and passes it to the resolver).
// One resolver drives BOTH the live reveal and the commit, so the picture on
// screen and the action that fires can never disagree.

import { targetsFromSelection } from './helpers';
import type { ActionId, ReadonlyContext, ThreadRef } from './types';

export type Tone = 'safe' | 'danger' | 'info' | 'warn';
export type IconName = 'archive' | 'trash' | 'clock' | 'tag';

export interface ActionPresentation {
  tone: Tone;
  icon: IconName;
  label: string;
}

export interface SwipeBinding {
  direction: 'start' | 'end';
  armAtFraction: number;
  action: ActionId;
  /** Pre-fill an elicitable arg to skip that action's picker (e.g. { label }). */
  args?: Record<string, unknown>;
}

export interface ResolvedIntent {
  binding: SwipeBinding;
  presentation: ActionPresentation;
}

export const ACTION_PRESENTATION: Record<string, ActionPresentation> = {
  'archive-thread':   { tone: 'safe',   icon: 'archive', label: 'Archive' },
  'delete-thread':    { tone: 'danger', icon: 'trash',   label: 'Delete' },
  'snooze-thread':    { tone: 'info',   icon: 'clock',   label: 'Snooze' },
  'add-label-thread': { tone: 'warn',   icon: 'tag',     label: 'Label' },
};

export const ROW_SWIPE_BINDINGS: SwipeBinding[] = [
  { direction: 'end',   armAtFraction: 0.25, action: 'archive-thread' },
  { direction: 'end',   armAtFraction: 0.70, action: 'delete-thread' },
  { direction: 'start', armAtFraction: 0.25, action: 'snooze-thread' },
  { direction: 'start', armAtFraction: 0.70, action: 'add-label-thread' },
];

/** The furthest-armed binding for a direction at this pull fraction, or null. */
export function resolveSwipeIntent(
  direction: 'start' | 'end',
  fraction: number,
  bindings: SwipeBinding[] = ROW_SWIPE_BINDINGS,
): ResolvedIntent | null {
  let best: SwipeBinding | null = null;
  for (const b of bindings) {
    if (b.direction !== direction) continue;
    if (fraction < b.armAtFraction) continue;
    if (!best || b.armAtFraction > best.armAtFraction) best = b;
  }
  if (!best) return null;
  const presentation = ACTION_PRESENTATION[best.action];
  return presentation ? { binding: best, presentation } : null;
}

/** The dispatch command for a released swipe, or null if under the threshold. */
export function swipeCommandFor(
  direction: 'start' | 'end',
  fraction: number,
  rowThreadId: ThreadRef | null,
  ctx: ReadonlyContext,
  bindings: SwipeBinding[] = ROW_SWIPE_BINDINGS,
): { action: ActionId; args: Record<string, unknown> } | null {
  const intent = resolveSwipeIntent(direction, fraction, bindings);
  if (!intent) return null;
  const targets = ctx.selection.length > 0
    ? targetsFromSelection(ctx)
    : (rowThreadId ? [rowThreadId] : []);
  return {
    action: intent.binding.action,
    args: { targets, ...intent.binding.args },
  };
}
```

**Step 4 — run, expect pass. Step 5 — commit:**
`git commit -am "feat: swipeIntents — declarative row-swipe tables + resolver"`

---

## Task 4: Icon set

**Files:**
- Create: `src/ui/icons.tsx`
- Test: `src/ui/icons.test.tsx`

**Step 1 — failing test:**

```ts
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Icon } from './icons';

describe('Icon', () => {
  it('renders an svg for each known name', () => {
    for (const name of ['archive', 'trash', 'clock', 'tag'] as const) {
      const { container } = render(<Icon name={name} />);
      expect(container.querySelector('svg')).toBeTruthy();
    }
  });
  it('marks itself decorative for screen readers', () => {
    const { container } = render(<Icon name="archive" />);
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });
});
```

**Step 2 — run, expect fail.**

**Step 3 — implement** (`src/ui/icons.tsx`): one component switching on
`IconName`, each returning a small inline `<svg width="20" height="20"
viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
aria-hidden="true">` with a simple path per icon (archive: box + down arrow;
trash: can + lid; clock: circle + hands; tag: tag outline + dot). Import
`IconName` from `../input/swipeIntents`. `stroke="currentColor"` so the reveal
layer's text colour drives it.

**Step 4 — run, expect pass. Step 5 — commit:**
`git commit -am "feat: inline icon set for swipe reveals"`

---

## Task 5: Tone theme vars + reveal/tile CSS

**Files:**
- Modify: `src/theme.css` (add tone vars, light + dark)
- Modify: `src/index.css` (reveal + tile layout, under `@layer app`)

**Step 1 — implement** (no unit test; visual). In `src/theme.css`, add four
tone custom properties in both the light and dark blocks (match the file's
existing pattern for light/dark). Suggested: safe `#1a7f37`/`#2ea043`, danger
`#c0392b`/`#e5534b`, info `#b7791f`/`#d4a017`, warn `#3f6fd1`/`#5a8dee`.

In `src/index.css`, restructure the row into a reveal layer + sliding tile:

```css
  .email {
    position: relative;
    overflow: hidden;                 /* clip the reveal to the row */
  }
  .email__reveal {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    padding-inline: 1rem;
    color: #fff;
    opacity: 0;
    /* Icon sits at the edge you pull FROM: end-drag reveals at inline-start. */
  }
  .email[data-armed-tone] .email__reveal { opacity: 1; }
  .email[data-armed-tone="safe"]   .email__reveal { background: var(--tone-safe); }
  .email[data-armed-tone="danger"] .email__reveal { background: var(--tone-danger); }
  .email[data-armed-tone="info"]   .email__reveal { background: var(--tone-info); }
  .email[data-armed-tone="warn"]   .email__reveal { background: var(--tone-warn); }
  .email[data-pull="end"]   .email__reveal { justify-content: flex-start; }
  .email[data-pull="start"] .email__reveal { justify-content: flex-end; }

  .email__tile {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    padding: 0.75rem;
    background: var(--backgroundColor);
    transform: translateX(var(--drag-x, 0));
  }
  .email--releasing .email__tile { transition: transform 180ms ease; }
  .email--unread .email__tile { background: #f6f9ff; }
  .email--selected .email__tile { background: #eef6ff; }
```

Move the existing `.email--unread` / `.email--selected` backgrounds onto
`.email__tile` (the sliding layer), as shown. Keep `touch-action` /
`user-select` / `overflow-wrap` on `.email` (or move to `.email__tile`).

**Step 2 — build to sanity-check:** `npm run build`.
**Step 3 — commit:** `git commit -am "feat: tone vars + swipe reveal/tile CSS"`

---

## Task 6: `useRowSwipe` hook

**Files:**
- Create: `src/input/useRowSwipe.ts`
- Test: `src/input/useRowSwipe.test.tsx`

**Behaviour:**
- Wraps `useGesture` on the row ref. `onClick` / `onLongPress` are forwarded to
  a provided `onTrigger` (the generic tap pipeline, so `open-panel` /
  `enter-selection` keep working via `ACTION_MAP`) — build the AbstractEvent the
  same way `producers/fromGesture.ts` does (reuse its surface resolution; export
  a helper from there if needed, or replicate the ~6-line `resolveSurface`).
- `onDrag(dx, dy)`: if the gesture is horizontal (`|dx| >= |dy|`), compute
  `direction` (`logicalInlineDirection`) and `fraction`
  (`inlineFraction(dx, el.clientWidth)`), imperatively set `--drag-x`,
  `data-pull`, and `data-armed-tone` (from `resolveSwipeIntent`, or clear it
  when null), and fire `navigator.vibrate?.(8)` when the resolved action
  identity changes vs the previous frame (track in a ref).
- `onSwipe` (release): compute final direction/fraction, call `swipeCommandFor`;
  if non-null `dispatch({ action, args, context: ctx })` and add
  `email--releasing` + animate `--drag-x` off; if null, spring `--drag-x` back
  to 0. Do **not** forward `onSwipe` to `onTrigger`.

Keep the DOM-mutating parts in the hook; put the decision logic in
`swipeIntents` (already pure and tested). The test here covers the *dispatch*
path via synthetic pointer events.

**Step 1 — failing test** (`src/input/useRowSwipe.test.tsx`): render a
`<li data-thread-id="t1" data-surface="row">` wired with `useRowSwipe` given a
mock `dispatch`, a mock `onTrigger`, and a ctx. Using the synthetic-pointer
helpers from `useGesture.test.tsx`:
- a drag to ~30% width then release → `dispatch` called with `archive-thread`,
  `{ targets: ['t1'] }`.
- a drag past ~70% → `delete-thread`.
- a sub-threshold drag (~10%) release → `dispatch` not called.
- a plain click → `onTrigger` called (tap path), `dispatch` not called with a
  thread-write.

(Set the element's `clientWidth` via a getter stub if jsdom reports 0, e.g.
`Object.defineProperty(el, 'clientWidth', { value: 200 })`.)

**Step 2 — run, expect fail. Step 3 — implement. Step 4 — run, expect pass.**

**Step 5 — commit:** `git commit -am "feat: useRowSwipe — live tiered drag with intent commit"`

---

## Task 7: Wire the Row to `useRowSwipe`

**Files:**
- Modify: `src/panels/ThreadlistPanel.tsx`
- Modify: `src/panels/ThreadlistPanel.test.tsx` (adjust for new DOM if needed)

**Changes:**
- `Row` renders the reveal + tile structure:

```tsx
<li ref={ref} data-thread-id={email.threadId} data-surface="row" className={className}>
  <div className="email__reveal" aria-hidden="true"><Icon name={armedIcon} /></div>
  <div className="email__tile">
    <span className="email__from">{email.from}</span>
    <span className="email__subject">{email.subject}</span>
    <span className="email__snippet">{email.snippet}</span>
  </div>
</li>
```

  The reveal's icon can be a single element whose `name` the hook updates via a
  `data-armed-icon` attribute + CSS, **or** simpler: render all needed icons is
  overkill — instead keep one `<Icon>` and let the hook swap the row's
  `data-armed-tone`; for the icon, the hook can toggle a `data-armed-icon`
  attribute and you render the matching icon by reading it. Simplest correct
  approach: have `useRowSwipe` expose the current `armedIcon` via a tiny state
  setter passed in, and `Row` renders `<Icon name={armedIcon ?? 'archive'} />`
  with the reveal hidden (opacity 0) when not armed. Choose the least-code path
  that keeps re-renders to tier changes only (not every frame).
- Replace the tap pipeline set: `ROW_TAP_PIPELINE = new Set([click, pressLong])`
  and drop the four swipe symbols from the import.
- Replace `useGestureProducer('row', ref, onTrigger)` with
  `useRowSwipe(ref, { onTrigger, dispatch, ctx })` (get `dispatch`/`ctx` from
  `useDispatcher` / `useDispatchContext`).

**Step — verify tests:** `npx vitest run src/panels/ThreadlistPanel.test.tsx`.
The existing "tapping a row dispatches open-panel" test must still pass (taps
still flow through `onTrigger` → `ACTION_MAP`). Adjust selectors if the row DOM
change affects them.

**Commit:** `git commit -am "feat: rows use the live tiered swipe affordance"`

---

## Task 8: Retire the edge triggers from the generic pipeline

**Files:**
- Modify: `src/triggers/actionMap.ts` (remove the 4 `row` swipe rows + unused
  imports; leave `click → open-panel`, `pressLong → enter-selection`; add a
  one-line comment pointing to `src/input/swipeIntents.ts`)
- Modify: `src/triggers/triggers.ts` (delete `swipeInlineEndEdge`,
  `swipeInlineStartEdge` definitions + exports; keep `swipeInlineEnd`,
  `swipeInlineStart` — panel-header nav still uses them)
- Modify: `src/triggers/triggers.test.ts`, `src/triggers/actionMap.test.ts`,
  and any other file importing the edge triggers — update/remove assertions.

**Verify:** `grep -rn "InlineEndEdge\|InlineStartEdge" src` returns nothing.
Then `npm test` (whole suite) + `npm run lint`.

**Commit:** `git commit -am "refactor: row swipes leave actionMap; drop edge triggers"`

---

## Task 9: Full verification

- `nvm use && npm test` — all green.
- `npm run lint` — clean.
- `npm run build` — succeeds.
- Manual (report, don't block): `npm run dev`, drag a row a little (archive
  reveal), a lot (delete reveal), left a little (snooze), left a lot (label);
  release under threshold springs back; selection applies to all selected.

**Commit any test fixups**, then this branch is ready to fold into the PR.
