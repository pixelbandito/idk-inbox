# Phase 0c — Part 1 — Stubbed Input Model — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Stand up the entire input/action layer (pure dispatch, bindings, gestures, pickers, Cmd-K, undo/redo, multi-select) wired to **stub action handlers** that log their arguments and return fake `ActionResult`s. Layout actions (panel nav, open/close panel, refresh) are real so navigation gives proper feedback during testing. **No real Gmail writes in this plan.** Pauses at Checkpoint 1 (does the wiring feel right?) and Checkpoint 2 (how easy is it to add a new binding?) before Part 2 swaps the stub handlers for real Gmail calls.

**Architecture:** Pure-FP data + pure functions. Actions are typed async functions in a per-render registry. Bindings are plain serializable data with tagged-union triggers + predicate IDs. A `DispatchProvider` owns selection/mode/undo/layout state and exposes a memoized dispatcher. `useGesture` + `useGestureBindings` hooks attach pointer listeners to scoped DOM elements; a document-level handler covers keyboard. Pickers re-dispatch the same action with the missing arg filled in.

**Tech Stack:** React 18, Vite, TypeScript, Vitest + React Testing Library. No new runtime deps.

**Design doc:** `docs/plans/2026-05-25-phase-0c-unified-input-model-design.md`.

---

## Conventions

- **TDD where the skill applies** — pure utilities, hooks, components: failing test first, watch it fail, implement, watch it pass, commit. UI interaction is verified manually at Checkpoint 1.
- **One commit per task** with conventional-commit prefixes (`feat:`, `refactor:`, `chore:`, `test:`).
- **Every commit message ends with this trailer** (shown once here):
  ```
  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  ```
