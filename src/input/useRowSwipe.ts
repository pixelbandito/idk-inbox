// useRowSwipe — gesture wiring for the live, tiered row-swipe affordance.
//
// Decision logic lives in the pure, tested modules (swipeGeometry,
// swipeIntents); this hook only does DOM mutation + dispatch:
//   - clicks / long-presses forward to `onTrigger` (the generic trigger
//     pipeline), built exactly like producers/fromGesture does
//   - onDrag paints --drag-x / data-pull / data-armed-tone imperatively so
//     the tile follows the finger without re-rendering React every frame
//   - onSwipe (release) resolves the armed command and dispatches it, or
//     springs the tile back when nothing armed. Row swipes deliberately do
//     NOT flow through onTrigger/actionMap.

import { useCallback, useLayoutEffect, useRef, type RefObject } from 'react';
import {
  useGesture,
  type ClickEvent,
  type PressEvent,
  type SwipeEvent,
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

  const onDrag = useCallback((dx: number, dy: number) => {
    const el = ref.current;
    if (!el) return;
    el.classList.remove('email--releasing'); // a new pull kills any spring-back transition
    if (Math.abs(dx) < Math.abs(dy)) {
      clearPullVisuals(el);
      armedActionRef.current = null;
      return;
    }
    const direction = logicalInlineDirection(dx, documentDirection());
    const fraction  = inlineFraction(dx, el.clientWidth);
    const intent    = resolveSwipeIntent(direction, fraction, optsRef.current.bindings);

    el.style.setProperty('--drag-x', `${dx}px`);
    el.dataset.pull = direction;
    if (intent) el.dataset.armedTone = intent.presentation.tone;
    else        delete el.dataset.armedTone;

    const armed = intent?.binding.action ?? null;
    if (armed !== armedActionRef.current) {
      armedActionRef.current = armed;
      navigator.vibrate?.(8);
    }
  }, [ref]);

  const onSwipe = useCallback((raw: SwipeEvent) => {
    const el = ref.current;
    if (!el) return;
    armedActionRef.current = null;
    el.classList.add('email--releasing');

    const horizontal = Math.abs(raw.dx) >= Math.abs(raw.dy);
    const { ctx, dispatch, bindings } = optsRef.current;
    const command = horizontal
      ? swipeCommandFor(
          logicalInlineDirection(raw.dx, documentDirection()),
          inlineFraction(raw.dx, el.clientWidth),
          targetFromRow(el),
          ctx,
          bindings,
        )
      : null;

    if (!command) {
      clearPullVisuals(el);
      return;
    }
    // Slide the tile off in the pull direction; the write's refresh removes the row.
    el.style.setProperty('--drag-x', `${Math.sign(raw.dx) * el.clientWidth}px`);
    void dispatch({ action: command.action, args: command.args, context: ctx });
  }, [ref]);

  useGesture('row', ref, { onClick, onLongPress, onDrag, onSwipe });
}
