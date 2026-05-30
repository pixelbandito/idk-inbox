import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

export interface OverscrollOpts {
  edge: 'top' | 'bottom';
  minPx: number;
  onFire: () => void;
}

/**
 * Watches an element's wheel/touch events for "overscroll past the edge" —
 * once the user has accumulated `minPx` of scroll attempts past the given
 * edge while already at it, `onFire` is called exactly once per gesture.
 *
 * Wheel deltas reset whenever the element is no longer at the edge.
 * Touch gestures reset on touchend/touchcancel.
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
    let fired = false;

    const atEdge = () => {
      const o = optsRef.current;
      if (o.edge === 'bottom') {
        return el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
      }
      return el.scrollTop <= 0;
    };

    const tryFire = () => {
      const o = optsRef.current;
      if (!fired && accumulated >= o.minPx) {
        fired = true;
        o.onFire();
      }
    };

    const onWheel = (e: WheelEvent) => {
      const o = optsRef.current;
      if (!atEdge()) { accumulated = 0; return; }
      const delta = o.edge === 'bottom' ? Math.max(0, e.deltaY) : Math.max(0, -e.deltaY);
      accumulated += delta;
      tryFire();
    };

    const onTouchStart = (e: TouchEvent) => {
      touchY = e.touches[0]?.clientY ?? null;
      if (!atEdge()) accumulated = 0;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (touchY === null) return;
      const o = optsRef.current;
      const cur = e.touches[0]?.clientY ?? touchY;
      if (!atEdge()) { accumulated = 0; touchY = cur; return; }
      // For bottom: pulling up (cur < touchY) means scrolling past the bottom.
      const delta = o.edge === 'bottom' ? Math.max(0, touchY - cur) : Math.max(0, cur - touchY);
      accumulated += delta;
      touchY = cur;
      tryFire();
    };

    const onTouchEnd = () => {
      accumulated = 0;
      touchY = null;
      fired = false;
    };

    el.addEventListener('wheel',       onWheel,       { passive: true });
    el.addEventListener('touchstart',  onTouchStart,  { passive: true });
    el.addEventListener('touchmove',   onTouchMove,   { passive: true });
    el.addEventListener('touchend',    onTouchEnd);
    el.addEventListener('touchcancel', onTouchEnd);

    return () => {
      el.removeEventListener('wheel',       onWheel);
      el.removeEventListener('touchstart',  onTouchStart);
      el.removeEventListener('touchmove',   onTouchMove);
      el.removeEventListener('touchend',    onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [ref]);
}
