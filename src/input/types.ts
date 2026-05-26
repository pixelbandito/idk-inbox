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
