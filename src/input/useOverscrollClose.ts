// useOverscrollClose — a deliberate "pull past the bottom to close" gesture with
// two gates you can see: distance AND commitment. Replaces the old fire-on-
// release overscroll, which was distance-only and tripped on trackpad momentum.
//
// Touch (pull-and-hold):
//   pull past the bottom → cross the arm distance → HOLD for dwellMs → release
//   closes. Let go before the dwell completes and it springs back, no-op.
//
// Wheel/trackpad (pull, then the spring-back buffer):
//   push past the arm distance → armed. When the wheel goes quiet the view eases
//   slowly back toward the edge and the armed affordance stays lit for bufferMs.
//   During that window: push again to keep it alive, scroll BACK to cancel, or
//   do nothing and it closes. (Passive drift-back commits; only an active
//   scroll-back cancels — mirroring touch's hold-then-release.)
//
// The hook drives visuals imperatively (a `--close-pull` px var + a
// `data-close-phase` attribute on the element, and a springing class for the
// CSS ease), and reports phase changes to React for the hint text.

import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

export type ClosePhase = 'idle' | 'pulling' | 'armed' | 'ready';
export type CloseMode = 'touch' | 'wheel' | null;

export interface OverscrollCloseOpts {
  onFire: () => void;
  onPhase?: (phase: ClosePhase, mode: CloseMode) => void;
  /** Past-edge distance (px) that arms the gesture. */
  armPx?: number;
  /** Touch: hold time past the arm distance before a release will close. */
  dwellMs?: number;
  /** Wheel: grace window after the wheel settles before it commits. */
  bufferMs?: number;
}

const DEFAULTS = { armPx: 90, dwellMs: 450, bufferMs: 700 };
// A wheel stream idle this long counts as "settled" → begin the buffer.
const WHEEL_SETTLE_MS = 130;
// Wheel deltas are coarse; damp them so the pull tracks the hand, not momentum.
const WHEEL_DAMP = 0.6;
// Quick spring when a touch is released early (vs the slow wheel buffer ease).
const TOUCH_SPRING_MS = 260;

export function useOverscrollClose(ref: RefObject<HTMLElement | null>, opts: OverscrollCloseOpts): void {
  const optsRef = useRef(opts);
  useLayoutEffect(() => { optsRef.current = opts; });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const cfg = () => ({ ...DEFAULTS, ...optsRef.current });

    let mode: CloseMode = null;
    let pull = 0;
    let phase: ClosePhase = 'idle';
    let touchY: number | null = null;
    let dwellTimer: ReturnType<typeof setTimeout> | null = null;
    let bufferTimer: ReturnType<typeof setTimeout> | null = null;
    let settleTimer: ReturnType<typeof setTimeout> | null = null;

    const atBottom = () => el.scrollTop + el.clientHeight >= el.scrollHeight - 1;

    const clearTimers = () => {
      for (const t of [dwellTimer, bufferTimer, settleTimer]) if (t) clearTimeout(t);
      dwellTimer = bufferTimer = settleTimer = null;
    };

    const setPhase = (next: ClosePhase) => {
      if (next === phase) return;
      phase = next;
      el.dataset.closePhase = next;
      optsRef.current.onPhase?.(next, mode);
    };

    const paint = (springMs = 0) => {
      el.style.setProperty('--close-pull', `${Math.round(pull)}px`);
      el.style.setProperty('--close-spring', springMs > 0 ? `${springMs}ms` : '0ms');
    };

    // Return to rest — optionally easing (spring) rather than snapping.
    const reset = (springMs = 0) => {
      clearTimers();
      mode = null;
      touchY = null;
      pull = 0;
      setPhase('idle');
      delete el.dataset.closePhase;
      paint(springMs);
    };

    const fire = () => {
      clearTimers();
      const done = optsRef.current.onFire;
      reset();
      done();
    };

    // Recompute phase from the current pull for a direct (dragging) update.
    const reflectPull = (springMs = 0) => {
      const { armPx, dwellMs } = cfg();
      paint(springMs);
      if (pull <= 0) { setPhase('idle'); return; }
      if (pull < armPx) {
        if (dwellTimer) { clearTimeout(dwellTimer); dwellTimer = null; }
        setPhase('pulling');
        return;
      }
      // Past the arm distance.
      if (phase !== 'armed' && phase !== 'ready') {
        setPhase('armed');
        if (mode === 'touch') {
          dwellTimer = setTimeout(() => { dwellTimer = null; setPhase('ready'); }, dwellMs);
        }
      }
    };

    // ---- Touch: pull-and-hold ------------------------------------------------
    const onTouchStart = (e: TouchEvent) => {
      if (!atBottom()) return;
      mode = 'touch';
      touchY = e.touches[0]?.clientY ?? null;
      pull = 0;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (mode !== 'touch' || touchY === null) return;
      if (!atBottom()) { reset(); return; }
      const y = e.touches[0]?.clientY ?? touchY;
      pull = Math.max(0, pull + (touchY - y)); // up-drag past the bottom grows the pull
      touchY = y;
      reflectPull();
    };
    const onTouchEnd = () => {
      if (mode !== 'touch') return;
      if (phase === 'ready') fire();
      else reset(TOUCH_SPRING_MS);
    };

    // ---- Wheel: pull, then the spring-back buffer ----------------------------
    const beginBuffer = () => {
      // Ease the view back over the buffer while the affordance stays lit; if
      // nothing intervenes, commit at the end.
      const { bufferMs } = cfg();
      pull = 0;
      paint(bufferMs);
      bufferTimer = setTimeout(fire, bufferMs);
    };

    const onWheel = (e: WheelEvent) => {
      if (!atBottom()) { if (pull > 0) reset(); return; }
      mode = 'wheel';

      if (e.deltaY < 0) {
        // Scrolling back into the content.
        if (phase === 'armed' || phase === 'ready') { reset(TOUCH_SPRING_MS); return; } // active cancel
        pull = Math.max(0, pull + e.deltaY * WHEEL_DAMP);
        reflectPull();
        return;
      }
      if (e.deltaY === 0) return;

      // Pushing further past the edge — (re)arm and keep it alive.
      if (bufferTimer) { clearTimeout(bufferTimer); bufferTimer = null; }
      pull += e.deltaY * WHEEL_DAMP;
      reflectPull();
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = setTimeout(() => {
        settleTimer = null;
        if (phase === 'armed') beginBuffer();
        else reset(TOUCH_SPRING_MS);
      }, WHEEL_SETTLE_MS);
    };

    el.addEventListener('wheel', onWheel, { passive: true });
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: true });
    el.addEventListener('touchend', onTouchEnd);
    el.addEventListener('touchcancel', onTouchEnd);

    return () => {
      clearTimers();
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
      el.style.removeProperty('--close-pull');
      el.style.removeProperty('--close-spring');
      delete el.dataset.closePhase;
    };
  }, [ref]);
}
