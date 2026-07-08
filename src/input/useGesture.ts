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
  /** Running deltas from the pointerdown point, fired on every pointermove of a captured drag. */
  onDrag?:      (dx: number, dy: number) => void;
  /**
   * Fired on release (or cancel) of any gesture that actually moved — even in
   * the ambiguous zone between clickMaxPx and swipeMinPx where neither onClick
   * nor onSwipe fires. Consumers that paint during onDrag use this to settle
   * (commit or spring back) on every release.
   */
  onDragEnd?:   (dx: number, dy: number, dt: number) => void;
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
    // True iff onLongPress fired during the current gesture cycle. When set,
    // the matching pointerup suppresses onClick — long-press and click are
    // mutually exclusive interpretations of the same gesture, so a held tap
    // shouldn't also count as a tap.
    let longPressFired = false;
    // True once the current pointer sequence produced any pointermove (i.e.
    // onDrag fired). Gates onDragEnd so motionless taps stay pure clicks.
    let dragged = false;

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
      longPressFired = false;
      dragged = false;
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
          longPressFired = true;
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
      dragged = true;
      optsRef.current.onDrag?.(ev.clientX - startX, ev.clientY - startY);
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

      // Any real drag gets a release signal, regardless of how the gesture is
      // classified below — a 20–60px pull must still settle (spring back).
      if (dragged) o.onDragEnd?.(dx, dy, dt);

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

      if (absDx <= clickMax && absDy <= clickMax && !longPressFired) {
        o.onClick?.({ target });
      }
      // else: ambiguous gesture (between clickMax and swipeMin), or long-press
      // already fired this cycle — no callback fires.
    };

    const onCancel = (ev: PointerEvent) => {
      if (ev.pointerId === pointerId) {
        clearLongPress();
        pointerId = null;
        try { el.releasePointerCapture(ev.pointerId); } catch { /* not held */ }
        // An aborted drag still needs to settle (spring back).
        if (dragged) {
          optsRef.current.onDragEnd?.(
            ev.clientX - startX,
            ev.clientY - startY,
            Date.now() - startT,
          );
        }
        dragged = false;
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