- **Working directory:** `/Users/pixelbandito/Code/email/.worktrees/phase-0c-input-model`. Paths below are relative to it.
- **Node 22.13+ required.** Prepend `export PATH="/Users/pixelbandito/.nvm/versions/node/v22.13.0/bin:$PATH" && ` to every npm/node command (shell state doesn't persist between calls).
- **Baseline:** 60 tests across 15 files, build + lint clean.
- **Stub vs. real:** every action with side effects outside React state is a STUB in this plan — it logs to `console.info('[stub:<action-id>]', args)` and returns a synthetic `ActionResult`. Layout actions that only mutate React state ARE real (they're the navigation feedback during testing). The exact list is in Milestone B and C.

## Milestone overview

| Milestone | Tasks | What lands |
|---|---|---|
| A — Plumbing | 1–5 | Types, helpers, predicates, pure dispatch, fireBinding glue. |
| B — Stub action handlers | 6–8 | All Gmail-write actions as stubs (modify, archive, delete, spam, snooze, labels, unsubscribe, selection-mode). |
| C — Provider + state + real layout actions | 9–12 | DispatchProvider (selection, mode, undo, layout). Layout actions are real here. |
| D — Bindings + detection | 13–16 | `useGesture`, `useGestureBindings`, document keyboard, default bindings + action catalog metadata. |
| E — UI surfaces | 17–20 | SnoozePicker, LabelPicker, CommandPalette, UndoToast. |
| F — Wire into existing panels | 21–23 | ThreadlistPanel rows, PanelHeader, ThreadPanel overscroll-close, StashColumn integration, App.tsx wraps with provider. |
| G — Build verification | 24 | `npm test` + `npm run build` + `npm run lint` all clean. |
| H — Manual checkpoints (HUMAN) | 25 (Checkpoint 1), 26 (Checkpoint 2) | Project owner verifies wiring + ergonomics. |

Part 2 (separate plan, written after Checkpoint 2 approval) replaces the stub handlers with real Gmail API calls, then runs final review + merge.

---

# Milestone A — Plumbing

## Task 1: Input layer types

**Files:** Create `src/input/types.ts`.

**Step 1: Implement**

```ts
export type ActionId    = string;
export type PredicateId = string;
export type PickerId    = 'picker-snooze' | 'picker-label';
export type Scope       = 'row' | 'panel-header' | 'panel-body' | 'document';
export type Modality    = 'touch' | 'mouse' | 'keyboard';

export type Mode =
  | 'idle'
  | 'selecting'
  | 'picker-snooze'
  | 'picker-label'
  | 'cmd-k';

export type PanelKindForCtx = 'settings' | 'threadlist' | 'thread';

export type ThreadRef = string; // Gmail threadId

export interface SwipeStage {
  minPx: number;
  action: ActionId;
}

export type Trigger =
  | { kind: 'key';         combo: string }
  | { kind: 'click' }
  | { kind: 'long-press';  ms: number }
  | { kind: 'swipe';       direction: 'left' | 'right' | 'up' | 'down'; minPx: number; stages?: SwipeStage[] }
  | { kind: 'overscroll';  edge: 'top' | 'bottom'; minPx: number };

export interface Binding {
  scope:    Scope;
  modality: Modality;
  trigger:  Trigger;
  action:   ActionId;
  when?:    PredicateId | PredicateId[];
}

export interface ReadonlyContext {
  focusedPanelIndex: number;
  focusedPanelKind:  PanelKindForCtx;
  focusedThreadId?:  ThreadRef;
  focusedLabel?:     string;
  selection:         ThreadRef[];
  mode:              Mode;
  signedIn:          boolean;
}

export interface ActionInverse {
  action:      ActionId;
  args:        Record<string, unknown>;
  description: string;
}

export type ActionResult =
  | { ok: true;  description: string; inverse?: ActionInverse }
  | { ok: false; error:       string };

export interface DispatchRequest {
  action:  ActionId;
  args:    Record<string, unknown>;
  context: ReadonlyContext;
}
```

**Step 2: Verify the project still type-checks**

Run: `npm run build`. Expected: clean.

**Step 3: Commit**

```bash
git add src/input/types.ts
git commit -m "feat: add input layer types"
```

(No test file — pure types with no runtime behavior.)

---

## Task 2: Argument-resolution helpers

**Files:** Create `src/input/helpers.ts` and `src/input/helpers.test.ts`.

**Step 1: Failing test**

```ts
// src/input/helpers.test.ts
import { describe, it, expect } from 'vitest';
import {
  targetFromRow, targetsFromSelection, targetFromFocusedRow, targetFromOpenThread,
} from './helpers';
import type { ReadonlyContext } from './types';

function makeCtx(over: Partial<ReadonlyContext> = {}): ReadonlyContext {
  return {
    focusedPanelIndex: 1,
    focusedPanelKind: 'threadlist',
    focusedThreadId: undefined,
    focusedLabel: 'INBOX',
    selection: [],
    mode: 'idle',
    signedIn: true,
    ...over,
  };
}

describe('targetFromRow', () => {
  it('reads data-thread-id off the closest ancestor element', () => {
    const li = document.createElement('li');
    li.setAttribute('data-thread-id', 'tA');
    const span = document.createElement('span');
    li.appendChild(span);
    expect(targetFromRow(span)).toBe('tA');
  });

  it('returns null when no ancestor carries data-thread-id', () => {
    const div = document.createElement('div');
    expect(targetFromRow(div)).toBeNull();
  });
});

describe('targetsFromSelection', () => {
  it('returns a copy of context.selection', () => {
    const ctx = makeCtx({ selection: ['t1', 't2'] });
    expect(targetsFromSelection(ctx)).toEqual(['t1', 't2']);
  });
});

describe('targetFromFocusedRow', () => {
  it('returns the focused thread id when in a thread panel', () => {
    const ctx = makeCtx({ focusedPanelKind: 'thread', focusedThreadId: 'tA' });
    expect(targetFromFocusedRow(ctx)).toBe('tA');
  });

  it('returns null when not focused on a thread panel', () => {
    expect(targetFromFocusedRow(makeCtx())).toBeNull();
  });
});

describe('targetFromOpenThread', () => {
  it('returns the focused thread id (alias of targetFromFocusedRow for the open-thread context)', () => {
    const ctx = makeCtx({ focusedPanelKind: 'thread', focusedThreadId: 'tA' });
    expect(targetFromOpenThread(ctx)).toBe('tA');
  });
});
```

**Step 2: Run — expect FAIL**

`npm test -- helpers` → import error.

**Step 3: Implement**

```ts
// src/input/helpers.ts
import type { ReadonlyContext, ThreadRef } from './types';

/** Walks from the event target up the DOM looking for a `data-thread-id`. */
export function targetFromRow(el: Element | null): ThreadRef | null {
  let cur: Element | null = el;
  while (cur) {
    const v = cur.getAttribute?.('data-thread-id');
    if (v) return v;
    cur = cur.parentElement;
  }
  return null;
}

export function targetsFromSelection(ctx: ReadonlyContext): ThreadRef[] {
  return [...ctx.selection];
}

export function targetFromFocusedRow(ctx: ReadonlyContext): ThreadRef | null {
  if (ctx.focusedPanelKind !== 'thread') return null;
  return ctx.focusedThreadId ?? null;
}

export function targetFromOpenThread(ctx: ReadonlyContext): ThreadRef | null {
  return targetFromFocusedRow(ctx);
}
```

**Step 4: Run — expect PASS (6 tests).**

**Step 5: Full suite + build + lint.** Test count goes from 60 to 66 (+6).

**Step 6: Commit**

```
feat: add target-resolution helpers
```

---

## Task 3: Predicate registry

**Files:** Create `src/input/predicates.ts` and `src/input/predicates.test.ts`.

**Step 1: Failing test**

```ts
import { describe, it, expect } from 'vitest';
import { predicates, evaluateWhen } from './predicates';
import type { ReadonlyContext } from './types';

function makeCtx(over: Partial<ReadonlyContext> = {}): ReadonlyContext {
  return {
    focusedPanelIndex: 1, focusedPanelKind: 'threadlist', focusedLabel: 'INBOX',
    selection: [], mode: 'idle', signedIn: true, ...over,
  };
}

describe('predicates', () => {
  it('mode-idle is true only when mode === idle', () => {
    expect(predicates['mode-idle'](makeCtx())).toBe(true);
    expect(predicates['mode-idle'](makeCtx({ mode: 'cmd-k' }))).toBe(false);
  });

  it('selection-non-empty depends on selection length', () => {
    expect(predicates['selection-non-empty'](makeCtx())).toBe(false);
    expect(predicates['selection-non-empty'](makeCtx({ selection: ['t1'] }))).toBe(true);
  });

  it('in-thread-panel / in-threadlist-panel', () => {
    expect(predicates['in-thread-panel'](makeCtx({ focusedPanelKind: 'thread' }))).toBe(true);
    expect(predicates['in-threadlist-panel'](makeCtx())).toBe(true);
  });

  it('not-in-picker excludes both picker modes', () => {
    expect(predicates['not-in-picker'](makeCtx())).toBe(true);
    expect(predicates['not-in-picker'](makeCtx({ mode: 'picker-snooze' }))).toBe(false);
    expect(predicates['not-in-picker'](makeCtx({ mode: 'picker-label' }))).toBe(false);
  });
});

describe('evaluateWhen', () => {
  it('returns true when when is undefined', () => {
    expect(evaluateWhen(undefined, makeCtx())).toBe(true);
  });

  it('evaluates a single id', () => {
    expect(evaluateWhen('mode-idle', makeCtx())).toBe(true);
    expect(evaluateWhen('mode-cmd-k', makeCtx())).toBe(false);
  });

  it('evaluates an array as AND', () => {
    expect(evaluateWhen(['mode-idle', 'in-threadlist-panel'], makeCtx())).toBe(true);
    expect(evaluateWhen(['mode-idle', 'selection-non-empty'], makeCtx())).toBe(false);
  });

  it('returns false on unknown predicate id (safe default)', () => {
    expect(evaluateWhen('does-not-exist', makeCtx())).toBe(false);
  });
});
```

**Step 2: Run — expect FAIL.**

**Step 3: Implement**

```ts
// src/input/predicates.ts
import type { PredicateId, ReadonlyContext } from './types';

export const predicates: Record<PredicateId, (ctx: ReadonlyContext) => boolean> = {
  'mode-idle':            (c) => c.mode === 'idle',
  'mode-cmd-k':           (c) => c.mode === 'cmd-k',
  'mode-picker-snooze':   (c) => c.mode === 'picker-snooze',
  'mode-picker-label':    (c) => c.mode === 'picker-label',
  'mode-selecting':       (c) => c.mode === 'selecting',
  'not-in-picker':        (c) => c.mode !== 'picker-snooze' && c.mode !== 'picker-label',
  'selection-non-empty':  (c) => c.selection.length > 0,
  'in-thread-panel':      (c) => c.focusedPanelKind === 'thread',
  'in-threadlist-panel':  (c) => c.focusedPanelKind === 'threadlist',
  'signed-in':            (c) => c.signedIn,
};

export function evaluateWhen(
  when: PredicateId | PredicateId[] | undefined,
  ctx: ReadonlyContext,
): boolean {
  if (when === undefined) return true;
  const ids = Array.isArray(when) ? when : [when];
  for (const id of ids) {
    const pred = predicates[id];
    if (!pred) return false;   // safe default for unknown ids
    if (!pred(ctx)) return false;
  }
  return true;
}
```

**Step 4: Run — expect PASS.** Test count: 66 → 75 (+9).

**Step 5: Commit**

```
feat: add predicate registry and evaluateWhen
```

---

## Task 4: Pure dispatch function

**Files:** Create `src/input/dispatch.ts` and `src/input/dispatch.test.ts`.

The dispatcher is parameterized by an `actionRegistry` so the React layer can supply handlers that close over current state setters without making dispatch itself stateful.

**Step 1: Failing test**

```ts
// src/input/dispatch.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createDispatcher } from './dispatch';
import type { ReadonlyContext, RegisteredAction } from './types';

function makeCtx(over: Partial<ReadonlyContext> = {}): ReadonlyContext {
  return {
    focusedPanelIndex: 1, focusedPanelKind: 'threadlist', focusedLabel: 'INBOX',
    selection: [], mode: 'idle', signedIn: true, ...over,
  };
}

describe('createDispatcher', () => {
  it('looks up the action and invokes its handler', async () => {
    const handler = vi.fn().mockResolvedValue({ ok: true, description: 'done' });
    const registry: Record<string, RegisteredAction> = {
      'do-thing': { id: 'do-thing', label: 'Do', category: 'app', handler },
    };
    const dispatch = createDispatcher(registry);
    const result = await dispatch({ action: 'do-thing', args: { x: 1 }, context: makeCtx() });
    expect(result).toEqual({ ok: true, description: 'done' });
    expect(handler).toHaveBeenCalledWith({ x: 1 }, expect.objectContaining({ mode: 'idle' }));
  });

  it('returns ok:false when the action is not in the registry', async () => {
    const dispatch = createDispatcher({});
    const result = await dispatch({ action: 'nope', args: {}, context: makeCtx() });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/unknown action/i);
  });

  it('refuses Gmail-write actions when not signed in', async () => {
    const handler = vi.fn();
    const registry: Record<string, RegisteredAction> = {
      'archive-thread': { id: 'archive-thread', label: 'Archive', category: 'thread-write', handler, requiresAuth: true },
    };
    const dispatch = createDispatcher(registry);
    const result = await dispatch({
      action: 'archive-thread', args: { targets: ['t1'] },
      context: makeCtx({ signedIn: false }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/sign in/i);
    expect(handler).not.toHaveBeenCalled();
  });
});
```

**Step 2: Run — expect FAIL.**

**Step 3: Add `RegisteredAction` + `ActionCategory` to types**

Append to `src/input/types.ts`:

```ts
export type ActionCategory = 'thread-write' | 'layout' | 'app' | 'selection';

export interface RegisteredAction<TArgs = Record<string, unknown>> {
  id:           ActionId;
  label:        string;
  category:     ActionCategory;
  destructive?: boolean;
  requiresAuth?: boolean;
  elicitVia?:   PickerId;
  /** Optional pure function that produces a context-aware preview string for Cmd-K. */
  previewFor?:  (ctx: ReadonlyContext, args: Partial<TArgs>) => string;
  handler:      (args: TArgs, ctx: ReadonlyContext) => Promise<ActionResult>;
}

export type ActionRegistry = Record<ActionId, RegisteredAction>;
```

**Step 4: Implement dispatch**

```ts
// src/input/dispatch.ts
import type { ActionRegistry, ActionResult, DispatchRequest } from './types';

export function createDispatcher(registry: ActionRegistry) {
  return async function dispatch(req: DispatchRequest): Promise<ActionResult> {
    const action = registry[req.action];
    if (!action) {
      return { ok: false, error: `Unknown action: ${req.action}` };
    }
    if (action.requiresAuth && !req.context.signedIn) {
      return { ok: false, error: 'Please sign in.' };
    }
    return action.handler(req.args, req.context);
  };
}
```

**Step 5: Run — expect PASS.** Test count: 75 → 78 (+3).

**Step 6: Commit**

```
feat: add pure createDispatcher
```

---

## Task 5: fireBinding glue

**Files:** Create `src/input/fireBinding.ts` and `src/input/fireBinding.test.ts`.

This is the small adapter between a triggered binding and a dispatch call. It looks at the binding's scope + the originating event + context, resolves the target(s) via helpers, and dispatches.

**Step 1: Failing test**

```ts
import { describe, it, expect, vi } from 'vitest';
import { fireBinding } from './fireBinding';
import type { Binding, ReadonlyContext } from './types';

function makeCtx(over: Partial<ReadonlyContext> = {}): ReadonlyContext {
  return { focusedPanelIndex: 1, focusedPanelKind: 'threadlist', focusedLabel: 'INBOX',
           selection: [], mode: 'idle', signedIn: true, ...over };
}

describe('fireBinding', () => {
  it('dispatches a row-scope click with the row target', async () => {
    const dispatch = vi.fn().mockResolvedValue({ ok: true, description: 'opened' });
    const li = document.createElement('li');
    li.setAttribute('data-thread-id', 'tA');

    const binding: Binding = {
      scope: 'row', modality: 'touch', trigger: { kind: 'click' }, action: 'open-panel',
    };

    await fireBinding(binding, { target: li }, makeCtx(), dispatch);

    expect(dispatch).toHaveBeenCalledWith({
      action: 'open-panel',
      args: expect.objectContaining({ kind: 'thread', threadId: 'tA' }),
      context: expect.any(Object),
    });
  });

  it('prefers selection when non-empty for thread-write actions', async () => {
    const dispatch = vi.fn().mockResolvedValue({ ok: true, description: 'archived' });
    const li = document.createElement('li');
    li.setAttribute('data-thread-id', 'tA');

    const binding: Binding = {
      scope: 'row', modality: 'touch', trigger: { kind: 'click' }, action: 'archive-thread',
    };

    await fireBinding(binding, { target: li }, makeCtx({ selection: ['t1', 't2'] }), dispatch);

    expect(dispatch).toHaveBeenCalledWith({
      action: 'archive-thread',
      args: { targets: ['t1', 't2'] },
      context: expect.any(Object),
    });
  });

  it('skips dispatch when when-predicate fails', async () => {
    const dispatch = vi.fn();
    const binding: Binding = {
      scope: 'document', modality: 'keyboard', trigger: { kind: 'key', combo: 'j' },
      action: 'archive-thread', when: 'mode-idle',
    };
    await fireBinding(binding, { target: document.body }, makeCtx({ mode: 'cmd-k' }), dispatch);
    expect(dispatch).not.toHaveBeenCalled();
  });
});
```

**Step 2: Run — expect FAIL.**

**Step 3: Implement**

```ts
// src/input/fireBinding.ts
import type { ActionResult, Binding, DispatchRequest, ReadonlyContext } from './types';
import { evaluateWhen } from './predicates';
import { targetFromRow, targetsFromSelection } from './helpers';

interface InputEventLike {
  target: Element | null;
}

type DispatchFn = (req: DispatchRequest) => Promise<ActionResult>;

const THREAD_WRITE_ACTIONS = new Set([
  'modify-thread-labels', 'archive-thread', 'delete-thread', 'spam-thread',
  'add-label-thread', 'remove-label-thread', 'snooze-thread', 'unsubscribe-thread',
]);

function resolveArgs(binding: Binding, event: InputEventLike, ctx: ReadonlyContext): Record<string, unknown> {
  // open-panel: thread target derived from the row's data-thread-id
  if (binding.action === 'open-panel') {
    const threadId = targetFromRow(event.target);
    return threadId ? { kind: 'thread', threadId } : {};
  }
  // thread-write actions: prefer non-empty selection over event-derived single target
  if (THREAD_WRITE_ACTIONS.has(binding.action)) {
    if (ctx.selection.length > 0) return { targets: targetsFromSelection(ctx) };
    const t = targetFromRow(event.target);
    return t ? { targets: [t] } : { targets: [] };
  }
  // Layout / app actions take no args from the event.
  return {};
}

export async function fireBinding(
  binding: Binding,
  event: InputEventLike,
  ctx: ReadonlyContext,
  dispatch: DispatchFn,
): Promise<ActionResult | null> {
  if (!evaluateWhen(binding.when, ctx)) return null;
  const args = resolveArgs(binding, event, ctx);
  return dispatch({ action: binding.action, args, context: ctx });
}
```

**Step 4: Run — expect PASS.** Test count: 78 → 81 (+3).

**Step 5: Commit**

```
feat: add fireBinding glue between events and dispatch
```

---

# Milestone B — Stub action handlers

All Gmail-write actions are stubs here. They log + return synthetic `ActionResult` with a symmetric `inverse`. The convenience actions (archive/delete/etc.) construct their inverse from the `modify-thread-labels` semantic — same shape the real implementation will use in Part 2.

## Task 6: `modify-thread-labels` stub + convenience action stubs

**Files:** Create `src/actions/threadWrites.ts` and `src/actions/threadWrites.test.ts`.

**Step 1: Failing test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  modifyThreadLabelsStub, archiveThreadStub, deleteThreadStub, spamThreadStub,
  addLabelThreadStub, removeLabelThreadStub,
} from './threadWrites';
import type { ReadonlyContext } from '../input/types';

const ctx: ReadonlyContext = {
  focusedPanelIndex: 1, focusedPanelKind: 'threadlist', focusedLabel: 'INBOX',
  selection: [], mode: 'idle', signedIn: true,
};

describe('modifyThreadLabelsStub', () => {
  beforeEach(() => vi.spyOn(console, 'info').mockImplementation(() => {}));

  it('logs and returns ok with a symmetric inverse', async () => {
    const result = await modifyThreadLabelsStub(
      { targets: ['t1'], add: ['L1'], remove: ['INBOX'] }, ctx,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.inverse).toEqual({
        action: 'modify-thread-labels',
        args: { targets: ['t1'], add: ['INBOX'], remove: ['L1'] },
        description: expect.any(String),
      });
    }
    expect(console.info).toHaveBeenCalledWith('[stub:modify-thread-labels]', expect.any(Object));
  });

  it('returns ok:false when targets is empty', async () => {
    const result = await modifyThreadLabelsStub({ targets: [], add: ['L1'], remove: [] }, ctx);
    expect(result.ok).toBe(false);
  });
});

