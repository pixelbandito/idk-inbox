import { useEffect, useRef, useState } from 'react';

// The scroll-to-act mechanic, generalised off the bottom edge of a single card and
// onto any edge of any scroller.
//
// The whole thing reduces to one idea: A STOP IS A SCROLL BOUNDARY, and a step is a
// PAD you travel through. Nothing refuses input, nothing measures gestures. You
// cannot flick past a stop because there is nowhere to flick to — layout, not
// policy — and momentum dies against the boundary exactly as the platform intends.
//
//   rest at the edge          → the pad for the next step is prepared, invisibly
//   travel it                 → the actions on that side are revealed
//   rest again                → a second pad is prepared below the first
//   travel that               → the edgemost action on that side fires
//
// Preparing a pad in advance rather than on the scroll that uses it is what makes
// each step read as motion: the next scroll is travel from its first pixel, with
// nothing spent asking for room. Preparing it only once INPUT has gone quiet is
// what keeps it safe — the pad cannot appear underneath a gesture that is still
// running, so a fling has nowhere to spend its tail.
//
// The four sides are one implementation. `axis` picks scrollTop/scrollLeft and the
// matching size properties; `edge` picks which end the pad is attached to. The only
// asymmetry is real rather than incidental: growing a pad at the START shifts the
// content after it, so the scroll position is compensated in the same frame. At the
// END nothing below moves, so no compensation is needed.

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
   *  completed commit travel fires. */
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
   * Which action just ran, while it is running. A completed travel always names the
   * edgemost one, but a tap names its own — and the "activated" treatment has to
   * follow the action that actually fired, not the one the travel would have picked.
   */
  firedActionId: string | null;
}

