import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import type { Scope } from './types';

export interface SwipeEvent {
  direction: 'left' | 'right' | 'up' | 'down';
  dx: number;
  dy: number;
  dt: number;
  target: Element | null;
  /** clientX of the original pointerdown that began this swipe. */
  startX: number;
  /** clientY of the original pointerdown that began this swipe. */
  startY: number;
  /** clientX of the pointerup that ended this swipe. */
  endX: number;
  /** clientY of the pointerup that ended this swipe. */
  endY: number;
}

export interface PressEvent {
  target: Element | null;
}

export interface ClickEvent {
  target: Element | null;
}

export interface GestureCallbacks {
  onClick?:     (e: ClickEvent) => void;
  onSwipe?:     (e: SwipeEvent) => void;
  onLongPress?: (e: PressEvent) => void;
  /** Swipe threshold in pixels (default 60). */
  swipeMinPx?:  number;
  /** Click vs swipe boundary; below this any motion is still a click (default 20). */
  clickMaxPx?:  number;
  /** Long-press timer in ms (default 500). */
  longPressMs?: number;
  /** Long-press cancels if pointer moves more than this many px (default 10). */
  longPressTolerancePx?: number;
}

export function useGesture(
  // The scope is unused inside the hook but accepted so callers carry it consistently for surface-aware trigger resolution downstream.
  _scope: Scope,
  ref: RefObject<HTMLElement | null>,
  opts: GestureCallbacks,
): void {
  const optsRef = useRef(opts);
  useLayoutEffect(() => {
    optsRef.current = opts;
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let startX = 0;
    let startY = 0;
    let startT = 0;
    let pointerId: number | null = null;
    let longPressTimer: ReturnType<typeof setTimeout> | null = null;

    const clearLongPress = () => {
      if (longPressTimer !== null) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    };

    const onDown = (ev: PointerEvent) => {
      if (pointerId !== null) return;
      pointerId = ev.pointerId;
      startX = ev.clientX;
      startY = ev.clientY;
      startT = Date.now();
      // Capture the pointer so subsequent move/up events fire on this element
      // even if the cursor leaves its bounds. Without this, horizontal mouse
      // drags are eaten by the panel container's scroll-snap.
      try { el.setPointerCapture(ev.pointerId); } catch { /* not supported in some test envs */ }

      const o = optsRef.current;
      if (o.onLongPress) {
        const tolerance = o.longPressTolerancePx ?? 10;
        const ms = o.longPressMs ?? 500;
        longPressTimer = setTimeout(() => {
          longPressTimer = null;
          // long-press only fires if we still hold the pointer with negligible movement.
          // (Move handler clears the timer if motion exceeds tolerance.)
          o.onLongPress!({ target: ev.target as Element | null });
        }, ms);
        // Capture tolerance for the move handler:
        (el as HTMLElement & { _lpTol?: number })._lpTol = tolerance;
      }
    };

    const onMove = (ev: PointerEvent) => {
      if (pointerId === null || ev.pointerId !== pointerId) return;
      const dx = Math.abs(ev.clientX - startX);
      const dy = Math.abs(ev.clientY - startY);
      const tol = (el as HTMLElement & { _lpTol?: number })._lpTol ?? 10;
      if (dx > tol || dy > tol) {
        clearLongPress();
      }
    };

    const onUp = (ev: PointerEvent) => {
      if (pointerId === null || ev.pointerId !== pointerId) return;
      clearLongPress();
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      const dt = Date.now() - startT;
      const o = optsRef.current;
      const swipeMin = o.swipeMinPx ?? 60;
      const clickMax = o.clickMaxPx ?? 20;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      const target = ev.target as Element | null;
      pointerId = null;

      if (absDx >= swipeMin || absDy >= swipeMin) {
        const direction: SwipeEvent['direction'] =
          absDx >= absDy
            ? (dx >= 0 ? 'right' : 'left')
            : (dy >= 0 ? 'down' : 'up');
        o.onSwipe?.({
          direction, dx, dy, dt, target,
          startX, startY,
          endX: ev.clientX, endY: ev.clientY,
        });
        return;
      }

      if (absDx <= clickMax && absDy <= clickMax) {
        o.onClick?.({ target });
      }
      // else: ambiguous gesture (between clickMax and swipeMin) — no callback fires.
    };

    const onCancel = (ev: PointerEvent) => {
      if (ev.pointerId === pointerId) {
        clearLongPress();
        pointerId = null;
        try { el.releasePointerCapture(ev.pointerId); } catch { /* not held */ }
      }
    };

    el.addEventListener('pointerdown',   onDown   as EventListener);
    el.addEventListener('pointermove',   onMove   as EventListener);
    el.addEventListener('pointerup',     onUp     as EventListener);
    el.addEventListener('pointercancel', onCancel as EventListener);

    return () => {
      el.removeEventListener('pointerdown',   onDown   as EventListener);
      el.removeEventListener('pointermove',   onMove   as EventListener);
      el.removeEventListener('pointerup',     onUp     as EventListener);
      el.removeEventListener('pointercancel', onCancel as EventListener);
      clearLongPress();
    };
  }, [ref]);
}