describe('archiveThreadStub', () => {
  beforeEach(() => vi.spyOn(console, 'info').mockImplementation(() => {}));

  it("delegates to modify with remove:['INBOX']", async () => {
    const result = await archiveThreadStub({ targets: ['t1', 't2'] }, ctx);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.inverse?.action).toBe('modify-thread-labels');
      expect(result.inverse?.args).toEqual({
        targets: ['t1', 't2'], add: ['INBOX'], remove: [],
      });
    }
  });
});

describe('deleteThreadStub', () => {
  it("delegates to modify with add:['TRASH'], remove:['INBOX']", async () => {
    const result = await deleteThreadStub({ targets: ['t1'] }, ctx);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.inverse?.args).toEqual({
        targets: ['t1'], add: ['INBOX'], remove: ['TRASH'],
      });
    }
  });
});

describe('spamThreadStub', () => {
  it("delegates to modify with add:['SPAM'], remove:['INBOX']", async () => {
    const result = await spamThreadStub({ targets: ['t1'] }, ctx);
    if (result.ok) {
      expect(result.inverse?.args).toEqual({
        targets: ['t1'], add: ['INBOX'], remove: ['SPAM'],
      });
    }
  });
});

describe('addLabelThreadStub', () => {
  it('inverse removes the same label', async () => {
    const result = await addLabelThreadStub({ targets: ['t1'], label: 'idk-inbox/Receipts' }, ctx);
    if (result.ok) {
      expect(result.inverse?.args).toEqual({
        targets: ['t1'], add: [], remove: ['idk-inbox/Receipts'],
      });
    }
  });
});

