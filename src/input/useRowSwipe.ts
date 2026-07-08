// useRowSwipe — gesture wiring for the live, tiered row-swipe affordance.
//
// Two input models, because they differ fundamentally:
//   - Pointer (mouse / touch): drag the tile and RELEASE past a tier to commit.
//     A release has a clear end, so this is fluid drag-to-commit.
//   - Trackpad wheel (Mac two-finger): a wheel stream has NO "fingers lifted"
//     event, so we can't commit on release. Instead a horizontal scroll REVEALS
//     and snaps the tile open, and the user clicks the revealed action to fire
//     it (or taps the tile / scrolls back to close).
//
// Decision logic lives in the pure, tested modules (swipeGeometry, swipeIntents);
// this hook does DOM mutation, dispatch, and the small reveal state machine.

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { useGesture, type ClickEvent, type PressEvent } from './useGesture';
import { logicalInlineDirection, inlineFraction } from './swipeGeometry';
import {
  resolveSwipeIntent, swipeCommandFor, type IconName, type SwipeBinding,
} from './swipeIntents';
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
  /** Called when a swipe commits, so the row can play its file-away animation. */
  onCommit?: () => void;
}

/** A trackpad-revealed, click-to-commit action snapped open on a row. */
export interface RevealState {
  direction: 'start' | 'end';
  awaySign:  number;   // sign to slide the tile fully off on commit
  tone:      string;
  icon:      IconName;
  label:     string;
  action:    ActionId;
  args:      Record<string, unknown>;
}

export interface RowSwipeApi {
  /** Non-null when a trackpad scroll has snapped an action open on this row. */
  reveal: RevealState | null;
  commitReveal: () => void;
  cancelReveal: () => void;
}

// How far the tile snaps open on a trackpad reveal — enough to show a tappable
// action area.
const REVEAL_PX = 80;

function documentDirection(): 'ltr' | 'rtl' {
  return getComputedStyle(document.documentElement).direction === 'rtl' ? 'rtl' : 'ltr';
}

function clearPullVisuals(el: HTMLElement): void {
  el.style.setProperty('--drag-x', '0px');
  delete el.dataset.pull;
  delete el.dataset.armedTone;
  delete el.dataset.armedIcon;
  delete el.dataset.revealed;
}

