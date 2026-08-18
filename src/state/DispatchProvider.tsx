import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type {
  ActionCategory,
  ActionId,
  ActionRegistry,
  ActionResult,
  DispatchRequest,
  Mode,
  PickerId,
  ReadonlyContext,
  RegisteredAction,
  ThreadRef,
  UndoEntry,
} from '../input/types';
import type { Panel } from '../layout/types';
import { createThreadWriteActions } from '../actions/threadWrites';
import type { ThreadWriteClient } from '../lib/gmail/threadWriteClient';
import { createSelectionActions } from '../actions/selection';
import { createLayoutActions } from '../actions/layout';
import { createAppActions } from '../actions/app';
import { createDispatcher } from '../input/dispatch';
import { recordAction, recordOpen, type BehaviourAction } from '../lib/signals/behaviourLog';
import {
  DispatchContext,
  DispatcherContext,
  FeedbackStateContext,
  LayoutStateContext,
  PendingStateContext,
  RefreshStateContext,
  UndoStateContext,
  type Feedback,
  type FeedbackState,
  type LayoutState,
  type PendingRequest,
  type PendingState,
  type RefreshState,
  type UndoState,
} from './dispatchContexts';

export interface DispatchProviderProps {
  children: ReactNode;
  signedIn?: boolean;
  initialPanels?: Panel[];
  /** Called when a `sign-in` action is dispatched. Defaults to a no-op. */
  externalSignIn?: () => Promise<void>;
  /** Called when a `sign-out` action is dispatched. Defaults to a no-op. */
  externalSignOut?: () => void;
  /** OAuth token accessor for thread writes. Defaults to "signed out". */
  getToken?: () => string | null;
  /** Test seam: overrides the real Gmail write client. */
  threadWriteClient?: ThreadWriteClient;
}

/**
 * Returns the picker mode if the action declares `elicitVia` and the
 * elicitable arg is missing; otherwise null. Encodes the per-picker arg
 * requirement: snooze-thread needs `until`; add/remove-label-thread need
 * `label`.
 */
function needsElicitation(
  registry: ActionRegistry,
  actionId: ActionId,
  args: Record<string, unknown>,
): PickerId | null {
  const action = registry[actionId];
  if (!action || !action.elicitVia) return null;
  if (action.elicitVia === 'picker-snooze' && args.until == null) return 'picker-snooze';
  if (action.elicitVia === 'picker-label' && args.label == null) return 'picker-label';
  return null;
}

// Discard-type writes feed the sender-fatigue heuristic.
// Maps a dispatched action to the behaviour-log outcome it records.
const BEHAVIOUR_BY_ACTION: Record<string, Exclude<BehaviourAction, 'open'>> = {
  'archive-thread':     'archive',
  'delete-thread':      'delete',
  'spam-thread':        'spam',
  'snooze-thread':      'snooze',
  'add-label-thread':   'label',
  'unsubscribe-thread': 'unsubscribe',
};

/** open-panel args for a thread carry a threadId; a threadlist open does not. */
function openedThreadId(args: Record<string, unknown>): string | null {
  return args.kind === 'thread' && typeof args.threadId === 'string' ? args.threadId : null;
}

function asAction(
  id: string,
  label: string,
  category: ActionCategory,
  // The dispatcher passes args as Record<string, unknown>; per-handler signatures
  // are narrower for ergonomics. The cast happens here at the boundary.
  handler: (args: never, ctx: ReadonlyContext) => Promise<ActionResult>,
  opts: { destructive?: boolean; elicitVia?: PickerId } = {},
): RegisteredAction {
  return {
    id,
    label,
    category,
    handler: handler as RegisteredAction['handler'],
    ...opts,
  };
}