describe('removeLabelThreadStub', () => {
  it('inverse adds the same label', async () => {
    const result = await removeLabelThreadStub({ targets: ['t1'], label: 'idk-inbox/Receipts' }, ctx);
    if (result.ok) {
      expect(result.inverse?.args).toEqual({
        targets: ['t1'], add: ['idk-inbox/Receipts'], remove: [],
      });
    }
  });
});
```

**Step 2: Run — expect FAIL.**

**Step 3: Implement**

```ts
// src/actions/threadWrites.ts
import type { ActionResult, ReadonlyContext, ThreadRef } from '../input/types';

export interface ModifyArgs { targets: ThreadRef[]; add: string[]; remove: string[]; }
export interface SingleTargetArgs { targets: ThreadRef[]; }
export interface LabelArgs        { targets: ThreadRef[]; label: string; }

function summarize(n: number, verb: string): string {
  return `${verb} ${n} thread${n === 1 ? '' : 's'}`;
}

export async function modifyThreadLabelsStub(args: ModifyArgs, _ctx: ReadonlyContext): Promise<ActionResult> {
  if (args.targets.length === 0) {
    return { ok: false, error: 'No targets specified.' };
  }
  console.info('[stub:modify-thread-labels]', args);
  return {
    ok: true,
    description: summarize(args.targets.length, 'Modified'),
    inverse: {
      action: 'modify-thread-labels',
      args: { targets: args.targets, add: args.remove, remove: args.add },
      description: summarize(args.targets.length, 'Reverted'),
    },
  };
}

async function delegate(action: string, args: ModifyArgs, ctx: ReadonlyContext, verb: string): Promise<ActionResult> {
  if (args.targets.length === 0) return { ok: false, error: 'No targets specified.' };
  console.info(`[stub:${action}]`, args);
  return {
    ok: true,
    description: summarize(args.targets.length, verb),
    inverse: {
      action: 'modify-thread-labels',
      args: { targets: args.targets, add: args.remove, remove: args.add },
      description: summarize(args.targets.length, 'Restored'),
    },
  };
}

export const archiveThreadStub = (args: SingleTargetArgs, ctx: ReadonlyContext) =>
  delegate('archive-thread',
    { targets: args.targets, add: [], remove: ['INBOX'] }, ctx, 'Archived');

export const deleteThreadStub = (args: SingleTargetArgs, ctx: ReadonlyContext) =>
  delegate('delete-thread',
    { targets: args.targets, add: ['TRASH'], remove: ['INBOX'] }, ctx, 'Deleted');

export const spamThreadStub = (args: SingleTargetArgs, ctx: ReadonlyContext) =>
  delegate('spam-thread',
    { targets: args.targets, add: ['SPAM'], remove: ['INBOX'] }, ctx, 'Marked as spam');

export const addLabelThreadStub = (args: LabelArgs, ctx: ReadonlyContext) =>
  delegate('add-label-thread',
    { targets: args.targets, add: [args.label], remove: [] }, ctx, `Labelled with ${args.label}`);

export const removeLabelThreadStub = (args: LabelArgs, ctx: ReadonlyContext) =>
  delegate('remove-label-thread',
    { targets: args.targets, add: [], remove: [args.label] }, ctx, `Removed ${args.label}`);
```

**Step 4: Run — expect PASS.** Test count: 81 → ~89.

**Step 5: Commit**

```
feat: add modify-thread-labels stub and convenience action stubs
```

---

## Task 7: `snoozeThreadStub` + `unsubscribeThreadStub`

**Files:** Append to `src/actions/threadWrites.ts` and `src/actions/threadWrites.test.ts`.

**Step 1: Failing tests** (append to existing test file)

```ts
describe('snoozeThreadStub', () => {
  it('returns ok:false when until is missing (elicit-via picker)', async () => {
    const result = await snoozeThreadStub({ targets: ['t1'] } as any, ctx);
    expect(result.ok).toBe(false);
  });

  it('adds the snoozed labels and removes INBOX, with symmetric inverse', async () => {
    const result = await snoozeThreadStub(
      { targets: ['t1'], until: '2026-06-01T09:00:00Z' }, ctx,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.inverse?.args).toEqual({
        targets: ['t1'],
        add: ['INBOX'],
        remove: ['idk-inbox/Snoozed', 'idk-inbox/Snoozed/2026-06-01T09:00:00Z'],
      });
    }
  });
});

describe('unsubscribeThreadStub', () => {
  it('logs and returns ok with no inverse (cannot un-unsubscribe)', async () => {
    const result = await unsubscribeThreadStub({ targets: ['t1'] }, ctx);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.inverse).toBeUndefined();
    }
  });

  it('returns ok:false when targets empty', async () => {
    const result = await unsubscribeThreadStub({ targets: [] }, ctx);
    expect(result.ok).toBe(false);
  });
});
```

**Step 2: Run — expect FAIL.**

**Step 3: Append to `threadWrites.ts`**

```ts
export interface SnoozeArgs { targets: ThreadRef[]; until?: string; }

