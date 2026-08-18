import { useEffect, useRef, useState } from 'react';
import {
  clamp,
  type Edge,
  type EdgeActionsConfig,
  type Metrics,
  type ScrollAction,
  type SideConfig,
  type SidePhase,
  type SideState,
  type Surface,
} from './types';

// The geometry, and nothing else.
//
// One idea underneath all of it: A STOP IS A SCROLL BOUNDARY, and a step is a PAD
// you travel through. Nothing refuses input, nothing measures gestures. You cannot
// flick past a stop because there is nowhere to flick to — layout, not policy — and
// momentum dies against the boundary exactly as the platform intends.
//
// This module owns pads, stages, what "shown" means, the hold timer and the
// withdrawal. It has no opinion about wheels or pointers: the input models live in
// `useScrollCommit` and `useDragCommit`, which drive it through the `Surface`
// handle and share nothing else. Either can be used without the other.
//
// The four sides are one implementation. `axis` picks scrollTop/scrollLeft and the
// matching size properties; `edge` picks which end the pad attaches to. The only
// asymmetry is real rather than incidental: growing a pad at the START shifts the
// content after it, so the scroll position is compensated in the same frame. At the
// END nothing below moves, so no compensation is needed.

const IDLE_SIDE: SideState = {
  stage: 0, reveal: 0, commit: 0, phase: 'idle', firedActionId: null, selectedActionId: null,
};
const FIRED_HOLD_MS = 900;
const easeInOutCubic = (p: number) =>
  p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;

