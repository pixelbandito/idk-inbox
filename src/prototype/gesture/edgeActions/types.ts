// Shared vocabulary for edge actions. Deliberately knows nothing about how a side
// is driven — scrolling and dragging both describe themselves in these terms.

export type Axis = 'x' | 'y';
/** Which end of the axis the actions live at. y/start = top, x/end = right, etc. */
export type Edge = 'start' | 'end';

export type SidePhase = 'idle' | 'revealing' | 'ready' | 'committing' | 'fired' | 'returning';

export interface ScrollAction {
  id: string;
  label: string;
  /** Free-form tone key; the surface maps it to colours. */
  tone?: string;
}

export interface SideConfig {
  /** Ordered content-ward → edge-ward. The LAST one is edgemost, and is what a
   *  completed scroll travel fires. */
  actions: ScrollAction[];
  /** Travel that reveals every action on this side. */
  revealPx: number;
  /** Further travel, past the reveal, that fires the edgemost action. */
  commitPx: number;
  onCommit?: (action: ScrollAction) => void;
}

export interface SideState {
  /** 0 = no pad · 1 = reveal pad prepared · 2 = commit pad prepared too. */
  stage: number;
  /** px of the reveal travelled, 0…revealPx. */
  reveal: number;
  /** px of the commit travelled, 0…commitPx. Only ever > 0 at stage 2. */
  commit: number;
  phase: SidePhase;
  /**
   * Which action just ran, while it is running. A completed scroll travel always
   * names the edgemost one, but a tap or a drag names its own — and the "activated"
   * treatment has to follow the action that actually fired, not the one a travel
   * would have picked.
   */
  firedActionId: string | null;
  /**
   * Which action a DRAG is currently pointing at, while the drag is live.
   *
   * Scroll and drag disagree here on purpose. A scroll has no release, so it needs
   * one unambiguous meaning and always commits to the edgemost action. A drag has a
   * release, so distance can select: each further action-width along picks the next
   * action inward, and letting go runs whichever one you are on.
   */
  selectedActionId: string | null;
}

export interface EdgeActionsConfig {
  axis: Axis;
  start?: SideConfig;
  end?: SideConfig;
  /** Quiet time after the last input before the next pad is prepared. */
  settleMs?: number;
  /** How long a revealed side waits for you before withdrawing itself. */
  holdMs?: number;
  /** How long that withdrawal takes to play. */
  returnMs?: number;
}

export interface Metrics {
  pos: number;
  max: number;
  startPad: number;
  endPad: number;
  startShown: number;
  endShown: number;
}

/**
 * The imperative handle a behaviour hook drives the surface through.
 *
 * This is the seam. `useEdgeSurface` owns all the geometry — pads, stages, the
 * withdrawal, what "shown" means — and knows nothing about wheels or pointers.
 * `useScrollCommit` and `useDragCommit` own an input model each and share no state
 * beyond this handle, so either can be taken without the other.
 */
export interface Surface {
  el: HTMLElement;
  horiz: boolean;
  cfg(): EdgeActionsConfig;
  sideCfg(edge: Edge): SideConfig | undefined;
  read(): { pos: number; max: number };
  /** Move the scroller ourselves, recorded as OUR movement rather than the user's. */
  write(pos: number): void;
  measure(): Metrics;
  publish(): Metrics;
  stageOf(edge: Edge): number;
  /** Apply a stage. Returns the px the scroll position was shifted by (leading pads). */
  setStage(edge: Edge, next: number): number;
  fire(edge: Edge, action?: ScrollAction): void;
  withdraw(edge: Edge): void;
  stopReturn(): void;
  /** Mid-fire or mid-withdrawal: nobody else may touch the surface. */
  busy(): boolean;
  /**
   * A drag is holding the surface. The scroll behaviour stands down while this is
   * true — it is the one place the two input models have to know about each other.
   *
   * They cannot both act: a drag deliberately runs the position past the commit
   * distance in order to SELECT with it, and the scroll path reads arriving there as
   * "fire the edgemost". Left alone, dragging out to the second action fires the
   * first one before you have let go.
   */
  isDragging(): boolean;
  setSelected(edge: Edge, id: string | null): void;
  setDragging(on: boolean): void;
  /** Called after every scroll, once the geometry is up to date. */
  onSync(cb: (m: Metrics) => void): () => void;
  /**
   * Called whenever the surface moves the scroll position ITSELF to hold content
   * still — growing or surrendering a leading pad shifts everything after it.
   *
   * Anything holding an absolute scroll position across frames has to follow, or it
   * silently drifts by the pad's width. A drag does exactly that, and the symptom is
   * ugly: surrendering the leading pad on the first move leaves the drag running a
   * whole action-width ahead of the finger, so a short pull selects and fires the
   * wrong action.
   */
  onShift(cb: (delta: number) => void): () => void;
}

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** The width (or height) one action occupies within its side's reveal. */
export const actionSize = (c: SideConfig) => c.revealPx / Math.max(1, c.actions.length);
