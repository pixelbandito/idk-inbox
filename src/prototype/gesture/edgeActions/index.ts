import type { RefObject } from 'react';
import { useEdgeSurface } from './useEdgeSurface';
import { useScrollCommit } from './useScrollCommit';
import { useDragCommit } from './useDragCommit';
import type { EdgeActionsConfig } from './types';

export * from './types';
export { useEdgeSurface } from './useEdgeSurface';
export { useScrollCommit } from './useScrollCommit';
export { useDragCommit } from './useDragCommit';

/**
 * The house composition: geometry + both input models.
 *
 * The three pieces underneath are independent on purpose — `useEdgeSurface` knows
 * nothing about wheels or pointers, and the two behaviour hooks share no state
 * beyond the `Surface` handle — so either can be lifted out on its own. In
 * idk-inbox they always go together: scroll is the fast path to the obvious action,
 * drag is how you pick among several, and a surface offering one without the other
 * would teach a different gesture per context.
 */
export function useEdgeActions(
  scrollerRef: RefObject<HTMLElement | null>,
  startPadRef: RefObject<HTMLElement | null>,
  endPadRef: RefObject<HTMLElement | null>,
  config: EdgeActionsConfig & { scroll?: boolean; drag?: boolean },
) {
  const core = useEdgeSurface(scrollerRef, startPadRef, endPadRef, config);
  useScrollCommit(core.surface, config.scroll ?? true);
  const { swallowClick } = useDragCommit(core.surface, config.drag ?? true);
  return { ...core, swallowClick };
}
