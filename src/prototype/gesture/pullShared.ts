// Shared vocabulary for the pull-to-trigger prototypes. Both the pointer-drag
// rig and the overscroll+timer rig move through the same lifecycle, so they can
// share one backdrop visual and one set of state colours.

/**
 * Where a pull currently sits in its lifecycle:
 *   idle      — nothing happening, panel at rest
 *   pulling   — moving, but not far/hard enough to commit
 *   armed     — past the distance threshold; release/hold now would fire
 *   activated — the action fired
 *   reverting — fell back below the threshold (or was let go short) — cancelling
 */
export type PullState = 'idle' | 'pulling' | 'armed' | 'activated' | 'reverting';

export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/**
 * Rubber-band resistance for accumulated pull distance: each additional pixel of
 * input counts for less as the pull grows, so momentum can't blow through the
 * threshold. Mirrors the resistance curve used by the app's overscroll-to-close.
 */
export const resist = (pull: number, armPx: number) => Math.max(0.35, 0.85 - pull / (armPx * 3));

/** Chrome 151+ marks platform-synthesised fling events. Not in the DOM types yet. */
type MaybeMomentum = WheelEvent & { momentum?: boolean };

/**
 * Decides which wheel events begin a NEW physical gesture — the thing every
 * "scroll again to confirm" step has to know.
 *
 * The hard part is that after you lift your fingers, macOS keeps synthesising
 * wheel events for the fling. Waiting for the stream to go quiet (the old
 * approach here) means a quick second flick lands *inside* the first one's tail
 * and gets ignored — it feels like the rig is debouncing you.
 *
 * `WheelEvent.momentum` (Chrome 151+, `w3c/pointerevents`) says outright whether
 * an event was synthesised by the platform's inertia model, so a tail can be
 * recognised as a tail and the very next real event counts immediately, with no
 * dead period at all. Where it's missing (Safari, older Chrome) we fall back to
 * the idle gap; the lethargy-style "are the deltas decaying?" heuristic is the
 * other known option if that fallback ever needs to be smarter.
 */
export interface GestureSample {
  /** Platform-synthesised fling event rather than your finger. */
  momentum: boolean;
  /** Quiet time before this event. Large = you started something new. */
  gapMs: number;
  /** The previous event was a fling tail, so this is the first real input after it. */
  afterMomentum: boolean;
}

/**
 * Does this browser report `WheelEvent.momentum` at all? A static browser fact, so
 * it's worth reading directly (a rig's footer readout, say) — where it's false the
 * `afterMomentum` shortcut below can never fire, and the idle gap is the whole test.
 */
export const MOMENTUM_API = 'momentum' in WheelEvent.prototype;

export function createGestureGate(defaultIdleMs = 150) {
  let lastAt = -Infinity;
  let lastWasMomentum = false;
  const platformTellsUs = MOMENTUM_API;

  /**
   * Call EXACTLY ONCE per wheel event, including ones you ignore — it advances the
   * stream state that every later decision reads.
   */
  const observe = (event: WheelEvent): GestureSample => {
    const now = performance.now();
    const momentum = platformTellsUs && (event as MaybeMomentum).momentum === true;
    const sample: GestureSample = { momentum, gapMs: now - lastAt, afterMomentum: lastWasMomentum };
    lastAt = now;
    lastWasMomentum = momentum;
    return sample;
  };

  return {
    platformTellsUs,
    observe,
    /**
     * Did a new physical gesture begin? Your finger, after either a real pause or
     * the tail of the previous gesture.
     *
     * `idleMs` is per-decision on purpose. A *big* threshold makes a step feel
     * deliberate but also lets a continuous stream lock it out; a *small* one is
     * enough to tell "one motion" from "two motions" while staying responsive.
     * Cheap, reversible steps want a small gap; irreversible ones want a large one.
     */
    isNewGesture(event: WheelEvent, idleMs = defaultIdleMs): boolean {
      const s = observe(event);
      return !s.momentum && (s.gapMs >= idleMs || s.afterMomentum);
    },
    dispose() {
      lastAt = -Infinity;
      lastWasMomentum = false;
    },
  };
}
