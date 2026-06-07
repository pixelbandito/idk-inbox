// fromGesture — translates raw pointer gestures from useGesture into the
// trigger system's AbstractEvent shape.
//
// Responsibilities:
//   1. Walk up from the raw event target to find the closest data-surface
//      ancestor (the "surface element"). Fall back to documentElement +
//      surface='document'.
//   2. Retarget event.target to the surface element (per the design doc's
//      retargeting step — triggers should see the surface, not whatever
//      nested span the user happened to land on).
//   3. For swipes: compute CSS-logical axis/towards from raw deltas + the
//      document direction, plus surface-relative Distance values (fraction +
//      pixels) for the swipe magnitude, the start-edge distance, and the
//      end-edge distance.
//
// What it does NOT do:
//   - Overscroll. The legacy useOverscroll is separate; Step 4 Task 15 will
//     fold it in. TODO: add a useOverscrollProducer or extend this one.
//   - Pull dt out of long-press. useGesture doesn't currently expose it on
//     long-press; pass 0 for now. TODO: extend useGesture's PressEvent.

import { useCallback, type RefObject } from 'react';
import {
  useGesture,
  type ClickEvent,
  type PressEvent,
  type SwipeEvent,
} from '../../input/useGesture';
import type { Scope } from '../../input/types';
import type { AbstractEvent, Distance, Surface } from '../types';

// ---------- helpers ----------

const VALID_SURFACES: ReadonlySet<string> = new Set<Surface>([
  'row', 'panel-header', 'panel-body', 'document', 'overlay',
]);

interface ResolvedSurface {
  surface:    Surface;
  surfaceEl:  Element;
}

/** Walk up from a raw event target to find the closest [data-surface] ancestor. */
function resolveSurface(target: Element | null): ResolvedSurface {
  if (target) {
    const found = target.closest('[data-surface]') as HTMLElement | null;
    if (found) {
      const raw = found.dataset.surface;
      if (raw && VALID_SURFACES.has(raw)) {
        return { surface: raw as Surface, surfaceEl: found };
      }
    }
  }
  return { surface: 'document', surfaceEl: document.documentElement };
}

function documentDirection(): 'ltr' | 'rtl' {
  // Reading getComputedStyle once per emission is cheap. Defaults to ltr.
  const dir = getComputedStyle(document.documentElement).direction;
  return dir === 'rtl' ? 'rtl' : 'ltr';
}

function clampFraction(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function distance(pixels: number, surfaceSize: number): Distance {
  const safePx = pixels < 0 ? 0 : pixels;
  const safeSize = surfaceSize > 0 ? surfaceSize : 1;
  return { pixels: safePx, fraction: clampFraction(safePx / safeSize) };
}

interface SwipeGeometry {
  axis:              'inline' | 'block';
  towards:           'start' | 'end';
  distance:          Distance;
  startEdgeDistance: Distance;
  endEdgeDistance:   Distance;
}

/** Pure swipe-geometry calculation, exported for tests. */
export function computeSwipeGeometry(
  dx: number, dy: number,
  startX: number, startY: number,
  endX: number, endY: number,
  rect: { left: number; right: number; top: number; bottom: number; width: number; height: number },
  dir: 'ltr' | 'rtl',
): SwipeGeometry {
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  const axis: 'inline' | 'block' = absDx >= absDy ? 'inline' : 'block';

  let towards: 'start' | 'end';
  if (axis === 'inline') {
    // In LTR, +dx = end; in RTL, +dx = start.
    if (dir === 'rtl') towards = dx >= 0 ? 'start' : 'end';
    else               towards = dx >= 0 ? 'end'   : 'start';
  } else {
    towards = dy >= 0 ? 'end' : 'start';
  }

  const surfaceSize = axis === 'inline' ? rect.width : rect.height;
  const magnitude   = axis === 'inline' ? absDx     : absDy;

  // start/end-edge distances are measured along the swipe axis from the
  // pointerdown / pointerup position to the surface's start / end edge.
  let startEdgePx: number;
  let endEdgePx:   number;
  if (axis === 'inline') {
    if (dir === 'rtl') {
      // Inline-start edge is the right edge; inline-end edge is the left edge.
      startEdgePx = rect.right - startX;
      endEdgePx   = endX - rect.left;
    } else {
      startEdgePx = startX - rect.left;
      endEdgePx   = rect.right - endX;
    }
  } else {
    startEdgePx = startY - rect.top;
    endEdgePx   = rect.bottom - endY;
  }

  return {
    axis, towards,
    distance:          distance(magnitude,    surfaceSize),
    startEdgeDistance: distance(startEdgePx,  surfaceSize),
    endEdgeDistance:   distance(endEdgePx,    surfaceSize),
  };
}

// ---------- the hook ----------

/**
 * Mount a gesture producer on `ref`. Each emitted AbstractEvent carries a
 * surface (derived from the closest data-surface ancestor of the raw target)
 * and, for swipes, CSS-logical axis/towards plus surface-relative Distance
 * triplet (overall, from the start edge, from the end edge).
 *
 * Scope is accepted for parity with useGesture and to keep call sites
 * consistent; the producer doesn't consult it (surface comes from the DOM).
 */
export function useGestureProducer(
  scope:   Scope,
  ref:     RefObject<HTMLElement | null>,
  onEvent: (e: AbstractEvent) => void,
): void {
  const onClick = useCallback((raw: ClickEvent) => {
    const { surface, surfaceEl } = resolveSurface(raw.target);
    onEvent({ kind: 'gesture-click', surface, target: surfaceEl });
  }, [onEvent]);

  const onLongPress = useCallback((raw: PressEvent) => {
    const { surface, surfaceEl } = resolveSurface(raw.target);
    // TODO: useGesture doesn't expose dt on long-press today; report 0.
    onEvent({ kind: 'gesture-long-press', surface, target: surfaceEl, dt: 0 });
  }, [onEvent]);

  const onSwipe = useCallback((raw: SwipeEvent) => {
    const { surface, surfaceEl } = resolveSurface(raw.target);
    const rect = surfaceEl.getBoundingClientRect();
    const dir  = documentDirection();
    const geom = computeSwipeGeometry(
      raw.dx, raw.dy,
      raw.startX, raw.startY,
      raw.endX,   raw.endY,
      rect, dir,
    );
    onEvent({
      kind:    'gesture-swipe',
      surface,
      target:  surfaceEl,
      axis:    geom.axis,
      towards: geom.towards,
      distance:          geom.distance,
      startEdgeDistance: geom.startEdgeDistance,
      endEdgeDistance:   geom.endEdgeDistance,
      dt:      raw.dt,
    });
  }, [onEvent]);

  useGesture(scope, ref, { onClick, onLongPress, onSwipe });
}
