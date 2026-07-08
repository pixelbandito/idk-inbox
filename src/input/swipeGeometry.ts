// Pure inline-axis swipe math, shared by the row-swipe hook. Directions are
// CSS-logical (start/end) so right-to-left layouts need no special-casing.

export function logicalInlineDirection(dx: number, docDir: 'ltr' | 'rtl'): 'start' | 'end' {
  const positiveIsEnd = docDir !== 'rtl';
  if (dx >= 0) return positiveIsEnd ? 'end' : 'start';
  return positiveIsEnd ? 'start' : 'end';
}

/** |dx| as a fraction of the row's inline size, clamped to [0, 1]. */
export function inlineFraction(dx: number, inlineSize: number): number {
  if (inlineSize <= 0) return 0;
  const f = Math.abs(dx) / inlineSize;
  return f > 1 ? 1 : f;
}