export function useEdgeSurface(
  scrollerRef: React.RefObject<HTMLElement | null>,
  startPadRef: React.RefObject<HTMLElement | null>,
  endPadRef: React.RefObject<HTMLElement | null>,
  config: EdgeActionsConfig,
) {
  const [startState, setStartState] = useState<SideState>(IDLE_SIDE);
  const [endState, setEndState] = useState<SideState>(IDLE_SIDE);
  const [draggingState, setDraggingState] = useState(false);

  const cfg = useRef(config);
  useEffect(() => {
    cfg.current = config;
  });

  const stages = useRef({ start: 0, end: 0 });
  const selected = useRef<{ start: string | null; end: string | null }>({ start: null, end: null });
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firedSide = useRef<Edge | null>(null);
  const firedActionId = useRef<string | null>(null);
  const returning = useRef(false);
  const returnRaf = useRef(0);
  const lastPhase = useRef({ start: 'idle' as SidePhase, end: 'idle' as SidePhase });
  const lastPos = useRef(0);
  const draggingRef = useRef(false);
  const surface = useRef<Surface | null>(null);
  const subscribers = useRef(new Set<(m: Metrics) => void>());
  const shiftSubs = useRef(new Set<(d: number) => void>());
  /** Lets a tap run the same commit path as a completed travel. */
  const fireRef = useRef<((edge: Edge, action?: ScrollAction) => void) | null>(null);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const horiz = cfg.current.axis === 'x';

    const read = () =>
      horiz
        ? { pos: el.scrollLeft, max: el.scrollWidth - el.clientWidth }
        : { pos: el.scrollTop, max: el.scrollHeight - el.clientHeight };

    /**
     * Move the scroller ourselves — and record it as OUR movement, not yours.
     *
     * Without that last part a compensation reads as a gesture, and the two sides
     * destroy each other: preparing the start pad shifts the position forward to
     * hold the content still, that reads as "moving away from the start", the start
     * pad is surrendered, which shifts the position back, which reads as "moving
     * away from the end"… and both pads flicker in and out forever.
     */
    const write = (pos: number) => {
      if (horiz) el.scrollLeft = pos;
      else el.scrollTop = pos;
      lastPos.current = pos;
    };

    const sideCfg = (edge: Edge): SideConfig | undefined =>
      edge === 'start' ? cfg.current.start : cfg.current.end;
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
    const setStage = (edge: Edge, next: number): number => {
      const node = padEl(edge);
      if (!node) return 0;
      const before = padFor(edge, stages.current[edge]);
      const after = padFor(edge, next);
      if (before === after) {
        stages.current[edge] = next;
        return 0;
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
      node.style[horiz ? 'width' : 'height'] = `${after}px`;
      if (edge !== 'start') return 0;
      const shifted = after - before;
      write(posBefore + shifted);
      for (const cb of shiftSubs.current) cb(shifted);
      return shifted;
    };

    const measure = (): Metrics => {
      const { pos, max } = read();
      const startPad = padFor('start', stages.current.start);
      const endPad = padFor('end', stages.current.end);
      return {
        pos,
        max,
        startPad,
        endPad,
        startShown: clamp(startPad - pos, 0, startPad),
        endShown: clamp(endPad - (max - pos), 0, endPad),
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

    const publish = (): Metrics => {
      const m = measure();
      const mk = (edge: Edge, shown: number): SideState => {
        const c = sideCfg(edge);
        return {
          stage: stages.current[edge],
          reveal: c ? Math.min(shown, c.revealPx) : 0,
          commit: c ? Math.max(0, shown - c.revealPx) : 0,
          phase: phaseFor(edge, shown),
          firedActionId: firedSide.current === edge ? firedActionId.current : null,
          selectedActionId: selected.current[edge],
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
        setStage(edge, 0);
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
     * `action` is omitted by the scroll path, which always commits to the EDGEMOST
     * one — the last in the array, hard against the container edge. A tap or a drag
     * names its own instead, which is the point of having more than one: the scroll
     * gesture stays the fast, unambiguous default, and the others stay reachable.
     */
    const fire = (edge: Edge, action?: ScrollAction) => {
      const c = sideCfg(edge);
      if (!c || !c.actions.length) return;
      if (firedSide.current || returning.current) return;
      const chosen = action ?? c.actions[c.actions.length - 1];
      firedSide.current = edge;
      firedActionId.current = chosen.id;
      selected.current = { start: null, end: null };
      clearHold();
      publish();
      c.onCommit?.(chosen);
      setTimeout(() => withdraw(edge), FIRED_HOLD_MS);
    };
    fireRef.current = fire;

    const onScroll = () => {
      const m = publish();

      // Behaviours get first refusal — the scroll path fires on arrival, and a fired
      // side must not then have its pads tidied out from under the animation.
      for (const cb of subscribers.current) cb(m);
      if (firedSide.current || returning.current) return;

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
      for (const edge of ['start', 'end'] as Edge[]) {
        if (!sideCfg(edge) || stages.current[edge] === 0) continue;
        const shown = edge === 'start' ? m.startShown : m.endShown;
        if (shown > 0) continue; // being travelled — leave it alone
        const parkedHere =
          edge === 'start' ? m.pos <= m.startPad + 1 : m.pos >= m.max - m.endPad - 1;
        if (!parkedHere) setStage(edge, 0);
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
    };

    surface.current = {
      el,
      horiz,
      cfg: () => cfg.current,
      sideCfg,
      read,
      write,
      measure,
      publish,
      stageOf: (edge) => stages.current[edge],
      setStage,
      fire,
      withdraw,
      stopReturn,
      busy: () => firedSide.current !== null || returning.current,
      isDragging: () => draggingRef.current,
      setSelected: (edge, id) => {
        if (selected.current[edge] === id) return;
        selected.current[edge] = id;
        publish();
      },
      setDragging: (on: boolean) => {
        draggingRef.current = on;
        setDraggingState(on);
      },
      onSync: (cb) => {
        subscribers.current.add(cb);
        return () => subscribers.current.delete(cb);
      },
      onShift: (cb) => {
        shiftSubs.current.add(cb);
        return () => shiftSubs.current.delete(cb);
      },
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    publish();
    return () => {
      el.removeEventListener('scroll', onScroll);
      clearHold();
      stopReturn();
      surface.current = null;
    };
    // Config is read through a ref, so the listener is installed exactly once.
  }, [scrollerRef, startPadRef, endPadRef]);

  return {
    start: startState,
    end: endState,
    dragging: draggingState,
    surface,
    activate: (edge: Edge, action: ScrollAction) => fireRef.current?.(edge, action),
  };
}
