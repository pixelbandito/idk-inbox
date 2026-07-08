// useRowSwipe — gesture wiring for the live, tiered row-swipe affordance.
//
// Two input models, because they differ fundamentally:
//   - Pointer (mouse / touch): drag the tile and RELEASE past a tier to commit.
//   - Trackpad wheel (Mac two-finger): a wheel stream has NO "fingers lifted"
//     event, so it can't commit on release. A horizontal scroll REVEALS and
//     snaps the tile open; the exposed action button(s) commit on click (scroll
//     far to reveal both the light and heavy actions). Tap the tile / scroll
//     back to close.
//
// Decision logic lives in the pure, tested modules (swipeGeometry, swipeIntents);
// this hook does DOM mutation, dispatch, and the small reveal state machine.
//
// On commit the tile is reset to centre (NOT slid off) and the armed colour is
// cleared, so no coloured reveal can linger behind the row; the row's file-away
// collapse is what animates it out, and only for an actual write.

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { useGesture, type ClickEvent, type PressEvent } from './useGesture';
import { logicalInlineDirection, inlineFraction } from './swipeGeometry';
import {
  resolveSwipeIntent, ACTION_PRESENTATION, ROW_SWIPE_BINDINGS,
  type IconName, type SwipeBinding,
} from './swipeIntents';
import { targetFromRow, targetsFromSelection } from './helpers';
import { resolveSurface } from '../triggers/producers/fromGesture';
import type { AbstractEvent } from '../triggers/types';
import type { ActionId, ActionResult, DispatchRequest, ReadonlyContext, ThreadRef } from './types';

export interface RowSwipeOptions {
  /** The generic tap pipeline — receives click / long-press AbstractEvents only. */
  onTrigger: (e: AbstractEvent) => void;
  dispatch:  (req: DispatchRequest) => Promise<ActionResult>;
  ctx:       ReadonlyContext;
  /** Override the swipe slots (defaults to ROW_SWIPE_BINDINGS). */
  bindings?: SwipeBinding[];
  /** Called once a swipe produces a real write (not a picker), with its action. */
  onCommit?: (action: ActionId) => void;
}

/** One clickable action in a trackpad reveal. */
export interface RevealAction {
  action: ActionId;
  args:   Record<string, unknown>;
  tone:   string;
  icon:   IconName;
  label:  string;
}

export interface RevealState {
  direction: 'start' | 'end';
  /** Light first, heavy last; all tiers the scroll reached. */
  actions: RevealAction[];
}

export interface RowSwipeApi {
  reveal: RevealState | null;
  commitReveal: (action: ActionId) => void;
  cancelReveal: () => void;
}

// Width the tile snaps open per revealed action button.
const REVEAL_PX = 72;

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

function rowTargets(el: HTMLElement, ctx: ReadonlyContext): ThreadRef[] {
  if (ctx.selection.length > 0) return targetsFromSelection(ctx);
  const t = targetFromRow(el);
  return t ? [t] : [];
}