export function DispatchProvider({
  children,
  signedIn = false,
  initialPanels,
  externalSignIn: externalSignInProp,
  externalSignOut: externalSignOutProp,
  getToken,
  threadWriteClient,
}: DispatchProviderProps) {
  const [selection, setSelectionState] = useState<ThreadRef[]>([]);
  const [mode, setModeState]           = useState<Mode>('idle');
  const [undoStack, setUndoStack]      = useState<UndoEntry[]>([]);
  const [redoStack, setRedoStack]      = useState<UndoEntry[]>([]);
  const [pending, setPending]          = useState<PendingRequest | null>(null);
  const [feedback, setFeedback]        = useState<Feedback | null>(null);

  const [panels, setPanelsRaw] = useState<Panel[]>(initialPanels ?? []);
  const defaultFocus = useMemo(() => {
    const idx = (initialPanels ?? []).findIndex((p) => p.kind !== 'settings');
    return idx === -1 ? 0 : idx;
  }, [initialPanels]);
  const [focusIndex, setFocusIndexRaw] = useState<number>(defaultFocus);

  const setPanels     = useCallback((updater: (p: Panel[]) => Panel[]) => setPanelsRaw(updater), []);
  const setFocusIndex = useCallback((updater: (i: number) => number) => setFocusIndexRaw(updater), []);

  // Plain value setters matching the factory signatures.
  const setMode      = useCallback((m: Mode) => setModeState(m), []);
  const setSelection = useCallback((sel: ThreadRef[]) => setSelectionState(sel), []);

  // Refresh versions panels watch to refetch: per-label (refresh-panel action)
  // and global (any successful thread write).
  const [labelVersions, setLabelVersions] = useState<Record<string, number>>({});
  const [threadsVersion, setThreadsVersion] = useState(0);
  const bumpRefresh = useCallback((key: string) => {
    setLabelVersions((c) => ({ ...c, [key]: (c[key] ?? 0) + 1 }));
  }, []);

  // Refs mirror the stacks so popUndo/popRedo can return the popped entry
  // synchronously even when React defers the setState updater.
  const undoRef = useRef<UndoEntry[]>(undoStack);
  const redoRef = useRef<UndoEntry[]>(redoStack);
  useEffect(() => { undoRef.current = undoStack; }, [undoStack]);
  useEffect(() => { redoRef.current = redoStack; }, [redoStack]);

  // Refs mirror panels / focusIndex so action handlers can read the latest
  // values without depending on closures.
  const panelsRef     = useRef<Panel[]>(panels);
  const focusIndexRef = useRef<number>(focusIndex);
  useEffect(() => { panelsRef.current = panels; }, [panels]);
  useEffect(() => { focusIndexRef.current = focusIndex; }, [focusIndex]);

  const layoutState: LayoutState = useMemo(() => ({
    panels, focusIndex, setPanels, setFocusIndex,
  }), [panels, focusIndex, setPanels, setFocusIndex]);

  const ctx: ReadonlyContext = useMemo(() => {
    // Derive focused-panel context from the live panels + focusIndex state.
    // Previously hardcoded to index 1 / threadlist / INBOX, which silently
    // broke any action whose args came from context (close-panel via
    // overscroll; thread-scoped actions when the focused panel was a thread,
    // not a list; refresh keyed on focused label).
    const focused = panels[focusIndex];
    return {
      focusedPanelIndex: focusIndex,
      focusedPanelKind:  focused?.kind ?? 'threadlist',
      focusedThreadId:   focused?.kind === 'thread'      ? focused.threadId : undefined,
      focusedLabel:      focused?.kind === 'threadlist'  ? focused.label    : undefined,
      selection,
      mode,
      signedIn,
    };
  }, [panels, focusIndex, selection, mode, signedIn]);

  // Mirror ctx in a ref so the redispatch indirection in undo/redo can pass
  // the latest context without depending on stale closures.
  const ctxRef = useRef<ReadonlyContext>(ctx);
  useEffect(() => { ctxRef.current = ctx; }, [ctx]);

  const pushUndo = useCallback((entry: UndoEntry) => {
    const next = [...undoRef.current, entry];
    undoRef.current = next;
    setUndoStack(next);
    redoRef.current = [];
    setRedoStack([]);
  }, []);

  const popUndo = useCallback((): UndoEntry | undefined => {
    const stack = undoRef.current;
    if (stack.length === 0) return undefined;
    const popped = stack[stack.length - 1];
    const next = stack.slice(0, -1);
    undoRef.current = next;
    setUndoStack(next);
    return popped;
  }, []);

  const pushRedo = useCallback((entry: UndoEntry) => {
    const next = [...redoRef.current, entry];
    redoRef.current = next;
    setRedoStack(next);
  }, []);

  const popRedo = useCallback((): UndoEntry | undefined => {
    const stack = redoRef.current;
    if (stack.length === 0) return undefined;
    const popped = stack[stack.length - 1];
    const next = stack.slice(0, -1);
    redoRef.current = next;
    setRedoStack(next);
    return popped;
  }, []);

  const clearStacks = useCallback(() => {
    undoRef.current = [];
    redoRef.current = [];
    setUndoStack([]);
    setRedoStack([]);
  }, []);

  const undoState: UndoState = useMemo(() => ({
    undoStack,
    redoStack,
    pushUndo,
    popUndo,
    pushRedo,
    popRedo,
    clearStacks,
  }), [undoStack, redoStack, pushUndo, popUndo, pushRedo, popRedo, clearStacks]);

  // Dispatcher ref: external callers (e.g. tests, future App-level utilities)
  // may reach for the OUTER wrapping dispatcher via this ref. Internal
  // appActions.redispatch must NOT use the wrapper, since re-dispatching an
  // inverse would push the inverse's symmetric inverse back onto the undo
  // stack, making undo infinite.
  const dispatchRef = useRef<((req: DispatchRequest) => Promise<ActionResult>) | null>(null);

  // Inner dispatcher ref: undo/redo re-dispatch through this, bypassing the
  // undo-stack-push wrapper.
  const innerDispatchRef = useRef<((req: DispatchRequest) => Promise<ActionResult>) | null>(null);

  // Ref-backed accessors live as stable useCallbacks so they don't read refs
  // during render and don't churn the action-factory memos every render.
  const getPanels       = useCallback(() => panelsRef.current, []);
  const getFocusIndex   = useCallback(() => focusIndexRef.current, []);
  const redispatch      = useCallback(async (req: { action: string; args: Record<string, unknown> }): Promise<ActionResult> => {
    const dispatch = innerDispatchRef.current;
    if (!dispatch) return { ok: false, error: 'Dispatcher not initialised.' };
    return dispatch({ action: req.action, args: req.args, context: ctxRef.current });
  }, []);
  // Mirror the external sign-in/sign-out props through refs so callers can swap
  // implementations without resubscribing the action factories.
  const externalSignInRef  = useRef<(() => Promise<void>) | undefined>(externalSignInProp);
  const externalSignOutRef = useRef<(() => void) | undefined>(externalSignOutProp);
  useEffect(() => { externalSignInRef.current  = externalSignInProp;  }, [externalSignInProp]);
  useEffect(() => { externalSignOutRef.current = externalSignOutProp; }, [externalSignOutProp]);

  const externalSignIn  = useCallback(async () => {
    const fn = externalSignInRef.current;
    if (fn) await fn();
  }, []);
  const externalSignOut = useCallback(() => {
    const fn = externalSignOutRef.current;
    if (fn) fn();
  }, []);

  const selectionActions = createSelectionActions({ setMode, setSelection });

  // Mirror getToken through a ref so a new accessor identity (it re-forms when
  // auth state changes) doesn't rebuild the action registry and dispatchers.
  const getTokenRef = useRef<(() => string | null) | undefined>(getToken);
  useEffect(() => { getTokenRef.current = getToken; }, [getToken]);
  const stableGetToken = useCallback(() => getTokenRef.current?.() ?? null, []);

  // stableGetToken reads its ref only at dispatch time, never during render
  // (same pattern as getPanels/getFocusIndex below). signedIn is a deliberate
  // extra dep: label ids are per-account, so crossing a sign-out/sign-in
  // boundary must rebuild the client and drop its resolver cache.
  const threadWriteActions = useMemo(
    // eslint-disable-next-line react-hooks/refs
    () => createThreadWriteActions({ getToken: stableGetToken, client: threadWriteClient }),
    [stableGetToken, threadWriteClient, signedIn], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // The getPanels/getFocusIndex/redispatch callbacks read refs only when
  // invoked at action-dispatch time, never during render. The lint rule's
  // static analysis cannot see through useCallback, so disable for these.
  // eslint-disable-next-line react-hooks/refs
  const layoutActions = createLayoutActions({
    setPanels,
    setFocusIndex,
    getPanels,
    getFocusIndex,
    bumpRefresh,
  });

  // eslint-disable-next-line react-hooks/refs
  const appActions = createAppActions({
    setMode,
    clearStacks,
    popUndo,
    popRedo,
    pushUndo,
    pushRedo,
    // Wired via DispatchProvider's externalSignIn/externalSignOut props.
    externalSignIn,
    externalSignOut,
    redispatch,
  });

  const registry: ActionRegistry = useMemo(() => ({
    // Thread writes (real Gmail mutations):
    'modify-thread-labels': asAction('modify-thread-labels', 'Modify labels',  'thread-write', threadWriteActions.modifyThreadLabels),
    'archive-thread':       asAction('archive-thread',       'Archive',        'thread-write', threadWriteActions.archiveThread),
    'delete-thread':        asAction('delete-thread',        'Delete',         'thread-write', threadWriteActions.deleteThread,      { destructive: true }),
    'spam-thread':          asAction('spam-thread',          'Mark as spam',   'thread-write', threadWriteActions.spamThread,        { destructive: true }),
    'add-label-thread':     asAction('add-label-thread',     'Apply label',    'thread-write', threadWriteActions.addLabelThread,    { elicitVia: 'picker-label' }),
    'remove-label-thread':  asAction('remove-label-thread',  'Remove label',   'thread-write', threadWriteActions.removeLabelThread, { elicitVia: 'picker-label' }),
    'snooze-thread':        asAction('snooze-thread',        'Snooze',         'thread-write', threadWriteActions.snoozeThread,      { elicitVia: 'picker-snooze' }),
    'unsubscribe-thread':   asAction('unsubscribe-thread',   'Unsubscribe',    'thread-write', threadWriteActions.unsubscribeThread, { destructive: true }),
    'wake-snoozed':         asAction('wake-snoozed',         'Wake due snoozes', 'thread-write', threadWriteActions.wakeSnoozed),
    'apply-auto-archive':   asAction('apply-auto-archive',   'Apply auto-archive rules', 'thread-write', threadWriteActions.applyAutoArchive),

    // Layout (real):
    'open-panel':           asAction('open-panel',           'Open thread',    'layout',       layoutActions.openPanel),
    'close-panel':          asAction('close-panel',          'Close panel',    'layout',       layoutActions.closePanel),
    'nav-panel-prev':       asAction('nav-panel-prev',       'Previous panel', 'layout',       layoutActions.navPanelPrev),
    'nav-panel-next':       asAction('nav-panel-next',       'Next panel',     'layout',       layoutActions.navPanelNext),
    'refresh-panel':        asAction('refresh-panel',        'Refresh',        'layout',       layoutActions.refreshPanel),

    // Selection:
    'enter-selection':      asAction('enter-selection',      'Select',           'selection', selectionActions.enterSelection),
    'exit-selection':       asAction('exit-selection',       'Exit selection',   'selection', selectionActions.exitSelection),
    'toggle-selection':     asAction('toggle-selection',     'Toggle selection', 'selection', selectionActions.toggleSelection),

    // App:
    'undo':                 asAction('undo',                 'Undo',            'app',        appActions.undo),
    'redo':                 asAction('redo',                 'Redo',            'app',        appActions.redo),
    'open-command-palette': asAction('open-command-palette', 'Command palette', 'app',        appActions.openCommandPalette),
    'exit-mode':            asAction('exit-mode',            'Cancel',          'app',        appActions.exitMode),
    'sign-in':              asAction('sign-in',              'Sign in',         'app',        appActions.signIn),
    'sign-out':             asAction('sign-out',             'Sign out',        'app',        appActions.signOut),
  }), [threadWriteActions, layoutActions, selectionActions, appActions]);

  // Inner dispatcher: raw action execution without undo-stack side effects.
  // appActions.redispatch (used by undo/redo) routes through this so that
  // re-dispatching an inverse does NOT re-push to the undo stack. Bumping
  // threadsVersion here (not in the wrapper) means undo/redo refresh lists too.
  const innerDispatcher = useMemo(() => {
    const run = createDispatcher(registry);
    return async (req: DispatchRequest): Promise<ActionResult> => {
      const result = await run(req);
      const isThreadWrite = registry[req.action]?.category === 'thread-write';
      if (result.ok && isThreadWrite && result.mutated !== false) {
        setThreadsVersion((v) => v + 1);
      }
      return result;
    };
  }, [registry]);

  // Wrapping dispatcher: handles picker elicitation and pushes undo entries
  // for successful user-initiated actions with inverses. External callers
  // (useDispatcher hook consumers) always get this one.
  const dispatcher = useMemo(() => {
    return async (req: DispatchRequest): Promise<ActionResult> => {
      const elicit = needsElicitation(registry, req.action, req.args);
      if (elicit) {
        setPending({ action: req.action, args: req.args });
        setModeState(elicit);
        return { ok: true, description: 'Picker opened' };
      }
      const result = await innerDispatcher(req);
      if (result.ok && result.inverse) {
        pushUndo({
          original: { action: req.action, args: req.args, description: result.description },
          inverse: result.inverse,
        });
      }
      // Behaviour is recorded here (user-initiated path) not in innerDispatcher,
      // so undo/redo re-dispatches don't double-count; keyed on the threads
      // that actually changed, not the requested targets.
      if (result.ok && result.affectedTargets?.length) {
        const behaviourAction = BEHAVIOUR_BY_ACTION[req.action];
        if (behaviourAction) recordAction(result.affectedTargets, behaviourAction);
      }
      // Opening a thread feeds open-rate and the "opened before dismissing" flag.
      if (result.ok && req.action === 'open-panel') {
        const threadId = openedThreadId(req.args);
        if (threadId) recordOpen(threadId);
      }
      // Nothing else renders ActionResults, so failures (and undo-less
      // outcomes that ask to be announced) surface here or nowhere. A silent
      // request opts out so its caller can compose one combined message.
      if (!req.silent) {
        if (!result.ok) setFeedback({ kind: 'error', message: result.error });
        else if (result.announce) setFeedback({ kind: 'info', message: result.description });
      }
      return result;
    };
  }, [registry, innerDispatcher, pushUndo]);

  const pendingState: PendingState = useMemo(() => ({
    pending, setPending,
  }), [pending]);

  const refreshState: RefreshState = useMemo(() => ({
    threadsVersion, labelVersions,
  }), [threadsVersion, labelVersions]);

  const feedbackState: FeedbackState = useMemo(() => ({
    feedback, setFeedback,
  }), [feedback]);

  useEffect(() => { dispatchRef.current = dispatcher; }, [dispatcher]);
  useEffect(() => { innerDispatchRef.current = innerDispatcher; }, [innerDispatcher]);

  return (
    <DispatchContext.Provider value={ctx}>
      <DispatcherContext.Provider value={dispatcher}>
        <UndoStateContext.Provider value={undoState}>
          <LayoutStateContext.Provider value={layoutState}>
            <PendingStateContext.Provider value={pendingState}>
              <RefreshStateContext.Provider value={refreshState}>
                <FeedbackStateContext.Provider value={feedbackState}>
                  {children}
                </FeedbackStateContext.Provider>
              </RefreshStateContext.Provider>
            </PendingStateContext.Provider>
          </LayoutStateContext.Provider>
        </UndoStateContext.Provider>
      </DispatcherContext.Provider>
    </DispatchContext.Provider>
  );
}