export const snoozeThreadStub = async (args: SnoozeArgs, _ctx: ReadonlyContext): Promise<ActionResult> => {
  if (args.targets.length === 0) return { ok: false, error: 'No targets specified.' };
  if (!args.until) return { ok: false, error: 'Snooze duration required.' };
  console.info('[stub:snooze-thread]', args);
  const subLabel = `idk-inbox/Snoozed/${args.until}`;
  return {
    ok: true,
    description: summarize(args.targets.length, 'Snoozed'),
    inverse: {
      action: 'modify-thread-labels',
      args: {
        targets: args.targets,
        add: ['INBOX'],
        remove: ['idk-inbox/Snoozed', subLabel],
      },
      description: summarize(args.targets.length, 'Unsnoozed'),
    },
  };
};

export const unsubscribeThreadStub = async (args: SingleTargetArgs, _ctx: ReadonlyContext): Promise<ActionResult> => {
  if (args.targets.length === 0) return { ok: false, error: 'No targets specified.' };
  console.info('[stub:unsubscribe-thread]', args);
  return {
    ok: true,
    description: summarize(args.targets.length, 'Unsubscribed from'),
    // No inverse — unsubscribe is not reversible.
  };
};
```

**Step 4: Run — expect PASS.** Test count grows by 4.

**Step 5: Commit**

```
feat: add snooze and unsubscribe action stubs
```

---

## Task 8: Selection-mode action stubs

**Files:** Create `src/actions/selection.ts` and `src/actions/selection.test.ts`.

These actions are *not* stubs in the same sense — they mutate React state (selection / mode), which is real. But they don't touch Gmail, so they fit naturally in this milestone. Their implementations need access to setters; this task defines the *interfaces* + a factory that takes setters and returns the action handlers.

**Step 1: Failing test**

```ts
import { describe, it, expect, vi } from 'vitest';
import { createSelectionActions } from './selection';
import type { ReadonlyContext } from '../input/types';

const ctx: ReadonlyContext = {
  focusedPanelIndex: 1, focusedPanelKind: 'threadlist', focusedLabel: 'INBOX',
  selection: ['t1', 't2'], mode: 'selecting', signedIn: true,
};

describe('createSelectionActions', () => {
  it('enter-selection sets mode to selecting and optionally adds the initial target', async () => {
    const setMode = vi.fn();
    const setSelection = vi.fn();
    const actions = createSelectionActions({ setMode, setSelection });
    await actions.enterSelection({ initialTarget: 'tA' }, ctx);
    expect(setMode).toHaveBeenCalledWith('selecting');
    expect(setSelection).toHaveBeenCalledWith(['tA']);
  });

  it('exit-selection resets mode and clears selection', async () => {
    const setMode = vi.fn();
    const setSelection = vi.fn();
    const actions = createSelectionActions({ setMode, setSelection });
    await actions.exitSelection({}, ctx);
    expect(setMode).toHaveBeenCalledWith('idle');
    expect(setSelection).toHaveBeenCalledWith([]);
  });

  it('toggle-selection toggles a target', async () => {
    const setSelection = vi.fn();
    const actions = createSelectionActions({ setMode: vi.fn(), setSelection });
    await actions.toggleSelection({ target: 't1' }, ctx);
    // ctx already had t1 — toggling removes it
    expect(setSelection).toHaveBeenCalledWith(['t2']);

    await actions.toggleSelection({ target: 't3' }, ctx);
    expect(setSelection).toHaveBeenCalledWith(['t1', 't2', 't3']);
  });
});
```

**Step 2: Run — expect FAIL.**

**Step 3: Implement**

```ts
// src/actions/selection.ts
import type { ActionResult, Mode, ReadonlyContext, ThreadRef } from '../input/types';

interface Setters {
  setMode:      (m: Mode) => void;
  setSelection: (s: ThreadRef[]) => void;
}

export function createSelectionActions(s: Setters) {
  return {
    enterSelection: async (
      args: { initialTarget?: ThreadRef },
      _ctx: ReadonlyContext,
    ): Promise<ActionResult> => {
      s.setMode('selecting');
      s.setSelection(args.initialTarget ? [args.initialTarget] : []);
      return { ok: true, description: 'Entered selection mode' };
    },

    exitSelection: async (_args: Record<string, unknown>, _ctx: ReadonlyContext): Promise<ActionResult> => {
      s.setMode('idle');
      s.setSelection([]);
      return { ok: true, description: 'Exited selection mode' };
    },

    toggleSelection: async (
      args: { target: ThreadRef },
      ctx: ReadonlyContext,
    ): Promise<ActionResult> => {
      const exists = ctx.selection.includes(args.target);
      const next   = exists
        ? ctx.selection.filter((t) => t !== args.target)
        : [...ctx.selection, args.target];
      s.setSelection(next);
      return { ok: true, description: exists ? 'Deselected' : 'Selected' };
    },
  };
}
```

**Step 4: Run — expect PASS.**

**Step 5: Commit**

```
feat: add selection-mode action factory
```

---

# Milestone C — Provider + state + real layout actions

## Task 9: `DispatchProvider` scaffold

**Files:** Create `src/state/DispatchProvider.tsx`, `src/state/useDispatch.ts`, `src/state/DispatchProvider.test.tsx`.

The provider owns selection / mode / undo state and exposes (a) the readonly context, (b) the dispatcher (built from a per-render action registry).

**Step 1: Failing test**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { DispatchProvider } from './DispatchProvider';
import { useDispatchContext } from './useDispatch';

function Probe() {
  const ctx = useDispatchContext();
  return <div data-testid="mode">{ctx.mode}</div>;
}

describe('DispatchProvider', () => {
  it('provides initial context with mode=idle and empty selection', () => {
    render(<DispatchProvider><Probe /></DispatchProvider>);
    expect(screen.getByTestId('mode').textContent).toBe('idle');
  });
});
```

**Step 2: Run — expect FAIL.**

**Step 3: Implement scaffolding**

```tsx
// src/state/DispatchProvider.tsx
import { createContext, useMemo, useState, type ReactNode } from 'react';
import type { Mode, ReadonlyContext, ThreadRef, DispatchRequest, ActionResult } from '../input/types';

const noopDispatcher = async (_req: DispatchRequest): Promise<ActionResult> => ({
  ok: false, error: 'Dispatcher not initialised.',
});

export const DispatchContext  = createContext<ReadonlyContext | null>(null);
export const DispatcherContext = createContext<(req: DispatchRequest) => Promise<ActionResult>>(noopDispatcher);

export function DispatchProvider({ children, signedIn = false }: { children: ReactNode; signedIn?: boolean }) {
  const [selection, setSelection] = useState<ThreadRef[]>([]);
  const [mode, setMode]           = useState<Mode>('idle');

  // Layout/undo state added in later tasks.

  const ctx: ReadonlyContext = useMemo(() => ({
    focusedPanelIndex: 1,
    focusedPanelKind:  'threadlist',
    focusedLabel:      'INBOX',
    selection,
    mode,
    signedIn,
  }), [selection, mode, signedIn]);

  // Dispatcher wired in task 12 once the registry is built.
  const dispatcher = noopDispatcher;

  return (
    <DispatchContext.Provider value={ctx}>
      <DispatcherContext.Provider value={dispatcher}>
        {children}
      </DispatcherContext.Provider>
    </DispatchContext.Provider>
  );
}
```