export function useRowSwipe(
  ref: RefObject<HTMLElement | null>,
  opts: RowSwipeOptions,
): RowSwipeApi {
  const optsRef = useRef(opts);
  useLayoutEffect(() => { optsRef.current = opts; });

  // The action armed on the previous drag frame; a change buzzes the haptics.
  const armedActionRef = useRef<ActionId | null>(null);

  const [reveal, setReveal] = useState<RevealState | null>(null);
  const revealRef = useRef<RevealState | null>(null);
  useLayoutEffect(() => { revealRef.current = reveal; });

  // Paint one frame of a live pull: tile offset, pull direction, armed tone/icon
  // (with a haptic buzz when the armed action changes). Pointer + wheel share it.
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

  // Slide the tile fully off and dispatch. Shared by pointer release and the
  // trackpad reveal's click. onCommit lets the row play its file-away collapse.
  const commitCommand = useCallback(
    (el: HTMLElement, command: { action: ActionId; args: Record<string, unknown> }, awaySign: number) => {
      armedActionRef.current = null;
      el.style.setProperty('--row-h', `${el.offsetHeight}px`);
      el.classList.add('email--releasing');
      el.style.setProperty('--drag-x', `${awaySign * el.clientWidth}px`);
      delete el.dataset.revealed;
      const { dispatch, ctx, onCommit } = optsRef.current;
      onCommit?.();
      void dispatch({ action: command.action, args: command.args, context: ctx });
    },
    [],
  );

  const closeReveal = useCallback((el: HTMLElement | null) => {
    revealRef.current = null;
    setReveal(null);
    if (el) {
      el.classList.add('email--releasing');
      clearPullVisuals(el);
    }
  }, []);

  const commitReveal = useCallback(() => {
    const el = ref.current;
    const r = revealRef.current;
    if (!el || !r) return;
    revealRef.current = null;
    setReveal(null);
    commitCommand(el, { action: r.action, args: r.args }, r.awaySign);
  }, [ref, commitCommand]);

  const cancelReveal = useCallback(() => { closeReveal(ref.current); }, [ref, closeReveal]);

  const onClick = useCallback((raw: ClickEvent) => {
    // A tap on a snapped-open row just closes it (the action lives on its own
    // button, which bypasses the gesture as an interactive element).
    if (revealRef.current) { closeReveal(ref.current); return; }
    const { surface, surfaceEl } = resolveSurface(raw.target);
    optsRef.current.onTrigger({ kind: 'gesture-click', surface, target: surfaceEl });
  }, [ref, closeReveal]);

  const onLongPress = useCallback((raw: PressEvent) => {
    const { surface, surfaceEl } = resolveSurface(raw.target);
    // useGesture doesn't expose dt on long-press (see fromGesture); report 0.
    optsRef.current.onTrigger({ kind: 'gesture-long-press', surface, target: surfaceEl, dt: 0 });
  }, []);

  // Pointer release: drag-to-commit past a tier, else spring back.
  const releasePull = useCallback((el: HTMLElement, dx: number) => {
    armedActionRef.current = null;
    el.classList.add('email--releasing');
    const direction = logicalInlineDirection(dx, documentDirection());
    const fraction  = inlineFraction(dx, el.clientWidth);
    const command = swipeCommandFor(direction, fraction, targetFromRow(el), optsRef.current.ctx, optsRef.current.bindings);
    if (!command) {
      clearPullVisuals(el);
      return;
    }
    commitCommand(el, command, Math.sign(dx));
  }, [commitCommand]);

  const onDrag = useCallback((dx: number, dy: number) => {
    const el = ref.current;
    if (!el) return;
    if (revealRef.current) closeReveal(el); // a fresh drag dismisses an open reveal
    if (Math.abs(dx) < Math.abs(dy)) {
      el.classList.remove('email--releasing');
      clearPullVisuals(el);
      armedActionRef.current = null;
      return;
    }
    paintPull(el, dx);
  }, [ref, paintPull, closeReveal]);

  const onDragEnd = useCallback((dx: number, dy: number) => {
    const el = ref.current;
    if (!el) return;
    if (Math.abs(dx) >= Math.abs(dy)) releasePull(el, dx);
    else clearPullVisuals(el);
  }, [ref, releasePull]);

  useGesture('row', ref, { onClick, onLongPress, onDrag, onDragEnd });

  // Trackpad two-finger horizontal scroll: reveal + snap open (no auto-commit,
  // since a wheel has no finger-lift). A short debounce stands in for the scroll
  // settling; on settle the tile snaps to a fixed open width if a tier armed.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let accX = 0;
    let wheelDx = 0;
    let session = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const settle = (dx: number) => {
      const direction = logicalInlineDirection(dx, documentDirection());
      const fraction  = inlineFraction(dx, el.clientWidth);
      const intent    = resolveSwipeIntent(direction, fraction, optsRef.current.bindings);
      if (!intent) {
        el.classList.add('email--releasing');
        clearPullVisuals(el);
        revealRef.current = null;
        setReveal(null);
        return;
      }
      const command = swipeCommandFor(direction, fraction, targetFromRow(el), optsRef.current.ctx, optsRef.current.bindings);
      if (!command) return;
      // Snap the tile to a fixed reveal width and lock the armed action; the
      // exposed strip becomes a clickable action button (rendered by the row).
      el.classList.add('email--releasing');
      el.style.setProperty('--drag-x', `${Math.sign(dx) * REVEAL_PX}px`);
      el.dataset.pull = direction;
      el.dataset.armedTone = intent.presentation.tone;
      el.dataset.armedIcon = intent.presentation.icon;
      el.dataset.revealed = 'true';
      const next: RevealState = {
        direction,
        awaySign: Math.sign(dx),
        tone: intent.presentation.tone,
        icon: intent.presentation.icon,
        label: intent.presentation.label,
        action: command.action,
        args: command.args,
      };
      revealRef.current = next;
      setReveal(next);
    };

    const onWheel = (e: WheelEvent) => {
      // Outside a session, vertical-dominant wheel is list scrolling — let it
      // through untouched. Once horizontal, keep every event so a wobbly stream
      // doesn't tear the pull apart.
      if (!session && Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      e.preventDefault(); // stop the panels pager scroll / history back-nav
      if (!session) { revealRef.current = null; setReveal(null); }
      session = true;
      accX += e.deltaX;
      // Natural-scroll mapping: a rightward two-finger swipe reports negative
      // deltaX, so negate to pull the tile rightward. Flip if it feels inverted.
      wheelDx = -accX;
      paintPull(el, wheelDx);

      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        session = false;
        settle(wheelDx);
        accX = 0;
      }, 120);
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      if (timer !== null) clearTimeout(timer);
      el.removeEventListener('wheel', onWheel);
    };
  }, [ref, paintPull]);

  return { reveal, commitReveal, cancelReveal };
}
