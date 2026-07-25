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
