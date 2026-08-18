import { useEffect, type RefObject } from 'react';
import type { Edge, Surface } from './types';

// The SCROLL input model: stop, travel, stop, travel, act.
//
//   rest at the edge   → the pad for the next step is prepared, invisibly
//   travel it          → the actions on that side are revealed
//   rest again         → a second pad is prepared beyond the first
//   travel that        → the EDGEMOST action on that side fires
//
// Preparing a pad in advance rather than on the scroll that uses it is what makes
// each step read as motion: the next scroll is travel from its first pixel, with
// nothing spent asking for room. Preparing it only once INPUT has gone quiet is what
// keeps it safe — the pad cannot appear underneath a gesture that is still running,
// so a fling has nowhere to spend its tail.
//
// A scroll has no release, so it needs exactly one meaning: it always commits to the
// edgemost action. Choosing between several is the drag's job.

export function useScrollCommit(surfaceRef: RefObject<Surface | null>, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    let settleTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    const withSurface = (fn: (s: Surface) => void) => {
      const s = surfaceRef.current;
      if (s && !disposed) fn(s);
    };

    /**
     * Prepare the pad for the next step on whichever side we have come to rest
     * against. Fired by the settle clock, which is fed by INPUT — see `onInput`.
     */
    const prepare = () => withSurface((s) => {
      if (s.busy() || s.isDragging()) return;

      // No "has the scroll finished animating?" gate here, deliberately.
      //
      // One was added on the theory that resizing a pad mid-animation cancels it and
      // truncates the travel. That theory was wrong: the truncation was a pad shrink
      // subtracting its own width from the scroll position TWICE (see `setStage`).
      // With that fixed, resizing during an animation is harmless, and the gate was
      // pure latency — the thing that makes a surface feel like it is thinking.
      // Input going quiet is the only wait that buys anything.
      const m = s.measure();
      const advance = (edge: Edge, atContentEdge: boolean, fullyRevealed: boolean) => {
        const c = s.sideCfg(edge);
        if (!c) return;
        if (s.stageOf(edge) === 0 && atContentEdge) s.setStage(edge, 1);
        else if (s.stageOf(edge) === 1 && fullyRevealed) s.setStage(edge, 2);
      };
      advance(
        'start',
        m.pos <= m.startPad + 1 && m.startShown <= 0,
        m.startShown >= (s.sideCfg('start')?.revealPx ?? 0) - 1,
      );
      advance(
        'end',
        m.pos >= m.max - m.endPad - 1 && m.endShown <= 0,
        m.endShown >= (s.sideCfg('end')?.revealPx ?? 0) - 1,
      );
      s.publish();
    });

    const restartSettle = () => {
      if (settleTimer) clearTimeout(settleTimer);
      const ms = surfaceRef.current?.cfg().settleMs ?? 30;
      settleTimer = setTimeout(prepare, ms);
    };

    // INPUT is what the settle clock listens to. Keyed on scrolling it would be wrong
    // in the only case that matters: pinned at a boundary, the position stops changing
    // and scroll events stop with it, while the platform is still delivering momentum.
    // The clock would expire mid-fling and prepare a pad under a live gesture, which
    // is precisely how a fling walks through an offer.
    const onInput = () => withSurface((s) => {
      restartSettle();
      if (!s.busy()) return;
    });

    const el = surfaceRef.current?.el;
    if (!el) return;

    // The commit is a POSITION, never an event: arriving at the far end of the commit
    // pad IS the action. Nothing can stall it, because there is nothing to refuse —
    // only distance you have or have not run.
    const offSync = surfaceRef.current!.onSync((m) => withSurface((s) => {
      // Stand down for a drag. It moves the position past the commit distance on
      // purpose, to select with it — reading that as "arrived, fire the edgemost"
      // would run the wrong action before the user has even let go.
      if (s.busy() || s.isDragging()) return;
      for (const edge of ['start', 'end'] as Edge[]) {
        const c = s.sideCfg(edge);
        if (!c || s.stageOf(edge) !== 2) continue;
        const shown = edge === 'start' ? m.startShown : m.endShown;
        if (shown >= c.revealPx + c.commitPx - 1) {
          s.fire(edge);
          return;
        }
      }
      restartSettle();
    }));

    el.addEventListener('wheel', onInput, { passive: true });
    el.addEventListener('touchmove', onInput, { passive: true });
    // A surface at rest is already AT a boundary, so its first pad is earned without
    // anyone touching it. Without this the very first gesture on a fresh surface has
    // nowhere to go and is spent preparing instead of travelling — the dead first
    // scroll all over again, just relocated to mount.
    restartSettle();

    return () => {
      disposed = true;
      offSync();
      el.removeEventListener('wheel', onInput);
      el.removeEventListener('touchmove', onInput);
      if (settleTimer) clearTimeout(settleTimer);
    };
  }, [surfaceRef, enabled]);
}
