# Phase 0c — Unified Input Model + Row Actions — Design

**Date:** 2026-05-25
**Status:** Validated design, ready for implementation planning
**Builds on:** Phase 0b layout (`docs/plans/2026-05-23-phase-0b-layout-design.md`)
**Project design doc:** `docs/plans/2026-05-16-inbox-zero-design.md`

**Phase numbering note:** What was previously called "Phase 0c" in earlier planning (Sheet + Apps Script + behavior logging) is renumbered Phase 0d. This phase — the unified input model and the Gmail-write actions that make rows interactive — sits between 0b and 0d.

## Summary

Stand up a single input/action layer that maps **touch gestures, mouse events, keyboard events, and buttons** onto the same vocabulary of typed action calls. The same `archive` happens whether you swiped a row, clicked a context-menu button, pressed `J`, or fired it from the Cmd-K palette. Implement the Gmail-write actions the layer is for (archive, trash, spam, unsubscribe, label add/remove, snooze). Add the undo/redo stack, the snooze duration picker, and the command palette.

## Guiding principles

- **Data + pure functions, no classes.** Actions are exported async functions with explicit typed args. Bindings, triggers, and predicates are serializable data. Dispatch is a pure function. No `this`, no mutable instance state.
- **Explicit argument passing.** Targets are derived by named helpers from the event itself, not pulled out of an ambient `hoveredThread` context field. The action interface declares what it needs; the call site supplies it.
- **One action vocabulary for every modality.** Cmd-K, gestures, shortcuts, and buttons all dispatch the same action with the same arg shape. The differences live in *how the args get assembled*, not in *what action ran*.
- **YAGNI on input customization.** v1 ships with a fixed default binding set in code. User-editable bindings persist in the Sheet datastore in Phase 0d. v1 is data-shaped to make v2 a straight read-from-Sheet swap with no refactor.
- **Read-only is over.** This phase introduces the first Gmail *writes*, scoped to `gmail.modify` (already in the consent screen's scopes).

## Scope

**In:**
- The input architecture: action registry, binding registry, predicate registry, dispatcher, gesture-detection hook.
- The Gmail-write primitive `modifyThreadLabels` plus the convenience actions that wrap it (archive, delete, spam, snooze, add-label, remove-label).
- The `unsubscribeThread` action (uses `List-Unsubscribe` header; not a label modification).
- Row swipe gestures (graduated archive → trash on right swipe, snooze on left swipe).
- Tap-to-open already exists from Phase 0b; this phase just folds it into the unified vocabulary.
- The snooze duration picker (later today / tomorrow / weekend / next week / custom).
- The label-picker (apply or remove an `InboxZero/<sublabel>`; arbitrary user-typed sublabel allowed).
- The undo/redo stack with a toast affordance.
- The Cmd-K command palette: fuzzy search, context preview, eligibility filtering.
- Mouse-driven panel-nav buttons (the affordance Phase 0b explicitly deferred).
- Keyboard shortcuts for the most common actions.
- Multi-select mode + selection-targeted actions.

**Out (deferred to Phase 0d):**
- Sheet datastore, Apps Script project, behavior logging.
- User-editable binding overrides persisted to the Sheet.
- Reply / forward / compose. (Still later.)
- AI concierge, rule engine, snooze backoff scheduling. (Phase 1+.)

## Decisions locked in

| Topic | Decision |
|---|---|
| Action shape | Pure async functions, explicit typed args. ~17 entries. |
| Argument resolution | Named pure helpers, called from the event handler. Never from an ambient "hovered" context state. |
| Bindings | Plain serializable data: `{ scope, modality, trigger, action, when? }`. |
| `trigger` representation | Tagged union (`key | click | long-press | swipe | overscroll`) with `stages` on swipe for graduated targets. |
| `when` conditions | Reference `PredicateId` strings (single or array-AND). Predicates registered as pure functions in a separate registry. |
| Scopes | Closed enum: `row`, `panel-header`, `panel-body`, `document`. Add only when a binding genuinely needs a new one. |
| Dispatcher | Pure function over `(binding, event, readonly context)`. No mutable state inside dispatch. |
| Snooze | A convenience action over `modifyThreadLabels` adding `InboxZero/Snoozed` + `InboxZero/Snoozed/<iso>` and removing `INBOX`. No scheduler yet (lives in Phase 0d). |
| Gmail-write primitive | `modifyThreadLabels({ targets, add, remove })`. All label-mutating actions delegate to it for free inverse. |
| Undo/redo | Single global stack of inverses. Each `ActionResult.inverse` is itself `{ action, args }`. `undo` pops + dispatches. `redo` re-pushes. |
| Gesture detection | A `useGesture(scope, ref, options)` React hook attaches pointer listeners to specific elements. Document-level for keyboard. |
| Cmd-K | Always-on `Mod+K`. Fuzzy search. Lists actions whose `when` passes. Context preview. Enter dispatches. |
| Selection / mode | React state hoisted to `LayoutContainer` (or a sibling provider). Flows into the readonly dispatcher context. |
| Storage | v1 hardcoded constants. v2 (Phase 0d) Sheet-tab JSON overrides. |

## Architecture

```
                    ┌──────────────────┐
                    │  Action registry │  (id → pure async fn)
                    └──────────────────┘
                              ▲
                              │ looked up by id
                              │
┌──────────────────┐    ┌─────┴─────────┐    ┌─────────────────────┐
│ Binding registry │───▶│  Dispatcher   │◀───│ Predicate registry  │
│   (plain data)   │    │ (pure fn)     │    │  (pure ctx → bool)  │
└──────────────────┘    └─────┬─────────┘    └─────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
   useGesture hook       document-level         Action buttons
   (touch/mouse on        keyboard handler      (call dispatch
    scoped elements)      (Cmd-K, hotkeys)      directly)
        │                     │                     │
        ▼                     ▼                     ▼
        ─────────── event objects flow in ──────────
```

**No closures stored anywhere.** All five boxes are data + pure functions. State (selection, mode, focused-panel) lives in React; the dispatcher receives a readonly snapshot.

## Type definitions

```ts
// ----- IDs are strings; uniqueness enforced by the registries -----

type ActionId    = string;
type PredicateId = string;
type Scope       = 'row' | 'panel-header' | 'panel-body' | 'document';
type Modality    = 'touch' | 'mouse' | 'keyboard';

// ----- Trigger: tagged union, fully serializable -----

type Trigger =
  | { kind: 'key';         combo: string }                          // 'mod+k', 'j', 'esc'
  | { kind: 'click' }
  | { kind: 'long-press';  ms: number }
  | { kind: 'swipe';       direction: 'left'|'right'|'up'|'down';
                           minPx: number;
                           stages?: Array<{ minPx: number; action: ActionId }> }
  | { kind: 'overscroll';  edge: 'top'|'bottom'; minPx: number };

// ----- Binding: plain data -----

interface Binding {
  scope:    Scope;
  modality: Modality;
  trigger:  Trigger;
  action:   ActionId;
  when?:    PredicateId | PredicateId[];   // array = AND
}

// ----- Context: readonly snapshot from React state, passed to dispatcher -----

interface ReadonlyContext {
  focusedPanelIndex: number;
  focusedPanelKind:  'settings' | 'threadlist' | 'thread';
  focusedThreadId?:  string;     // when focusedPanelKind === 'thread'
  focusedLabel?:     string;     // when focusedPanelKind === 'threadlist'
  selection:         ThreadRef[];
  mode:              Mode;       // 'idle' | 'selecting' | 'picker-snooze' | 'picker-label' | 'cmd-k'
}

type Mode = 'idle' | 'selecting' | 'picker-snooze' | 'picker-label' | 'cmd-k';

// ----- Action result + undo -----

interface ActionInverse {
  action:      ActionId;
  args:        Record<string, unknown>;
  description: string;                   // "Restore archived threads", "Move 3 back to inbox"
}

type ActionResult =
  | { ok: true;  description: string; inverse?: ActionInverse }
  | { ok: false; error:       string };
```

## Action catalog

Every entry is a pure async function `(args) => Promise<ActionResult>`. Metadata declares display label, category, destructive flag, and which args are non-inferrable (`elicitVia`).

**Primitive (the workhorse all label-mutating actions delegate to):**

| ActionId | Args | Description |
|---|---|---|
| `modify-thread-labels` | `{ targets: ThreadRef[]; add: Label[]; remove: Label[] }` | Single Gmail API call (`threads.modify` per target, or parallel `messages.modify`). Returns a symmetric inverse. |

**Convenience actions (delegate to `modify-thread-labels`):**

| ActionId | Args | Implements |
|---|---|---|
| `archive-thread` | `{ targets }` | `modify({ remove: ['INBOX'] })` |
| `delete-thread` | `{ targets }` | `modify({ add: ['TRASH'], remove: ['INBOX'] })` |
| `spam-thread` | `{ targets }` | `modify({ add: ['SPAM'], remove: ['INBOX'] })` |
| `add-label-thread` | `{ targets; label }` | `modify({ add: [label] })` |
| `remove-label-thread` | `{ targets; label }` | `modify({ remove: [label] })` |
| `snooze-thread` | `{ targets; until: ISOString }` | `modify({ add: ['InboxZero/Snoozed', 'InboxZero/Snoozed/<until>'], remove: ['INBOX'] })`. `until` is non-inferrable → `elicitVia: 'picker-snooze'`. |

The convenience actions inherit `modify-thread-labels`'s symmetric inverse automatically — undoing a snooze, archive, or delete just runs the inverse modify.

**Standalone Gmail action (not a label modification):**

| ActionId | Args | Notes |
|---|---|---|
| `unsubscribe-thread` | `{ targets }` | Reads each thread's most recent message's `List-Unsubscribe` header. If `mailto:` form, sends an unsubscribe email via `gmail.send`. If only an HTTP URL, opens it in a new tab. Destructive — only allowed at `act-confirm-each` autonomy at most (no full-silent autonomy ever). Returns no inverse (cannot un-unsubscribe). |

**Layout actions (no Gmail call):**

| ActionId | Args | Notes |
|---|---|---|
| `open-panel` | `{ kind: 'thread'; threadId }` | Inserts a thread panel after the source threadlist. Inverse: `close-panel` at that index. |
| `close-panel` | `{ panelIndex }` | Removes the panel from the array. Inverse: `open-panel` with the closed panel's descriptor. |
| `nav-panel-prev` | `{}` | `focusIndex -= 1` (clamped). No inverse needed (nav is not "an action" in the undoable sense). |
| `nav-panel-next` | `{}` | `focusIndex += 1` (clamped). |
| `refresh-panel` | `{}` | Re-fetches the focused panel's data. No inverse. |
| `resize-panel` | `{ panelIndex; width }` | Updates panel CSS variable. (Mouse-wide only; deferrable.) |

**App-level:**

| ActionId | Args | Notes |
|---|---|---|
| `sign-in` | `{}` | Calls the existing GIS flow. |
| `sign-out` | `{}` | Clears `TokenStore`, resets layout. |
| `undo` | `{}` | Pops the undo stack, dispatches the inverse. Cleared when sign-out runs. |
| `redo` | `{}` | Pops the redo stack, re-dispatches the original. |
| `open-command-palette` | `{}` | Sets `mode = 'cmd-k'`. |

**Selection:**

Multi-select operates via the **same actions** with `targets = selection`. No new registry entries. The dispatcher resolver fills `targets` from `context.selection` when it's non-empty; otherwise from the event-derived target.

## Predicates

Closed set of pure `(ctx) => boolean`, registered separately. Bindings reference by id.

| PredicateId | True when |
|---|---|
| `mode-idle` | `ctx.mode === 'idle'` |
| `mode-cmd-k` | `ctx.mode === 'cmd-k'` |
| `mode-picker-snooze` | `ctx.mode === 'picker-snooze'` |
| `mode-picker-label` | `ctx.mode === 'picker-label'` |
| `mode-selecting` | `ctx.mode === 'selecting'` |
| `not-in-picker` | `ctx.mode !== 'picker-snooze' && ctx.mode !== 'picker-label'` |
| `selection-non-empty` | `ctx.selection.length > 0` |
| `in-thread-panel` | `ctx.focusedPanelKind === 'thread'` |
| `in-threadlist-panel` | `ctx.focusedPanelKind === 'threadlist'` |
| `signed-in` | (implicit — most actions require it, the dispatcher rejects with a clear error if not) |

Compositions are array form (AND). Adding `or` / `not` waits until a real binding needs them.

## Default bindings

Hardcoded constant. Phase 0d adds Sheet-persisted overrides on top.

**Touch (row scope):**

```ts
{ scope: 'row', modality: 'touch', trigger: { kind: 'click' },                  action: 'open-panel',     when: 'not-in-picker' },
{ scope: 'row', modality: 'touch', trigger: { kind: 'long-press', ms: 500 },    action: 'enter-selection', when: 'not-in-picker' },
{ scope: 'row', modality: 'touch', trigger: { kind: 'swipe', direction: 'right',
            minPx: 60,
            stages: [{ minPx: 60, action: 'archive-thread' },
                     { minPx: 240, action: 'delete-thread' }] },
            action: 'archive-thread',                                            when: 'not-in-picker' },
{ scope: 'row', modality: 'touch', trigger: { kind: 'swipe', direction: 'left', minPx: 60 },
            action: 'snooze-thread',                                             when: 'not-in-picker' },
```

The `action` field on the swipe binding is the default when no `stages` distinguish; when `stages` are present, the dispatcher picks the largest stage whose `minPx` was crossed.

**Touch (panel-header scope):**

```ts
{ scope: 'panel-header', modality: 'touch', trigger: { kind: 'swipe', direction: 'left',  minPx: 60 }, action: 'nav-panel-next' },
{ scope: 'panel-header', modality: 'touch', trigger: { kind: 'swipe', direction: 'right', minPx: 60 }, action: 'nav-panel-prev' },
```

**Touch (panel-body, thread close gesture):**

```ts
{ scope: 'panel-body', modality: 'touch', trigger: { kind: 'overscroll', edge: 'bottom', minPx: 80 },
            action: 'close-panel', when: 'in-thread-panel' },
```

**Mouse (additive — touch bindings already cover most click semantics on desktop):**

Wide-screen mouse navigation gets header chevron buttons (just `<button onClick={() => dispatch(...)}>`); not in the binding registry. The binding registry is for *gesture*-driven dispatch, not for `<button onClick>` ones.

**Keyboard (document scope, single-key shortcuts in idle mode):**

```ts
{ scope: 'document', modality: 'keyboard', trigger: { kind: 'key', combo: 'mod+k' }, action: 'open-command-palette' },
{ scope: 'document', modality: 'keyboard', trigger: { kind: 'key', combo: 'esc'   }, action: 'exit-mode' },   // closes picker / Cmd-K / selection

{ scope: 'document', modality: 'keyboard', trigger: { kind: 'key', combo: 'j'     }, action: 'archive-thread', when: ['mode-idle', 'in-threadlist-panel'] },
{ scope: 'document', modality: 'keyboard', trigger: { kind: 'key', combo: 'e'     }, action: 'archive-thread', when: ['mode-idle', 'in-thread-panel'] },
{ scope: 'document', modality: 'keyboard', trigger: { kind: 'key', combo: '#'     }, action: 'delete-thread',  when: 'mode-idle' },
{ scope: 'document', modality: 'keyboard', trigger: { kind: 'key', combo: '!'     }, action: 'spam-thread',    when: 'mode-idle' },
{ scope: 'document', modality: 'keyboard', trigger: { kind: 'key', combo: 'b'     }, action: 'snooze-thread',  when: 'mode-idle' },

{ scope: 'document', modality: 'keyboard', trigger: { kind: 'key', combo: 'mod+z'        }, action: 'undo' },
{ scope: 'document', modality: 'keyboard', trigger: { kind: 'key', combo: 'mod+shift+z'  }, action: 'redo' },
```

The Gmail-keyboard-shortcuts heritage (`j`, `e`, `#`, `!`, `b`) is intentional — muscle memory.

## Dispatcher

A single pure async function:

```ts
async function dispatch(
  request: {
    action: ActionId;
    args:   Record<string, unknown>;
    context: ReadonlyContext;
  }
): Promise<ActionResult>
```

**Flow:**

1. Look up the action in the registry. If not found → error.
2. If `signed-in` is required (true for all Gmail-write actions) and not held → reject with `"Please sign in."`
3. Check the action's `elicitVia` metadata: if any non-inferrable arg is missing, set `mode` to the corresponding picker, store a continuation, return. (The picker, when it resolves, calls dispatch again with the arg filled.)
4. Call the action's handler with the final args.
5. If `ok: true` and `inverse` present → push to the undo stack, clear the redo stack.
6. Return the result. Callers (gesture handlers, buttons, Cmd-K) decide what to do with `ok: false` — typically show an inline error and/or a toast.

**Gesture → dispatch glue** (a thin wrapper, not part of dispatch itself):

```ts
function fireBinding(binding: Binding, event: InputEvent, ctx: ReadonlyContext): Promise<ActionResult> {
  if (!matchesWhen(binding.when, ctx)) return noop;       // shouldn't get here normally; safety net
  const args = resolveArgs(binding, event, ctx);
  // resolveArgs uses helpers based on (scope, action):
  //   scope=row  → args.targets = [targetFromRow(event)]
  //   selection-non-empty → args.targets = ctx.selection
  //   etc.
  return dispatch({ action: binding.action, args, context: ctx });
}
```

`resolveArgs` is itself a small pure function table, scope+action → helper. Adding a new scope = adding a row.

## Gesture detection — `useGesture`

```ts
function useGesture(
  scope: Scope,
  ref:  React.RefObject<HTMLElement>,
  opts: {
    onSwipe?:      (e: SwipeEvent)     => void;
    onLongPress?:  (e: PressEvent)     => void;
    onClick?:      (e: PointerEvent)   => void;
    onOverscroll?: (e: OverscrollEvent) => void;
  }
): void
```

The hook attaches pointer/touch listeners to `ref.current`, detects gestures using simple Δx/Δy/Δt thresholds, and invokes the supplied callbacks with structured `SwipeEvent` / `PressEvent` / etc. payloads. Each callback is expected to call `fireBinding` with the right binding lookup.

For 95% of cases the component does *not* call `fireBinding` directly — instead it calls `useGestureBindings(scope, ref)`, a convenience hook that:

1. Calls `useGesture(scope, ref, ...)`.
2. Reads the binding registry once on mount.
3. Implements the callbacks by looking up the matching binding and calling `fireBinding`.

So a Row component is just:

```tsx
function Row({ thread }: { thread: EmailSummary }) {
  const ref = useRef<HTMLLIElement>(null);
  useGestureBindings('row', ref);
  return <li ref={ref} data-thread-id={thread.threadId} ...>{...}</li>;
}
```

That's all. The bindings dictate behavior.

## Selection state + Mode

Both live in React state in a `<DispatchProvider>` near the top of the layout:

```tsx
interface DispatchState {
  selection: ThreadRef[];
  mode:      Mode;
  // … focusedPanelIndex etc. (or composed from LayoutContainer)
}
```

The provider:
- Exposes `useDispatchContext(): ReadonlyContext` for callers that need to read.
- Exposes `useDispatcher(): typeof dispatch` for callers that need to fire — internally it captures the current context and forwards.
- Internally manages mode transitions (entering selection, opening a picker, opening Cmd-K).

Selection actions (`select`, `deselect`, `select-all`, `selection-clear`, `enter-selection`, `exit-selection`) are additional small ActionIds (not yet listed in the catalog table; they'll appear in the implementation plan).

## Picker pattern

A picker is a small React component (modal/popover) that elicits a missing argument and then re-dispatches the same action with it filled.

**Snooze picker flow:**

1. User dispatches `snooze-thread({ targets })` — no `until`.
2. Dispatcher sees `until` missing, action's metadata says `elicitVia: 'picker-snooze'`. Sets `mode = 'picker-snooze'`. Stores the partial request `{ action: 'snooze-thread', args: { targets } }`.
3. The `SnoozePicker` modal mounts (because `mode === 'picker-snooze'`). Shows: *Later today / Tomorrow / This weekend / Next week / Custom*.
4. User picks. The picker computes the ISO timestamp and calls `dispatch({ action: 'snooze-thread', args: { targets, until: '...' }, context })`.
5. Dispatcher sees all args present, runs the handler, returns the result.
6. `mode` reverts to `idle`. Toast: "Snoozed 3 threads — Undo."

**Label picker** works the same way, with a list of existing `InboxZero/<sublabel>`s plus a "create new" field that submits the typed string.

Pickers receive their continuation via the provider's state — they're not driven by props. This keeps the picker decoupled from where the original dispatch happened.

## Cmd-K command palette

Opens via `mod+k`. Sets `mode = 'cmd-k'`. Renders:

- A search input.
- A filtered list of actions whose `when` passes given the current context. Each item shows:
  - `label` (e.g. *"Archive"*)
  - context preview (e.g. *"3 selected"* / *"this thread"* / *"5 of 23 messages in INBOX"*)
  - bound shortcut, if any (e.g. *"⌘E"*)
- `↑/↓` to navigate, `Enter` to dispatch, `Esc` to close.

Implementation:

- Fuzzy match on `label`.
- The context preview is generated by an optional `previewFor(ctx, action) → string` helper per action (default: just the label).
- On select: dispatch with `args` resolved from context (same `resolveArgs` table) — if a picker would be needed, opening Cmd-K → Archive → Enter cleanly chains through to the picker for the missing arg.

YAGNI: no command history, no recently-used at top, no fuzzy weighting. Add when actually needed.

## Undo / redo

Single global LIFO stack in the provider's state. Each pushed entry is an `ActionInverse` plus the *original* action call (so `redo` can replay).

```ts
interface UndoEntry {
  original: { action: ActionId; args: Record<string, unknown>; description: string };
  inverse:  ActionInverse;
}
```

**On a successful dispatch:**
- If `result.inverse`, push `{ original, inverse: result.inverse }` to the undo stack.
- Clear the redo stack.

**`undo`:**
- Pop the top of the undo stack.
- Dispatch `inverse.action(inverse.args)`.
- Push the popped entry onto the redo stack.

**`redo`:**
- Pop the top of the redo stack.
- Dispatch `original.action(original.args)`.
- Push it onto the undo stack.

**Toast:**

After any action with an `inverse`, a small toast appears for ~6s containing `description` + an *Undo* button. Tapping `Undo` calls the `undo` action. The toast collapses on the next action (replacing).

Sign-out clears both stacks.

## Storage

v1: defaults live in `src/input/defaultBindings.ts`. The provider reads them into state on mount. No persistence.

v2 (Phase 0d): on sign-in the app reads a `Settings/Bindings` tab from the Sheet, parses overrides (one row per binding, JSON-encoded), and merges over the defaults. User customizations write back to the same Sheet tab. The binding data shape is already serializable, so v2 is purely an import/export concern.

## Testing approach

**Pure-function tests (TDD):**

- Every action handler: mocked `fetch`, assert request shape + state changes + returned `ActionResult` + correctness of the `inverse`.
- Every predicate: trivial table-driven.
- `dispatch`: with a stub action registry, assert it routes to the handler, applies `when`, pushes to undo stack, returns the right shape.
- `fireBinding`: with a stub dispatch, assert it resolves args correctly per scope and calls dispatch.
- Gesture detection (`useGesture` internals): jsdom pointer events, assert callbacks fire with the right deltas / direction.
- Modify-thread-labels inverse symmetry: round-trip property test (applying inverse twice = identity).

**Component tests:**

- `<SnoozePicker>`: simulate selection → assert the right action call shape.
- `<CommandPalette>`: type a query → assert filtering. Enter → assert dispatch.
- `<UndoToast>`: appears after action with inverse; Undo button calls `undo`; auto-dismisses.

**Integration:**

- Full row-swipe → archive → undo round-trip, with mocked Gmail. (jsdom)

Manual:

- End-to-end on the real Gmail account: archive, snooze, undo, delete, unsubscribe, multi-select operations. Cmd-K full flow.

## Component / file shape (sketch)

```
src/
  actions/
    registry.ts                  // ActionId → { label, category, destructive?, elicitVia?, handler }
    modifyThreadLabels.ts        // the primitive + its tests
    archive.ts ... snooze.ts ... // convenience wrappers + their tests
    unsubscribe.ts
    layout.ts                    // open/close panel, nav-prev/next, refresh
    undo.ts                      // undo/redo helpers + tests
  input/
    types.ts                     // Trigger, Binding, ActionResult, ReadonlyContext, Mode
    defaultBindings.ts           // const array
    predicates.ts                // PredicateId → fn
    helpers.ts                   // targetFromRow, targetsFromSelection, etc. + tests
    dispatch.ts                  // pure dispatch fn + tests
    fireBinding.ts               // glue + tests
    useGesture.ts                // pointer-event hook
    useGestureBindings.ts        // hook + binding-lookup
  state/
    DispatchProvider.tsx         // selection, mode, undo stack
    useDispatch.ts               // useDispatcher / useDispatchContext
  pickers/
    SnoozePicker.tsx + .test.tsx
    LabelPicker.tsx  + .test.tsx
  palette/
    CommandPalette.tsx + .test.tsx
  feedback/
    UndoToast.tsx + .test.tsx
```

Plus updates to `App.tsx` (wrap with `DispatchProvider`), `ThreadlistPanel.tsx` (rows use `useGestureBindings('row', ref)`), `PanelHeader.tsx` (collapses with `useGestureBindings('panel-header', ref)`), and `ThreadPanel.tsx` (body uses `useGestureBindings('panel-body', ref)` for overscroll-close).

## Definition of Done

- Swiping a row right archives the thread; further-right trashes it. Swiping left opens the snooze picker; picking a duration snoozes. Tap opens the thread.
- Pressing `J` in an inbox row archives. `E` in a thread archives. `#` deletes. `!` marks spam. `B` snoozes. `Mod+Z` undoes. `Mod+Shift+Z` redoes. `Mod+K` opens the palette.
- The command palette opens, fuzzy-searches actions, previews context, dispatches on Enter.
- Multi-select: long-press a row enters selection mode; subsequent taps toggle selection; bulk actions operate on the selection.
- Every label-mutating action is round-trip reversible via Undo.
- Unsubscribe surfaces the warning-and-confirm flow; never silent.
- 60+ tests passing (estimate). Build + lint clean.
- A manual run confirms all of the above end-to-end against the real Gmail account.

## Deferred to later phases

- Sheet-persisted binding overrides (Phase 0d).
- Behavior logging via the Sheet + Apps Script polling (Phase 0d).
- Reply / forward / compose (still later — the user has been explicit they're OK punting to Gmail for those).
- Cmd-K history, recently-used, smarter ranking.
- Slice-visualized StashColumn (Phase 0d or whenever the unified input model exposes a "jump to a specific stashed panel" action).
- A "user-friendly binding-edit UI" — the Sheet's JSON in Phase 0d is the v2 customization surface; a real settings UI is later.
- The rule engine, AI concierge, snooze backoff scheduler (Phase 1+).
