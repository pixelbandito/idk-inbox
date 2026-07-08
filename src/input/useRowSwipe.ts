// useRowSwipe — gesture wiring for the live, tiered row-swipe affordance.
//
// Decision logic lives in the pure, tested modules (swipeGeometry,
// swipeIntents); this hook only does DOM mutation + dispatch:
//   - clicks / long-presses forward to `onTrigger` (the generic trigger
//     pipeline), built exactly like producers/fromGesture does
//   - onDrag paints --drag-x / data-pull / data-armed-tone / data-armed-icon
//     imperatively so the tile follows the finger without re-rendering React
//     every frame (CSS picks the matching reveal icon off data-armed-icon)
//   - onDragEnd (release of ANY real drag, even the ambiguous 20-60px zone)
//     resolves the armed command and dispatches it, or springs the tile back
//     when nothing armed. Row swipes deliberately do NOT flow through
//     onTrigger/actionMap.
//   - a non-passive wheel listener maps Mac-trackpad two-finger horizontal
//     scroll onto the same paint/release pair, so trackpads get the same
//     physical drag feel as pointers.

import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import {
  useGesture,
  type ClickEvent,
  type PressEvent,
} from './useGesture';
import { logicalInlineDirection, inlineFraction } from './swipeGeometry';
import { resolveSwipeIntent, swipeCommandFor, type SwipeBinding } from './swipeIntents';
import { targetFromRow } from './helpers';
import { resolveSurface } from '../triggers/producers/fromGesture';
import type { AbstractEvent } from '../triggers/types';
import type { ActionId, ActionResult, DispatchRequest, ReadonlyContext } from './types';

export interface RowSwipeOptions {
  /** The generic tap pipeline — receives click / long-press AbstractEvents only. */
  onTrigger: (e: AbstractEvent) => void;
  dispatch:  (req: DispatchRequest) => Promise<ActionResult>;
  ctx:       ReadonlyContext;
  /** Override the swipe slots (defaults to ROW_SWIPE_BINDINGS). */
  bindings?: SwipeBinding[];
}

function documentDirection(): 'ltr' | 'rtl' {
  return getComputedStyle(document.documentElement).direction === 'rtl' ? 'rtl' : 'ltr';
}

function clearPullVisuals(el: HTMLElement): void {
  el.style.setProperty('--drag-x', '0px');
  delete el.dataset.pull;
  delete el.dataset.armedTone;
  delete el.dataset.armedIcon;
}

export function useRowSwipe(
  ref: RefObject<HTMLElement | null>,
  opts: RowSwipeOptions,
): void {
  const optsRef = useRef(opts);
  useLayoutEffect(() => {
    optsRef.current = opts;
  });

  // The action armed on the previous drag frame; a change buzzes the haptics.
  const armedActionRef = useRef<ActionId | null>(null);

  const onClick = useCallback((raw: ClickEvent) => {
    const { surface, surfaceEl } = resolveSurface(raw.target);
    optsRef.current.onTrigger({ kind: 'gesture-click', surface, target: surfaceEl });
  }, []);

  const onLongPress = useCallback((raw: PressEvent) => {
    const { surface, surfaceEl } = resolveSurface(raw.target);
    // useGesture doesn't expose dt on long-press (see fromGesture); report 0.
    optsRef.current.onTrigger({ kind: 'gesture-long-press', surface, target: surfaceEl, dt: 0 });
  }, []);

  // Paint one frame of a live pull: tile offset, pull direction, and the
  // armed tone/icon (with a haptic buzz when the armed action changes).
  // Shared by the pointer and wheel paths.
  const paintPull = useCallback((el: HTMLElement, dx: number) => {
    el.classList.remove('email--releasing'); // a new pull kills any spring-back transition
    const direction = logicalInlineDirection(dx, documentDirection());
    const fraction  = inlineFraction(dx, el.clientWidth);
    const intent    = resolveSwipeIntent(direction, fraction, optsRef.current.bindings);

    el.style.setProperty('--drag-x', `${dx}px`);
    el.dataset.pull = direction;
    if (intent) {
      el.dataset.armedTone = intent.presentation.tone;
      el.dataset.armedIcon = intent.presentation.icon;
    } else {
      delete el.dataset.armedTone;
      delete el.dataset.armedIcon;
    }

    const armed = intent?.binding.action ?? null;
    if (armed !== armedActionRef.current) {
      armedActionRef.current = armed;
      navigator.vibrate?.(8);
    }
  }, []);

  // Settle a released pull: dispatch the armed command (sliding the tile off)
  // or spring back when nothing armed. Shared by the pointer and wheel paths.
  const releasePull = useCallback((el: HTMLElement, dx: number) => {
    armedActionRef.current = null;
    el.classList.add('email--releasing');

    const { ctx, dispatch, bindings } = optsRef.current;
    const command = swipeCommandFor(
      logicalInlineDirection(dx, documentDirection()),
      inlineFraction(dx, el.clientWidth),
      targetFromRow(el),
      ctx,
      bindings,
    );

    if (!command) {
      clearPullVisuals(el);
      return;
    }
    // Slide the tile off in the pull direction; the write's refresh removes the row.
    el.style.setProperty('--drag-x', `${Math.sign(dx) * el.clientWidth}px`);
    void dispatch({ action: command.action, args: command.args, context: ctx });
  }, []);

  const onDrag = useCallback((dx: number, dy: number) => {
    const el = ref.current;
    if (!el) return;
    if (Math.abs(dx) < Math.abs(dy)) {
      el.classList.remove('email--releasing');
      clearPullVisuals(el);
      armedActionRef.current = null;
      return;
    }
    paintPull(el, dx);
  }, [ref, paintPull]);

  // Fires on release of ANY real drag — including the 20-60px ambiguous zone
  // where useGesture reports neither click nor swipe — so the tile always
  // settles instead of sticking mid-pull.
  const onDragEnd = useCallback((dx: number, dy: number) => {
    const el = ref.current;
    if (!el) return;
    if (Math.abs(dx) >= Math.abs(dy)) {
      releasePull(el, dx);
    } else {
      clearPullVisuals(el); // vertical drag — never a swipe
    }
  }, [ref, releasePull]);

  useGesture('row', ref, { onClick, onLongPress, onDrag, onDragEnd });

  // Trackpad two-finger horizontal scroll drives the same pull. Wheel streams
  // have no "release" event, so a short debounce after the last event stands
  // in for lifting the fingers.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let accX = 0;          // accumulated wheel deltaX for this session
    let wheelDx = 0;       // current tile offset derived from accX
    let session = false;   // true while a horizontal wheel stream is live
    let timer: ReturnType<typeof setTimeout> | null = null;

    const onWheel = (e: WheelEvent) => {
      // Outside a session, vertical-dominant wheel is list scrolling — let it
      // through untouched. Once a horizontal session starts, keep every event
      // so a wobbly diagonal stream doesn't tear the pull apart.
      if (!session && Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      // Stop the panels container from scroll-snapping / history back-nav.
      e.preventDefault();
      session = true;
      accX += e.deltaX;
      // Natural-scroll mapping: a rightward two-finger swipe reports negative
      // deltaX, so negate to pull the tile rightward with the fingers. Flip
      // the sign here if it ever feels inverted.
      wheelDx = -accX;
      paintPull(el, wheelDx);

      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        session = false;
        releasePull(el, wheelDx);
        accX = 0;
      }, 120);
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      if (timer !== null) clearTimeout(timer);
      el.removeEventListener('wheel', onWheel);
    };
  }, [ref, paintPull, releasePull]);
}
