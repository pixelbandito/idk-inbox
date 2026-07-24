export type ActionId = string;
export type PickerId = 'picker-snooze' | 'picker-label';
export type Scope    = 'row' | 'panel-header' | 'panel-body' | 'document';

export type Mode =
  | 'idle'
  | 'selecting'
  | 'picker-snooze'
  | 'picker-label'
  | 'cmd-k';

export type PanelKindForCtx = 'settings' | 'threadlist' | 'thread' | 'labels' | 'automations';

export type ThreadRef = string; // Gmail threadId

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
  | {
      ok: true;
      description: string;
      inverse?: ActionInverse;
      /** Show the description as a toast even without an undo entry. */
      announce?: boolean;
      /** Set false when a write turned out to be a no-op (skips list refresh). */
      mutated?: boolean;
      /** Threads the write actually changed — the basis for triage recording. */
      affectedTargets?: ThreadRef[];
    }
  | { ok: false; error: string };

export interface DispatchRequest {
  action:  ActionId;
  args:    Record<string, unknown>;
  context: ReadonlyContext;
  /** Suppress the automatic feedback toast — the caller will announce itself. */
  silent?: boolean;
}

export type ActionCategory = 'thread-write' | 'layout' | 'app' | 'selection';

export interface RegisteredAction<TArgs = Record<string, unknown>> {
  id:           ActionId;
  label:        string;
  category:     ActionCategory;
  destructive?: boolean;
  elicitVia?:   PickerId;
  /** Optional pure function that produces a context-aware preview string for Cmd-K. */
  previewFor?:  (ctx: ReadonlyContext, args: Partial<TArgs>) => string;
  handler:      (args: TArgs, ctx: ReadonlyContext) => Promise<ActionResult>;
}

export type ActionRegistry = Record<ActionId, RegisteredAction>;

export interface UndoEntry {
  original: { action: ActionId; args: Record<string, unknown>; description: string };
  inverse:  ActionInverse;
}
