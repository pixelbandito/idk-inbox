import type { Distance } from './types';

// Threshold helpers for trigger match() functions.
//
// Triggers express thresholds with both a fractional component (relative to
// the surface size) and an absolute pixel floor. The asymmetry between
// `within` and `beyond` mirrors intent: `within` is forgiving (either
// condition suffices), `beyond` is strict (both must hold).

export type Threshold = { fraction: number; minPx: number };

/** "ended close to / started near" — within the LARGER of fraction-or-px. */
export function within(d: Distance, t: Threshold): boolean {
  return d.fraction <= t.fraction || d.pixels <= t.minPx;
}

/** "went far enough" — beyond BOTH the fraction AND the px floor. */
export function beyond(d: Distance, t: Threshold): boolean {
  return d.fraction >= t.fraction && d.pixels >= t.minPx;
}