```ts
// src/state/useDispatch.ts
import { useContext } from 'react';
import { DispatchContext, DispatcherContext } from './DispatchProvider';

export function useDispatchContext() {
  const ctx = useContext(DispatchContext);
  if (!ctx) throw new Error('useDispatchContext called outside <DispatchProvider>.');
  return ctx;
}

export function useDispatcher() {
  return useContext(DispatcherContext);
}
```

**Step 4: Run — expect PASS.**

**Step 5: Commit**

```
feat: add DispatchProvider scaffold
```

---

## Task 10: Undo stack inside the provider

**Files:** Extend `src/state/DispatchProvider.tsx` and add `src/state/DispatchProvider.test.tsx` cases.

Add `undoStack` and `redoStack` to the provider; expose helpers for the dispatcher (added in task 12) to push, pop, and clear.

**Step 1: Failing test**

```tsx
import { useUndoState } from './useDispatch';
import { renderHook, act } from '@testing-library/react';
import type { UndoEntry } from '../input/types';

describe('undo stack', () => {
  it('starts empty', () => {
    const { result } = renderHook(() => useUndoState(), { wrapper: ({ children }) => <DispatchProvider>{children}</DispatchProvider> });
    expect(result.current.undoDepth).toBe(0);
    expect(result.current.redoDepth).toBe(0);
  });

  it('pushes an entry and grows the undo stack', () => {
    const { result } = renderHook(() => useUndoState(), { wrapper: ({ children }) => <DispatchProvider>{children}</DispatchProvider> });
    act(() => {
      result.current.pushUndo({
        original: { action: 'archive-thread', args: { targets: ['t1'] }, description: 'Archived 1 thread' },
        inverse:  { action: 'modify-thread-labels', args: { targets: ['t1'], add: ['INBOX'], remove: [] }, description: 'Restored' },
      } as UndoEntry);
    });
    expect(result.current.undoDepth).toBe(1);
  });
});
```

**Step 2: Add the `UndoEntry` type** in `src/input/types.ts`:

```ts
export interface UndoEntry {
  original: { action: ActionId; args: Record<string, unknown>; description: string };
  inverse:  ActionInverse;
}
```

**Step 3: Implement** — add `undoStack` / `redoStack` state in `DispatchProvider`, expose `pushUndo` / `popUndo` / `pushRedo` / `popRedo` / `clearStacks` via a third React context. Add `useUndoState()` to `useDispatch.ts`. Code in the plan's design doc shape.

**Step 4: Run — expect PASS.**

**Step 5: Commit**

```
feat: add undo/redo stacks to DispatchProvider
```

---

## Task 11: Layout state moved into the provider

**Files:** Modify `src/state/DispatchProvider.tsx`, `src/state/useDispatch.ts`. Refactor `src/layout/LayoutContainer.tsx` to read from the provider instead of owning state. Tests updated accordingly.

The provider now owns `panels: Panel[]` and `focusIndex: number`. `LayoutContainer` becomes a renderer; layout actions in the next task call provider setters.

**Step 1: Test the provider's layout state shape** (`src/state/DispatchProvider.test.tsx`):

```tsx
it('exposes initialPanels via context and panels can be read by a child', () => {
  function Probe() {
    const { layoutState } = useLayoutState();
    return <div data-testid="count">{layoutState.panels.length}</div>;
  }
  render(
    <DispatchProvider initialPanels={[{kind:'settings'}, {kind:'threadlist', label:'INBOX'}]}>
      <Probe />
    </DispatchProvider>
  );
  expect(screen.getByTestId('count').textContent).toBe('2');
});
```

**Step 2: Add layout state + setters to the provider**

```ts
const [panels, setPanels]         = useState<Panel[]>(initialPanels);
const [focusIndex, setFocusIndex] = useState<number>(/* default = first non-settings */);
```

Plus expose layout-mutating callbacks (open / close / nav-prev / nav-next / refresh-counter).

**Step 3: Refactor `LayoutContainer`** to consume `panels`, `focusIndex` from the provider via `useLayoutState()`. Drop its internal state and `openThread`/`closeAt`/`focusForward`/`focusBackward` callbacks; the new path is dispatch-driven (wired in next task).

**Step 4: All existing tests** for `LayoutContainer.test.tsx` still need to pass — they may need to be wrapped in `<DispatchProvider initialPanels={initial}>` and assertions adjusted slightly. Update them so the suite stays green.

**Step 5: Run — expect PASS** (60 baseline + new tests; net should be similar).

**Step 6: Commit**

```
refactor: move layout state into DispatchProvider
```

---

## Task 12: Layout / app / undo action handlers (real) + wire the dispatcher

**Files:** Create `src/actions/layout.ts`, `src/actions/app.ts`, `src/actions/registry.ts`. Modify `src/state/DispatchProvider.tsx` to build the action registry and the dispatcher each render.

This is the largest task in the plan. Tests verify each handler in isolation (with mocked setters), plus a smoke test that the provider's dispatcher routes correctly.

**Step 1: Failing tests** — write `src/actions/layout.test.ts` covering:

- `openPanel` calls `setPanels` with the new panel inserted after the source threadlist.
- `closePanel` calls `setPanels` minus the indexed panel + decrements focusIndex when needed.
- `navPanelPrev` clamps at 0.
- `navPanelNext` clamps at panels.length-1.
- `refreshPanel` increments a `refreshCounter` for the focused panel.

Plus `src/actions/app.test.ts`:

- `signIn`/`signOut` call their respective auth callbacks + clear undo stacks on sign-out.
- `undo` pops the undo stack and dispatches the inverse; `redo` pops the redo stack and re-dispatches the original.
- `openCommandPalette` sets mode to `cmd-k`.
- `exitMode` resets mode to `idle` from any picker / cmd-k / selecting state.

**Step 2: Run — expect FAIL.**

**Step 3: Implement** — each handler is small (5–15 lines) and takes its setters via factory:

```ts
// src/actions/layout.ts
import type { ActionResult, ReadonlyContext, ThreadRef } from '../input/types';
import { openThread, closeAt } from '../layout/operations';
import type { Panel } from '../layout/types';

interface Setters {
  setPanels: (updater: (p: Panel[]) => Panel[]) => void;
  setFocusIndex: (updater: (i: number) => number) => void;
  bumpRefresh: (panelKey: string) => void;
  getPanels: () => Panel[];
  getFocusIndex: () => number;
}

export function createLayoutActions(s: Setters) {
  return {
    openPanel: async (args: { kind: 'thread'; threadId: ThreadRef }, ctx: ReadonlyContext): Promise<ActionResult> => {
      const sourceLabel = ctx.focusedLabel ?? 'INBOX';
      s.setPanels((p) => openThread(p, sourceLabel, args.threadId));
      // Focus follows the new thread. (Index computation lives in the closure
      // returned by setPanels — simpler: bump focusIndex to source idx + 1.)
      return { ok: true, description: `Opened thread ${args.threadId}` };
    },

    closePanel: async (args: { panelIndex: number }, _ctx: ReadonlyContext): Promise<ActionResult> => {
      s.setPanels((p) => closeAt(p, args.panelIndex));
      s.setFocusIndex((i) => Math.max(0, i > args.panelIndex ? i - 1 : i));
      return { ok: true, description: 'Closed panel' };
    },

    navPanelPrev: async (_args: Record<string, unknown>, _ctx: ReadonlyContext): Promise<ActionResult> => {
      s.setFocusIndex((i) => Math.max(0, i - 1));
      return { ok: true, description: 'Previous panel' };
    },

    navPanelNext: async (_args: Record<string, unknown>, _ctx: ReadonlyContext): Promise<ActionResult> => {
      s.setFocusIndex((i) => Math.min(s.getPanels().length - 1, i + 1));
      return { ok: true, description: 'Next panel' };
    },

    refreshPanel: async (_args: Record<string, unknown>, ctx: ReadonlyContext): Promise<ActionResult> => {
      const key = ctx.focusedLabel ?? `idx:${ctx.focusedPanelIndex}`;
      s.bumpRefresh(key);
      return { ok: true, description: 'Refreshed' };
    },
  };
}
```

