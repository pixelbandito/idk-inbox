import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

export interface OverscrollOpts {
  edge: 'top' | 'bottom';
  minPx: number;
  onFire: () => void;
  /** Reports overscroll progress 0..1 (accumulated / minPx) so a UI can show
   *  an affordance and the user knows a deliberate pull is required. */
  onProgress?: (fraction: number) => void;
}

// A wheel stream with no more events for this long counts as "released".
const WHEEL_SETTLE_MS = 180;

/**
 * Watches an element's wheel/touch events for a deliberate "pull past the edge".
 * Unlike a mid-scroll trigger, it fires on RELEASE (finger lift / wheel settle)
 * only when the accumulated past-edge distance reached `minPx` — so a quick
 * flick to the bottom, which overshoots briefly and lets go, doesn't fire.
 * `onProgress` reports how far along the pull is for a visible affordance.
 */
export function useOverscroll(ref: RefObject<HTMLElement | null>, opts: OverscrollOpts): void {
  const optsRef = useRef(opts);
  useLayoutEffect(() => {
    optsRef.current = opts;
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let accumulated = 0;
    let touchY: number | null = null;
    let settleTimer: ReturnType<typeof setTimeout> | null = null;

    const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);
    const report = () => optsRef.current.onProgress?.(clamp01(accumulated / optsRef.current.minPx));

    const atEdge = () => {
      const o = optsRef.current;
      if (o.edge === 'bottom') return el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
      return el.scrollTop <= 0;
    };

    const resetTo = (value: number) => {
      if (accumulated !== value) { accumulated = value; report(); }
    };

    const release = () => {
      if (settleTimer) { clearTimeout(settleTimer); settleTimer = null; }
      const o = optsRef.current;
      if (accumulated >= o.minPx) o.onFire();
      resetTo(0);
    };

    const onWheel = (e: WheelEvent) => {
      const o = optsRef.current;
      if (!atEdge()) { resetTo(0); return; }
      const delta = o.edge === 'bottom' ? Math.max(0, e.deltaY) : Math.max(0, -e.deltaY);
      if (delta <= 0) return;
      accumulated += delta;
      report();
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = setTimeout(release, WHEEL_SETTLE_MS);
    };

    const onTouchStart = (e: TouchEvent) => {
      touchY = e.touches[0]?.clientY ?? null;
      if (!atEdge()) resetTo(0);
    };

    const onTouchMove = (e: TouchEvent) => {
      if (touchY === null) return;
      const o = optsRef.current;
      const cur = e.touches[0]?.clientY ?? touchY;
      if (!atEdge()) { resetTo(0); touchY = cur; return; }
      const delta = o.edge === 'bottom' ? Math.max(0, touchY - cur) : Math.max(0, cur - touchY);
      accumulated += delta;
      touchY = cur;
      report();
    };

    const onTouchEnd = () => {
      touchY = null;
      release();
    };

    el.addEventListener('wheel',       onWheel,       { passive: true });
    el.addEventListener('touchstart',  onTouchStart,  { passive: true });
    el.addEventListener('touchmove',   onTouchMove,   { passive: true });
    el.addEventListener('touchend',    onTouchEnd);
    el.addEventListener('touchcancel', onTouchEnd);

    return () => {
      if (settleTimer) clearTimeout(settleTimer);
      el.removeEventListener('wheel',       onWheel);
      el.removeEventListener('touchstart',  onTouchStart);
      el.removeEventListener('touchmove',   onTouchMove);
      el.removeEventListener('touchend',    onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [ref]);
}
