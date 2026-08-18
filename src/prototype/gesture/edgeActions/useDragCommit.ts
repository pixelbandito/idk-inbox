import { useEffect, useRef, type RefObject } from 'react';
import { actionSize, clamp, type Edge, type ScrollAction, type Surface } from './types';

// The DRAG input model: one continuous motion, and distance chooses.
//
// Where the scroll path stops-then-travels and always commits to the edgemost
// action, a drag has an explicit start and an explicit release — so it needs neither
// the stops nor the single fixed meaning:
//
//   - It opens the rooms as it goes. There is no settle and no gate, because a drag
//     cannot be confused with inertia: you are still holding it.
//   - DISTANCE SELECTS. One action-width in picks the edgemost action, two picks the
//     next one inward, and so on. Releasing runs whichever one you are on; releasing
//     short of the first width runs nothing and springs back.
//
// That is the whole reason to have both. Scrolling is the fast, unambiguous path to
// the obvious action; dragging is how you reach the others without lifting into a
// menu — and the selection is legible the entire time, because the action you are
// on is the one lit up.

/** Movement before a drag claims the pointer, and the axis-arbitration threshold. */
const DRAG_SLOP = 6;

export function useDragCommit(surfaceRef: RefObject<Surface | null>, enabled = true) {
  /** True immediately after a drag, so the click it synthesises is swallowed. */
  const swallowClick = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    const s0 = surfaceRef.current;
    if (!s0) return;
    const el = s0.el;

    const drag = { id: -1, live: false, startAlong: 0, startAcross: 0, startPos: 0 };

    const along = (e: PointerEvent) => (s0.horiz ? e.clientX : e.clientY);
    const across = (e: PointerEvent) => (s0.horiz ? e.clientY : e.clientX);

    /** Which action this much travel is pointing at, or null if not far enough in. */
    const selectionFor = (s: Surface, edge: Edge, shown: number): ScrollAction | null => {
      const c = s.sideCfg(edge);
      if (!c || !c.actions.length) return null;
      const step = actionSize(c);
      // Below one full width nothing is chosen: the first action must be completely
      // uncovered before releasing can mean anything, or a twitch would fire it.
      const steps = Math.floor(shown / step);
      if (steps < 1) return null;
      const fromEdge = clamp(steps - 1, 0, c.actions.length - 1);
      return c.actions[c.actions.length - 1 - fromEdge];
    };

    const liveSide = (s: Surface): Edge | null => {
      const m = s.measure();
      if (m.endShown > 0) return 'end';
      if (m.startShown > 0) return 'start';
      return null;
    };

    /**
     * Open whatever room this drag is asking for, right now.
     *
     * A drag earns its stops by being a drag — it has an explicit start, so there is
     * nothing to distinguish it from inertia and nothing to wait for.
     *
     * `desired` is recomputed each pass rather than held: any pad change may shift
     * the coordinate space, `onShift` moves this drag's origin to match, and a value
     * computed before that would be stale by exactly the pad's width.
     */
    const openFor = (s: Surface, moved: number) => {
      for (let guard = 0; guard < 4; guard++) {
        const desired = drag.startPos + moved;
        const { max } = s.read();
        if (desired > max && s.sideCfg('end') && s.stageOf('end') < 2) {
          s.setStage('end', s.stageOf('end') + 1);
        } else if (desired < 0 && s.sideCfg('start') && s.stageOf('start') < 2) {
          s.setStage('start', s.stageOf('start') + 1);
        } else {
          return;
        }
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      const s = surfaceRef.current;
      // Touch is excluded on purpose: `touch-action` already has the browser panning
      // for a finger, and handling pointer events too would fight it. Finger and
      // trackpad get the scroll path; a mouse gets to drag.
      if (!s || e.pointerType === 'touch' || s.busy()) return;
      drag.id = e.pointerId;
      drag.live = false;
      drag.startAlong = along(e);
      drag.startAcross = across(e);
      drag.startPos = s.read().pos;
    };

    const onPointerMove = (e: PointerEvent) => {
      const s = surfaceRef.current;
      if (!s || e.pointerId !== drag.id) return;
      const moved = drag.startAlong - along(e);
      const sideways = Math.abs(drag.startAcross - across(e));

      if (!drag.live) {
        if (Math.abs(moved) < DRAG_SLOP && sideways < DRAG_SLOP) return;
        // Axis arbitration. These surfaces NEST — horizontal rows inside a vertical
        // card — and both see the same pointer, so the one whose axis the gesture is
        // actually on has to claim it and the other has to let go. Without this a
        // drag anywhere on a row moves the row and the card at once.
        if (Math.abs(moved) <= sideways) {
          drag.id = -1;
          return;
        }
        drag.live = true;
        el.setPointerCapture(e.pointerId);
        el.style.userSelect = 'none';
        s.stopReturn();
        s.setDragging(true);
      }

      openFor(s, moved);
      const { max } = s.read();
      // Recomputed AFTER opening: `openFor` can shift the origin under us.
      s.write(clamp(drag.startPos + moved, 0, max));

      const m = s.publish();
      const edge = m.endShown > 0 ? 'end' : m.startShown > 0 ? 'start' : null;
      s.setSelected('start', null);
      s.setSelected('end', null);
      if (edge) {
        const shown = edge === 'end' ? m.endShown : m.startShown;
        s.setSelected(edge, selectionFor(s, edge, shown)?.id ?? null);
      }
    };

    const endDrag = () => {
      const s = surfaceRef.current;
      const wasLive = drag.live;
      drag.id = -1;
      drag.live = false;
      if (!s || !wasLive) return;
      el.style.userSelect = '';
      s.setDragging(false);

      const edge = liveSide(s);
      s.setSelected('start', null);
      s.setSelected('end', null);
      if (!edge) return;

      const m = s.measure();
      const shown = edge === 'end' ? m.endShown : m.startShown;
      const chosen = selectionFor(s, edge, shown);
      // Releasing IS the commit — a drag does not need to run out a further distance
      // the way a scroll does, because letting go is already an unambiguous act.
      swallowClick.current = true;
      setTimeout(() => { swallowClick.current = false; }, 400);
      if (chosen) s.fire(edge, chosen);
      else s.withdraw(edge);
    };

    // Follow any shift the surface makes to hold content still — most importantly the
    // leading pad being surrendered on the first move of a drag away from it.
    const offShift = s0.onShift((delta) => {
      drag.startPos += delta;
    });

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', endDrag);
    el.addEventListener('pointercancel', endDrag);
    return () => {
      offShift();
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', endDrag);
      el.removeEventListener('pointercancel', endDrag);
      el.style.userSelect = '';
    };
  }, [surfaceRef, enabled]);

  return { swallowClick };
}