Likewise `createAppActions` for `signIn`, `signOut`, `undo`, `redo`, `openCommandPalette`, `exitMode`.

**Step 4: Build the registry inside `DispatchProvider`**

```tsx
const registry: ActionRegistry = useMemo(() => ({
  // Gmail-write stubs:
  'modify-thread-labels': asAction('modify-thread-labels', 'Modify labels', 'thread-write', modifyThreadLabelsStub, true),
  'archive-thread':       asAction('archive-thread', 'Archive', 'thread-write', archiveThreadStub, true),
  // ... all of them ...

  // Real layout / app actions:
  'open-panel':           asAction('open-panel', 'Open', 'layout', layoutActions.openPanel),
  'close-panel':          asAction('close-panel', 'Close', 'layout', layoutActions.closePanel),
  // ... etc ...

  // Selection + undo + app actions:
  'enter-selection':      asAction('enter-selection', 'Select', 'selection', selectionActions.enterSelection),
  'exit-selection':       asAction('exit-selection', 'Exit selection', 'selection', selectionActions.exitSelection),
  'toggle-selection':     asAction('toggle-selection', 'Toggle selection', 'selection', selectionActions.toggleSelection),
  'undo':                 asAction('undo', 'Undo', 'app', appActions.undo),
  'redo':                 asAction('redo', 'Redo', 'app', appActions.redo),
  'open-command-palette': asAction('open-command-palette', 'Command palette', 'app', appActions.openCommandPalette),
  'exit-mode':            asAction('exit-mode', 'Cancel', 'app', appActions.exitMode),
  'sign-in':              asAction('sign-in', 'Sign in', 'app', appActions.signIn),
  'sign-out':             asAction('sign-out', 'Sign out', 'app', appActions.signOut),
}), [/* deps */]);

const dispatcher = useMemo(() => {
  const inner = createDispatcher(registry);
  // Wrap to push successful inverses onto the undo stack.
  return async (req: DispatchRequest) => {
    const result = await inner(req);
    if (result.ok && result.inverse) {
      pushUndo({ original: { action: req.action, args: req.args, description: result.description }, inverse: result.inverse });
    }
    return result;
  };
}, [registry, pushUndo]);
```

**Step 5: Run — expect PASS.**

**Step 6: Commit**

```
feat: real layout/app actions and dispatcher wiring in DispatchProvider
```

---

# Milestone D — Bindings + detection

## Task 13: `useGesture` hook

**Files:** Create `src/input/useGesture.ts` and `src/input/useGesture.test.tsx`.

Pointer-event handling for swipe, click, long-press. Overscroll-bottom handled separately because it ties to `onScroll` instead of pointer events.

**Step 1: Failing test** — render a div with the hook attached; simulate pointerdown → pointermove → pointerup; assert `onSwipe` called with the right `direction` + `dx`.

**Step 2: Run — expect FAIL.**

**Step 3: Implement** — pointer-state machine that:
- on `pointerdown` records start.
- on `pointerup` computes `dx`/`dy`/`dt`, picks direction by magnitude, calls `onSwipe` if past threshold or `onClick` if not.
- `pointercancel` clears state.
- A separate `setTimeout` for long-press, cancelled on movement past ~10px or pointerup.

For overscroll, a sibling hook `useOverscroll(ref, opts)` listens to `wheel` + `touchmove` after the body has scrolled to `scrollHeight`. Implementation deferred to task 23.

**Step 4: Run — expect PASS.**

**Step 5: Commit**

```
feat: add useGesture pointer-event hook
```

---

## Task 14: `useGestureBindings` hook + default bindings

**Files:** Create `src/input/useGestureBindings.ts`, `src/input/defaultBindings.ts`, and tests for each.

`useGestureBindings(scope, ref)` calls `useGesture(...)` internally, looks up the binding registry for matching bindings, evaluates `when`, and calls `fireBinding`.

**Step 1: Failing test** — render an `<li data-thread-id="tA">` with `useGestureBindings('row', ref)`. Simulate a click. Assert the provider's dispatcher was called with `open-panel`.

**Step 2: Implement** — straightforward composition over `useGesture`, with the registry pulled from `defaultBindings.ts`.

**Step 3: Default bindings** — the constant from the design doc, ~20 entries.

**Step 4: Run — expect PASS.**

**Step 5: Commit**

```
feat: add useGestureBindings and default binding set
```

---

## Task 15: Document-level keyboard handler

**Files:** Create `src/input/useDocumentKeyboard.ts` and test.

A hook called once at the app root; attaches a `keydown` listener to `document`, looks up keyboard bindings, evaluates `when`, calls `fireBinding`.

**Step 1: Failing test** — render `<DispatchProvider><Probe/></DispatchProvider>` where `Probe` uses the hook; dispatch a `keydown` event for `j`; assert the dispatcher fired `archive-thread`.

**Step 2: Implement** — translate `KeyboardEvent` → combo string (e.g. `'mod+k'`), match bindings.

**Step 3: Run — expect PASS.**

**Step 4: Commit**

```
feat: add document-level keyboard handler hook
```

---

## Task 16: Action catalog metadata

**Files:** Create `src/actions/catalog.ts`.

A plain data table describing each registered action: id, label, category, destructive, elicitVia, previewFor (optional). Consumed by the Cmd-K palette and any future settings UI.

```ts
export const ACTION_CATALOG: ActionCatalogEntry[] = [
  { id: 'archive-thread', label: 'Archive', category: 'thread-write', requiresAuth: true,
    previewFor: (ctx) => ctx.selection.length > 0 ? `Archive ${ctx.selection.length} selected` : 'Archive this thread' },
  // ... etc
];
```

**Tests:** snapshot the catalog ordering + assert no duplicate IDs.

**Commit:** `feat: add action catalog metadata`

---

# Milestone E — UI surfaces

## Task 17: `SnoozePicker`

**Files:** `src/pickers/SnoozePicker.tsx` + test.

Modal that appears when `mode === 'picker-snooze'`. Buttons: Later today, Tomorrow, This weekend, Next week, Custom. On selection, computes `until` and dispatches `snooze-thread({ targets, until })` with `targets` pulled from the pending request (stored in provider state when the picker opened).

**Test:** render → click "Tomorrow" → assert dispatcher called with right action + args.

**Commit:** `feat: add SnoozePicker`

---

## Task 18: `LabelPicker`

**Files:** `src/pickers/LabelPicker.tsx` + test.

