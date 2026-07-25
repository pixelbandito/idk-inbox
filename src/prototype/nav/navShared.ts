import { useEffect, type RefObject } from 'react';

// Shared contract for every panel-nav variant so they're directly comparable:
// the same 8 panels, the same varied widths (which surface the same edge cases
// — a too-narrow panel that can't centre, a too-wide one), the same hues.

export const PANEL_COUNT = 8;

// Varied starting widths so edge cases surface immediately — panel 4 is narrow
// (can it be centred?), panel 6 is wide.
export const INITIAL_WIDTHS = [300, 120, 440, 90, 260, 520, 150, 340];

/** Even hue spread around the wheel, so each panel reads as a distinct colour. */
export const hue = (index: number) => (index * 360) / PANEL_COUNT;

/**
 * Seed each panel's varied width imperatively on mount. Done via the DOM (not a
 * React `style` prop) so a later re-render — e.g. the active panel changing —
 * doesn't reset a width the user dragged with the native resize handle.
 */
export function useSeededWidths(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    Array.from(el.children).forEach((child, i) => {
      if (child instanceof HTMLElement && INITIAL_WIDTHS[i]) {
        child.style.width = `${INITIAL_WIDTHS[i]}px`;
      }
    });
  }, [ref]);
}

/**
 * Make the first and last panels selectable in variants that pick the active
 * panel by centre-of-view. Those panels can never reach the centre (there's no
 * content to scroll past them), so a pure centre test leaves them permanently
 * unselectable; when the scroller is pinned at either extreme, claim the edge
 * panel instead. (The home-rolled variant avoids this with its cursor buffer.)
 */
export function useEdgeSelection(ref: RefObject<HTMLElement | null>, setActive: (index: number) => void) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => {
      if (el.scrollLeft <= 1) setActive(0);
      else if (el.scrollLeft + el.clientWidth >= el.scrollWidth - 1) setActive(PANEL_COUNT - 1);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [ref, setActive]);
}