export function useRowSwipe(
  ref: RefObject<HTMLElement | null>,
  opts: RowSwipeOptions,
): RowSwipeApi {
  const optsRef = useRef(opts);
  useLayoutEffect(() => { optsRef.current = opts; });

  const armedActionRef = useRef<ActionId | null>(null);
  const [reveal, setReveal] = useState<RevealState | null>(null);
  const revealRef = useRef<RevealState | null>(null);
  useLayoutEffect(() => { revealRef.current = reveal; });

  const paintPull = useCallback((el: HTMLElement, dx: number) => {
    el.classList.remove('email--releasing');
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

  // Reset the tile to centre, clear the armed colour, then dispatch. The row's
  // file-away collapse (onCommit) fires only for a real write, so a snooze /
  // label swipe that merely opens a picker doesn't wrongly collapse the row.
  const commitCommand = useCallback(
    (el: HTMLElement, command: { action: ActionId; args: Record<string, unknown> }) => {
      armedActionRef.current = null;
      el.style.setProperty('--row-h', `${el.offsetHeight}px`);
      el.classList.add('email--releasing');
      clearPullVisuals(el);
      const { dispatch, ctx, onCommit } = optsRef.current;
      void dispatch({ action: command.action, args: command.args, context: ctx }).then((result) => {
        if (result.ok && result.affectedTargets && result.affectedTargets.length > 0) {
          onCommit?.(command.action);
        }
      });
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

  const commitReveal = useCallback((action: ActionId) => {
    const el = ref.current;
    const r = revealRef.current;
    if (!el || !r) return;
    const picked = r.actions.find((a) => a.action === action);
    revealRef.current = null;
    setReveal(null);
    if (picked) commitCommand(el, { action: picked.action, args: picked.args });
  }, [ref, commitCommand]);

  const cancelReveal = useCallback(() => { closeReveal(ref.current); }, [ref, closeReveal]);

  const onClick = useCallback((raw: ClickEvent) => {
    if (revealRef.current) { closeReveal(ref.current); return; }
    const { surface, surfaceEl } = resolveSurface(raw.target);
    optsRef.current.onTrigger({ kind: 'gesture-click', surface, target: surfaceEl });
  }, [ref, closeReveal]);

  const onLongPress = useCallback((raw: PressEvent) => {
    const { surface, surfaceEl } = resolveSurface(raw.target);
    optsRef.current.onTrigger({ kind: 'gesture-long-press', surface, target: surfaceEl, dt: 0 });
  }, []);

  // Pointer release: drag-to-commit past a tier, else spring back.
  const releasePull = useCallback((el: HTMLElement, dx: number) => {
    armedActionRef.current = null;
    el.classList.add('email--releasing');
    const direction = logicalInlineDirection(dx, documentDirection());
    const fraction  = inlineFraction(dx, el.clientWidth);
    const intent    = resolveSwipeIntent(direction, fraction, optsRef.current.bindings);
    if (!intent) {
      clearPullVisuals(el);
      return;
    }
    const targets = rowTargets(el, optsRef.current.ctx);
    commitCommand(el, { action: intent.binding.action, args: { targets, ...intent.binding.args } });
  }, [commitCommand]);

  const onDrag = useCallback((dx: number, dy: number) => {
    const el = ref.current;
    if (!el) return;
    if (revealRef.current) closeReveal(el);
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

  // Trackpad two-finger horizontal scroll: reveal + snap open (no auto-commit).
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
      const bindings = (optsRef.current.bindings ?? ROW_SWIPE_BINDINGS)
        .filter((b) => b.direction === direction && fraction >= b.armAtFraction)
        .sort((a, b) => a.armAtFraction - b.armAtFraction);
      if (bindings.length === 0) {
        el.classList.add('email--releasing');
        clearPullVisuals(el);
        revealRef.current = null;
        setReveal(null);
        return;
      }
      const targets = rowTargets(el, optsRef.current.ctx);
      const actions: RevealAction[] = bindings.map((b) => {
        const p = ACTION_PRESENTATION[b.action];
        return { action: b.action, args: { targets, ...b.args }, tone: p.tone, icon: p.icon, label: p.label };
      });
      // Snap open wide enough for every revealed button; buttons carry the
      // colour, so clear the single-armed tone/icon.
      el.classList.add('email--releasing');
      el.style.setProperty('--drag-x', `${Math.sign(dx) * REVEAL_PX * actions.length}px`);
      el.dataset.pull = direction;
      el.dataset.revealed = 'true';
      delete el.dataset.armedTone;
      delete el.dataset.armedIcon;
      const next: RevealState = { direction, actions };
      revealRef.current = next;
      setReveal(next);
    };

    const onWheel = (e: WheelEvent) => {
      if (!session && Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      e.preventDefault();
      if (!session) { revealRef.current = null; setReveal(null); }
      session = true;
      accX += e.deltaX;
      wheelDx = -accX; // natural-scroll mapping; flip if it feels inverted
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
