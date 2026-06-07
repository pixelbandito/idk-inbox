// fromOverscroll — translates the legacy useOverscroll firing into the
// trigger system's AbstractEvent shape.
//
// useOverscroll is binary: it fires exactly once per gesture, after the
// accumulated past-edge scroll crosses an opts.minPx threshold. It does not
// expose the exact accumulated pixel count to its consumer. We treat the
// firing as a "the user pulled past the threshold" signal and synthesise a
// Distance whose pixels = the configured threshold and whose fraction =
// pixels / surfaceElement.clientHeight (the scroll container's visible
// height, per the design doc's surface-relative normalisation rule).
//
// Today the only overscroll trigger is overscrollBlockEnd (close-panel on
// pull-down at the bottom of a thread). The producer's edge argument is
// hard-coded to 'bottom' for now to match useOverscroll's API; mapping
// bottom → CSS-logical 'block-end' is correct under both LTR and RTL.

import { useCallback, type RefObject } from 'react';
import { useOverscroll } from '../../input/useOverscroll';
import type { AbstractEvent, Distance, Surface } from '../types';

const VALID_SURFACES: ReadonlySet<string> = new Set<Surface>([
  'row', 'panel-header', 'panel-body', 'document', 'overlay',
]);

/** Threshold past which useOverscroll fires (pixels of overscroll). */
const OVERSCROLL_PX = 80;

function resolveSurface(el: Element | null): { surface: Surface; surfaceEl: Element } {
  if (el) {
    const found = el.closest('[data-surface]') as HTMLElement | null;
    if (found) {
      const raw = found.dataset.surface;
      if (raw && VALID_SURFACES.has(raw)) {
        return { surface: raw as Surface, surfaceEl: found };
      }
    }
  }
  return { surface: 'document', surfaceEl: document.documentElement };
}

function clampFraction(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function distanceFor(pixels: number, surfaceSize: number): Distance {
  const safeSize = surfaceSize > 0 ? surfaceSize : 1;
  return { pixels, fraction: clampFraction(pixels / safeSize) };
}

/**
 * Mount an overscroll producer on `ref`. Emits a single
 * `gesture-overscroll` AbstractEvent with edge='block-end' each time
 * the underlying useOverscroll fires.
 */
export function useOverscrollProducer(
  ref:     RefObject<HTMLElement | null>,
  onEvent: (e: AbstractEvent) => void,
): void {
  const onFire = useCallback(() => {
    const el = ref.current;
    const { surface, surfaceEl } = resolveSurface(el);
    // Use the scroll container's visible height (clientHeight) for the
    // fraction denominator, per the design doc's normalisation rule.
    const surfaceSize = surfaceEl instanceof HTMLElement
      ? surfaceEl.clientHeight
      : 0;
    onEvent({
      kind:     'gesture-overscroll',
      surface,
      edge:     'block-end',
      distance: distanceFor(OVERSCROLL_PX, surfaceSize),
    });
  }, [ref, onEvent]);

  useOverscroll(ref, { edge: 'bottom', minPx: OVERSCROLL_PX, onFire });
}