export interface ScrollActionsConfig {
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

const IDLE_SIDE: SideState = { stage: 0, reveal: 0, commit: 0, phase: 'idle', firedActionId: null };
const FIRED_HOLD_MS = 900;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const easeInOutCubic = (p: number) =>
  p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;

interface Metrics {
  pos: number;
  max: number;
}

/**
 * Drives one scroller. Give it the scroller and the two pad elements; it sizes the
 * pads, watches the scroll, and reports how far each side has been travelled.
 *
 * The pads are sized IMPERATIVELY rather than through the render, so a pad exists
 * on the same frame it is earned. Waiting for React meant a gesture arriving at a
 * boundary was already clamped against the old maximum and could not reach into
 * what it had just unlocked.
 */
export function useScrollActions(
  scrollerRef: React.RefObject<HTMLElement | null>,
  startPadRef: React.RefObject<HTMLElement | null>,
  endPadRef: React.RefObject<HTMLElement | null>,
  config: ScrollActionsConfig,
) {
  const [startState, setStartState] = useState<SideState>(IDLE_SIDE);
  const [endState, setEndState] = useState<SideState>(IDLE_SIDE);

  const cfg = useRef(config);
  useEffect(() => {
    cfg.current = config;
  });

  const stages = useRef({ start: 0, end: 0 });
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firedSide = useRef<Edge | null>(null);
  const firedActionId = useRef<string | null>(null);
  const returning = useRef(false);
  const returnRaf = useRef(0);
  const lastPhase = useRef({ start: 'idle' as SidePhase, end: 'idle' as SidePhase });
  const lastPos = useRef(0);
  /** Set by the effect; lets a tap run the same commit path as a completed travel. */
  const activateRef = useRef<((edge: Edge, action?: ScrollAction) => void) | null>(null);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const horiz = cfg.current.axis === 'x';

    const read = (): Metrics =>
      horiz
        ? { pos: el.scrollLeft, max: el.scrollWidth - el.clientWidth }
        : { pos: el.scrollTop, max: el.scrollHeight - el.clientHeight };

    /**
     * Move the scroller ourselves — and record it as OUR movement, not yours.
     *
     * Without that last part the direction guard reads a compensation as a gesture,
     * and the two sides destroy each other: preparing the start pad shifts the
     * position forward to hold the content still, that reads as "moving away from
     * the start", the start pad is surrendered, which shifts the position back, which
     * reads as "moving away from the end"… and both pads flicker in and out forever.
     */
    const write = (pos: number) => {
      if (horiz) el.scrollLeft = pos;
      else el.scrollTop = pos;
      lastPos.current = pos;
    };

    const sideCfg = (edge: Edge) => (edge === 'start' ? cfg.current.start : cfg.current.end);
    const padEl = (edge: Edge) => (edge === 'start' ? startPadRef.current : endPadRef.current);

    const padFor = (edge: Edge, stage: number) => {
      const c = sideCfg(edge);
      if (!c || stage <= 0) return 0;
      return stage === 1 ? c.revealPx : c.revealPx + c.commitPx;
    };

    /**
     * Apply a stage change to the DOM. Growing the START pad pushes everything after
     * it along, so the scroll position is moved by the same amount in the same frame
     * — otherwise preparing a pad would visibly shove the content sideways, which is
     * the one thing this mechanic must never do.
     */
    const setStage = (edge: Edge, next: number) => {
      const el2 = padEl(edge);
      if (!el2) return;
      const before = padFor(edge, stages.current[edge]);
      const after = padFor(edge, next);
      if (before === after) {
        stages.current[edge] = next;
        return;
      }
      // Read the position BEFORE touching layout. Shrinking a pad reduces the
      // scrollable range, and the browser silently clamps the position to the new
      // maximum as part of that — so reading afterwards returns a value that has
      // ALREADY been compensated, and applying the delta on top subtracts it twice.
      //
      // The symptom is specific and was reported as a snap: reveal both trailing
      // actions, and a moment later the inner one disappears again, leaving exactly
      // the edgemost. The amount lost is always the leading pad's own width.
      const posBefore = read().pos;
      stages.current[edge] = next;
      el2.style[horiz ? 'width' : 'height'] = `${after}px`;
      if (edge === 'start') write(posBefore + (after - before));
    };

    const measure = () => {
      const { pos, max } = read();
      const startPad = padFor('start', stages.current.start);
      const endPad = padFor('end', stages.current.end);
      return {
        pos,
        max,
        startShown: clamp(startPad - pos, 0, startPad),
        endShown: clamp(endPad - (max - pos), 0, endPad),
        startPad,
        endPad,
      };
    };

    const phaseFor = (edge: Edge, shown: number): SidePhase => {
      const c = sideCfg(edge);
      if (!c) return 'idle';
      if (firedSide.current === edge) return 'fired';
      if (shown <= 0) return 'idle';
      if (shown < c.revealPx - 1) return 'revealing';
      if (shown < c.revealPx + 1) return 'ready';
      return 'committing';
    };

    const publish = () => {
      const m = measure();
      const mk = (edge: Edge, shown: number): SideState => {
        const c = sideCfg(edge);
        return {
          stage: stages.current[edge],
          reveal: c ? Math.min(shown, c.revealPx) : 0,
          commit: c ? Math.max(0, shown - c.revealPx) : 0,
          phase: phaseFor(edge, shown),
          firedActionId: firedSide.current === edge ? firedActionId.current : null,
        };
      };
      setStartState(mk('start', m.startShown));
      setEndState(mk('end', m.endShown));
      return m;
    };

    const clearHold = () => {
      if (holdTimer.current) clearTimeout(holdTimer.current);
      holdTimer.current = null;
    };

    const stopReturn = () => {
      if (returnRaf.current) cancelAnimationFrame(returnRaf.current);
      returnRaf.current = 0;
      returning.current = false;
    };

    /** Animate back to the content edge of whichever side is showing. */
    const withdraw = (edge: Edge) => {
      clearHold();
      const m = measure();
      const from = m.pos;
      const to = edge === 'start' ? m.startPad : m.max - m.endPad;
      if (Math.abs(from - to) < 0.5) {
        firedSide.current = null;
        firedActionId.current = null;
        publish();
        return;
      }
      const dur = Math.max(120, cfg.current.returnMs ?? 800);
      const t0 = performance.now();
      returning.current = true;
      const step = (t: number) => {
        const p = Math.min(1, (t - t0) / dur);
        write(from + (to - from) * easeInOutCubic(p));
        publish();
        if (p < 1) {
          returnRaf.current = requestAnimationFrame(step);
          return;
        }
        stopReturn();
        firedSide.current = null;
        firedActionId.current = null;
        setStage(edge, 0);
        publish();
      };
      returnRaf.current = requestAnimationFrame(step);
    };

    const restartHold = (edge: Edge) => {
      clearHold();
      if (firedSide.current || returning.current) return;
      holdTimer.current = setTimeout(() => withdraw(edge), cfg.current.holdMs ?? 3000);
    };

    /**
     * Run an action and file the side away.
     *
     * `action` is omitted by the travel path, which always commits to the EDGEMOST
     * one — the last in the array, hard against the container edge. A tap names its
     * own action instead, which is the point of having more than one: travel is the
     * fast, unambiguous default, and the others stay reachable without it.
     */
    const fire = (edge: Edge, action?: ScrollAction) => {
      const c = sideCfg(edge);
      if (!c || !c.actions.length) return;
      if (firedSide.current || returning.current) return;
      const chosen = action ?? c.actions[c.actions.length - 1];
      firedSide.current = edge;
      firedActionId.current = chosen.id;
      clearHold();
      publish();
      c.onCommit?.(chosen);
      setTimeout(() => withdraw(edge), FIRED_HOLD_MS);
    };

    activateRef.current = fire;

    /**
     * Prepare the pad for the next step on whichever side we have come to rest
     * against. Fired by the settle clock, which is fed by INPUT — see onWheel.
     */
    const prepare = () => {
      if (firedSide.current || returning.current) return;

      // No "has the scroll finished animating?" gate here, deliberately.
      //
      // One was added on the theory that resizing a pad mid-animation cancels it and
      // truncates the travel. That theory was wrong: the truncation was a pad shrink
      // subtracting its own width from the scroll position TWICE (see `setStage`).
      // With that fixed, resizing during an animation is harmless, and the gate was
      // pure latency — the thing that makes a surface feel like it is thinking.
      // Input going quiet is the only wait that buys anything.

      const m = measure();
      const advance = (edge: Edge, atContentEdge: boolean, fullyRevealed: boolean) => {
        const c = sideCfg(edge);
        if (!c) return;
        if (stages.current[edge] === 0 && atContentEdge) setStage(edge, 1);
        else if (stages.current[edge] === 1 && fullyRevealed) setStage(edge, 2);
      };
      advance('start', m.pos <= m.startPad + 1 && m.startShown <= 0, m.startShown >= (sideCfg('start')?.revealPx ?? 0) - 1);
      advance('end', m.pos >= m.max - m.endPad - 1 && m.endShown <= 0, m.endShown >= (sideCfg('end')?.revealPx ?? 0) - 1);
      publish();
    };

    const restartSettle = () => {
      if (settleTimer.current) clearTimeout(settleTimer.current);
      settleTimer.current = setTimeout(prepare, cfg.current.settleMs ?? 30);
    };

    const onScroll = () => {
      const m = publish();

      // The commit is a POSITION, never an event: arriving at the far end of the
      // commit pad is the action. Nothing can stall it, because there is nothing to
      // refuse — only distance you have or have not run.
      for (const edge of ['start', 'end'] as Edge[]) {
        const c = sideCfg(edge);
        if (!c || stages.current[edge] !== 2 || firedSide.current || returning.current) continue;
        const shown = edge === 'start' ? m.startShown : m.endShown;
        if (shown >= c.revealPx + c.commitPx - 1) {
          fire(edge);
          return;
        }
      }

      lastPos.current = m.pos;

      // Give a pad back the moment you are no longer parked against its edge —
      // immediately, with no settle and no stability check.
      //
      // GROWING a pad has to wait for input to go quiet, because room that appears
      // under a live gesture is room that gesture spends for you. SHRINKING one
      // carries no such risk: nothing is revealed, nobody is looking at it, and the
      // operation is a genuine no-op — drop N px of room and take N px off the
      // position, so the content does not move and its relation to the scroll
      // geometry is unchanged. Gating that behind a timer buys nothing and makes the
      // surface feel like it is thinking.
      //
      // This is what keeps the far edge a real stop. A pad is prepared wherever you
      // come to rest, and a fresh surface rests at its start — so if the near pad
      // survives, a fling across the content arrives to find the far affordance
      // already open and travels straight into it. No stop, no offer, just the panel.
      if (!firedSide.current && !returning.current) {
        for (const edge of ['start', 'end'] as Edge[]) {
          if (!sideCfg(edge) || stages.current[edge] === 0) continue;
          const shown = edge === 'start' ? m.startShown : m.endShown;
          if (shown > 0) continue; // being travelled — leave it alone
          const parkedHere =
            edge === 'start' ? m.pos <= m.startPad + 1 : m.pos >= m.max - m.endPad - 1;
          if (!parkedHere) setStage(edge, 0);
        }
      }

      // The reading clock restarts when the MESSAGE changes, not on scroll activity:
      // what it has to cover is reading the words currently on screen.
      for (const edge of ['start', 'end'] as Edge[]) {
        const shown = edge === 'start' ? m.startShown : m.endShown;
        const phase = phaseFor(edge, shown);
        if (phase !== lastPhase.current[edge]) {
          lastPhase.current[edge] = phase;
          if (phase === 'idle') clearHold();
          else if (phase !== 'fired') restartHold(edge);
        }
      }

      restartSettle();
    };

    // INPUT is what the settle clock listens to. Keyed on scrolling it would be
    // wrong in the only case that matters: pinned at a boundary, the position stops
    // changing and scroll events stop with it, while the platform is still
    // delivering momentum. The clock would expire mid-fling and prepare a pad under
    // a live gesture, which is precisely how a fling walks through an offer.
    const onWheel = () => {
      restartSettle();
      if (returning.current && !firedSide.current) stopReturn();
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    el.addEventListener('wheel', onWheel, { passive: true });
    el.addEventListener('touchmove', onWheel, { passive: true });
    publish();
    // A surface at rest is already AT a boundary, so its first pad is earned without
    // anyone touching it. Without this the very first gesture on a fresh surface has
    // nowhere to go and is spent preparing instead of travelling — the dead first
    // scroll all over again, just relocated to mount.
    restartSettle();
    return () => {
      el.removeEventListener('scroll', onScroll);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchmove', onWheel);
      if (settleTimer.current) clearTimeout(settleTimer.current);
      clearHold();
      stopReturn();
    };
    // Config is read through a ref, so the listeners are installed exactly once.
  }, [scrollerRef, startPadRef, endPadRef]);

  const activate = (edge: Edge, action: ScrollAction) => activateRef.current?.(edge, action);

  return { start: startState, end: endState, activate };
}
