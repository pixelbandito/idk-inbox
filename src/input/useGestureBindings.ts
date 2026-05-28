import { type RefObject } from 'react';
import { useGesture, type SwipeEvent, type PressEvent, type ClickEvent } from './useGesture';
import { DEFAULT_BINDINGS } from './defaultBindings';
import { fireBinding } from './fireBinding';
import { useDispatchContext, useDispatcher } from '../state/useDispatch';
import type { Scope, Binding } from './types';

function bindingsFor(scope: Scope, modality: 'touch' | 'mouse'): Binding[] {
  return DEFAULT_BINDINGS.filter((b) => b.scope === scope && b.modality === modality);
}

function pickSwipeStageAction(binding: Binding, swipe: SwipeEvent): string {
  if (binding.trigger.kind !== 'swipe') return binding.action;
  const absDx = Math.abs(swipe.dx);
  const absDy = Math.abs(swipe.dy);
  const absMag = swipe.direction === 'left' || swipe.direction === 'right' ? absDx : absDy;
  // Pick the highest stage whose minPx is crossed.
  const stages = binding.trigger.stages ?? [];
  let chosen = binding.action;
  for (const s of stages) {
    if (absMag >= s.minPx) chosen = s.action;
  }
  return chosen;
}

export function useGestureBindings(scope: Scope, ref: RefObject<HTMLElement | null>): void {
  const ctx = useDispatchContext();
  const dispatch = useDispatcher();

  const touchBindings = bindingsFor(scope, 'touch');

  // Helper to find the longest-press binding's ms threshold for this scope.
  const longPress = touchBindings.find((b) => b.trigger.kind === 'long-press');
  const longPressMs = longPress && longPress.trigger.kind === 'long-press' ? longPress.trigger.ms : undefined;

  useGesture(scope, ref, {
    longPressMs,
    onClick: (e: ClickEvent) => {
      const b = touchBindings.find((x) => x.trigger.kind === 'click');
      if (b) void fireBinding(b, { target: e.target }, ctx, dispatch);
    },
    onLongPress: (e: PressEvent) => {
      const b = touchBindings.find((x) => x.trigger.kind === 'long-press');
      if (b) void fireBinding(b, { target: e.target }, ctx, dispatch);
    },
    onSwipe: (e: SwipeEvent) => {
      const b = touchBindings.find((x) =>
        x.trigger.kind === 'swipe' && x.trigger.direction === e.direction &&
        Math.abs(e.direction === 'left' || e.direction === 'right' ? e.dx : e.dy) >= x.trigger.minPx,
      );
      // TEMP DIAGNOSTIC
      console.info('[bind:swipe]', {
        direction: e.direction, dx: e.dx, dy: e.dy,
        scopeBindings: touchBindings.filter((x) => x.trigger.kind === 'swipe').length,
        matched: b ? { action: b.action, defaultMinPx: b.trigger.kind === 'swipe' ? b.trigger.minPx : null } : null,
        ctxMode: ctx.mode,
        ctxSelectionLen: ctx.selection.length,
      });
      if (!b) return;
      const action = pickSwipeStageAction(b, e);
      // Override the binding's action with the stage-picked one:
      const stageBinding: Binding = { ...b, action };
      void fireBinding(stageBinding, { target: e.target }, ctx, dispatch);
    },
  });
}
