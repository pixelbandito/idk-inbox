import type { ReadonlyContext, ThreadRef } from './types';

/** Walks from the event target up the DOM looking for a `data-thread-id`. */
export function targetFromRow(el: Element | null): ThreadRef | null {
  let cur: Element | null = el;
  while (cur) {
    const v = cur.getAttribute?.('data-thread-id');
    if (v) return v;
    cur = cur.parentElement;
  }
  return null;
}

export function targetsFromSelection(ctx: ReadonlyContext): ThreadRef[] {
  return [...ctx.selection];
}

export function targetFromFocusedRow(ctx: ReadonlyContext): ThreadRef | null {
  if (ctx.focusedPanelKind !== 'thread') return null;
  return ctx.focusedThreadId ?? null;
}

export function targetFromOpenThread(ctx: ReadonlyContext): ThreadRef | null {
  return targetFromFocusedRow(ctx);
}
