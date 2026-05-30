import type { PredicateId, ReadonlyContext } from './types';

export const predicates: Record<PredicateId, (ctx: ReadonlyContext) => boolean> = {
  'mode-idle':            (c) => c.mode === 'idle',
  'mode-cmd-k':           (c) => c.mode === 'cmd-k',
  'mode-picker-snooze':   (c) => c.mode === 'picker-snooze',
  'mode-picker-label':    (c) => c.mode === 'picker-label',
  'mode-selecting':       (c) => c.mode === 'selecting',
  'not-in-picker':        (c) => c.mode !== 'picker-snooze' && c.mode !== 'picker-label',
  'selection-non-empty':  (c) => c.selection.length > 0,
  'in-thread-panel':      (c) => c.focusedPanelKind === 'thread',
  'in-threadlist-panel':  (c) => c.focusedPanelKind === 'threadlist',
  'signed-in':            (c) => c.signedIn,
};

export function evaluateWhen(
  when: PredicateId | PredicateId[] | undefined,
  ctx: ReadonlyContext,
): boolean {
  if (when === undefined) return true;
  const ids = Array.isArray(when) ? when : [when];
  for (const id of ids) {
    const pred = predicates[id];
    if (!pred) return false;   // safe default for unknown ids
    if (!pred(ctx)) return false;
  }
  return true;
}