Modal that lists existing `idk-inbox/<sublabel>`s and offers an input for a new sublabel. On selection, dispatches `add-label-thread({ targets, label })`.

**Commit:** `feat: add LabelPicker`

---

## Task 19: `CommandPalette`

**Files:** `src/palette/CommandPalette.tsx` + test.

Modal that opens when `mode === 'cmd-k'`. Fuzzy filter over `ACTION_CATALOG`, gated by `evaluateWhen(action.when, ctx)`. Each row shows label + previewFor + bound shortcut. Enter dispatches.

For Part 1, "fuzzy" is `label.toLowerCase().includes(query.toLowerCase())`. Real fuzzy is YAGNI.

**Commit:** `feat: add CommandPalette`

---

## Task 20: `UndoToast`

**Files:** `src/feedback/UndoToast.tsx` + test.

Reads the top of the undo stack; shows description + Undo button; auto-dismisses after 6s.

**Commit:** `feat: add UndoToast`

---

# Milestone F — Wire into existing panels

## Task 21: ThreadlistPanel rows use `useGestureBindings`

**Files:** Modify `src/panels/ThreadlistPanel.tsx` + its test.

Replace the row's `onClick={() => onOpenThread(label, e.threadId)}` with a per-row `useGestureBindings('row', ref)` setup. Add `data-thread-id` to each `<li>`. Drop the `onOpenThread` prop from the panel's interface — now dispatched.

Multi-select: long-press → `enter-selection({ initialTarget: threadId })`. Tap in selecting mode → `toggle-selection({ target: threadId })`. Both flow through bindings — the binding's `when` distinguishes.

Existing 5 tests update to wrap with `DispatchProvider`. New tests cover swipe → dispatch and long-press → enter-selection.

**Commit:** `feat: ThreadlistPanel rows use gesture bindings`

---

## Task 22: PanelHeader binding wiring

**Files:** Modify `src/layout/PanelHeader.tsx`. Drop the `onSwipeLeft`/`onSwipeRight` props; use `useGestureBindings('panel-header', ref)` instead.

Update consumers (`SettingsPanel`, `ThreadlistPanel`, `ThreadPanel`) to remove the swipe-prop passthrough. App.tsx no longer needs to pass these via `PanelRenderProps` either — `LayoutContainer` can simplify.

**Commit:** `refactor: PanelHeader uses gesture bindings instead of props`

---

## Task 23: ThreadPanel overscroll-close, StashColumn integration, App.tsx wiring

**Files:** Modify `src/panels/ThreadPanel.tsx`, `src/layout/LayoutContainer.tsx`, `src/App.tsx`. Add `src/input/useOverscroll.ts` + test.

- `useOverscroll(ref, { edge: 'bottom', minPx: 80 })` — listens to wheel + touchmove, fires when overscroll past threshold detected.
- `ThreadPanel` body wraps the message list in a ref with the overscroll hook firing `close-panel({ panelIndex })`.
- `LayoutContainer` renders `<StashColumn>` on either side, with count derived from focused index vs total panels (left = focusIndex, right = panels.length - focusIndex - 1 for single-panel mobile; more sophisticated derivation for wide-screen later).
- `App.tsx` wraps the layout in `<DispatchProvider initialPanels={INITIAL_PANELS} signedIn={signedIn}>`.

**Commit:** `feat: ThreadPanel overscroll-close + StashColumn integration + App wrap`

---

# Milestone G — Build verification

## Task 24: Production build verification

Run:
- `npm test` — all pass.
- `npm run build` — clean.
- `npm run lint` — clean.

Report the dist/ listing. No commit unless config changed.

---

# Milestone H — Manual checkpoints (HUMAN)

## Task 25: Checkpoint 1 — scaffolding-stub manual verification

**Human runs the dev server and exercises the full UI:**

1. `cd .worktrees/phase-0c-input-model && nvm use && npm install && npm run dev`.
2. Sign in. Verify Inbox loads (from Phase 0b — should still work).
3. **Tap a row** → thread opens. *(Real layout action — should work.)*
4. **Swipe a row right (partial)** → toast says "Archived 1 thread — Undo". Console shows `[stub:archive-thread]`. *(Stub — no actual archive.)*
5. **Swipe right past edge** → toast "Deleted 1 thread". Console `[stub:delete-thread]`.
6. **Swipe left** → snooze picker opens. Pick "Tomorrow". Toast "Snoozed 1 thread". Console `[stub:snooze-thread] {targets: [...], until: '...'}`.
7. **Tap Undo on the toast** → console shows `[stub:modify-thread-labels]` with the inverse args.
8. **Long-press a row** → enters selection mode. Tap more rows. Toast "Selected" / "Deselected". Top of screen shows "N selected" *(if implemented in toast/header; otherwise skip)*.
9. **Press `J` while a row is focused** → `[stub:archive-thread]`.
10. **Press `Mod+K`** → command palette opens. Type "arch" → "Archive" filters. Enter → `[stub:archive-thread]`.
11. **Press `Mod+Z`** → toast "Undid …" + console shows inverse modify.
12. **Sign out** → undo stack clears, layout returns to signed-out.
13. **Header swipe between Settings / Inbox / Snoozed** → focus shifts, scroll-snap animates.

The human reports back: does the wiring feel right? Any actions that don't fire when expected, or fire wrong? Any latency or weirdness?

**If satisfactory → Checkpoint 2.**

## Task 26: Checkpoint 2 — ergonomics of adding new bindings

**Human exercise:**

1. Add a new keyboard shortcut. E.g. `a` also archives. Edit `src/input/defaultBindings.ts`, add:
   ```ts
   { scope: 'document', modality: 'keyboard', trigger: { kind: 'key', combo: 'a' }, action: 'archive-thread', when: 'mode-idle' },
   ```
   Reload. Press `a` in the inbox. Console `[stub:archive-thread]`.

2. Add a new gesture. E.g. swipe-up on a row also opens the thread. Add:
   ```ts
   { scope: 'row', modality: 'touch', trigger: { kind: 'swipe', direction: 'up', minPx: 60 }, action: 'open-panel' },
   ```
   Reload. Swipe up on a row. Thread opens.

The human reports back on ergonomics: how many lines did it take? Did anything else need touching? Is the data shape obvious?

**If satisfactory → write Part 2** (replace stub handlers with real Gmail calls; final review; merge).

---

## Definition of Done — Part 1

- All stub handlers log + return synthetic `ActionResult`s with correct inverse shapes.
- All layout / app / undo / selection / mode actions are real and work end-to-end.
- Row swipes, header swipes, taps, long-press, keyboard shortcuts, Cmd-K, pickers, undo toast — all wired and visible.
- The `default bindings` file is the single source of truth; adding a binding is one record.
- ~30+ new tests pass; total suite ~90+. Build + lint clean.
- Checkpoints 1 and 2 reported satisfactory by the human.

## Deferred to Part 2 (a future plan)

- Real Gmail API calls inside `modifyThreadLabels`. The convenience actions don't change.
- Real `unsubscribeThread` (List-Unsubscribe header handling).
- Optimistic UI for thread-write actions in `ThreadlistPanel` (remove row immediately, restore on failure).
- Multi-select bulk actions on selection (rule out edge cases when selection spans labels).
- Final whole-branch code review + squash-merge to `main`.
- Any ergonomics fixes from Checkpoint 2 feedback.
- StashColumn slice visualization (count badge + bulk click is sufficient for Part 1).
- AbortController on in-flight `fetchThread` (the Phase 0b leftover).
