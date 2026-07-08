// The single source of truth for row swipes. Two tables:
//   ACTION_PRESENTATION — how each triage action looks, keyed by the action so
//     a remapped action keeps its colour/icon wherever it lands.
//   ROW_SWIPE_BINDINGS — which action sits in which direction+distance slot;
//     the overridable part (a future settings screen persists a replacement
//     and passes it to the resolver).
// One resolver drives BOTH the live reveal and the commit, so the picture on
// screen and the action that fires can never disagree.

import { targetsFromSelection } from './helpers';
import type { ActionId, ReadonlyContext, ThreadRef } from './types';

export type Tone = 'safe' | 'danger' | 'info' | 'warn';
export type IconName = 'archive' | 'trash' | 'clock' | 'tag';

export interface ActionPresentation {
  tone: Tone;
  icon: IconName;
  label: string;
}

export interface SwipeBinding {
  direction: 'start' | 'end';
  armAtFraction: number;
  action: ActionId;
  /** Pre-fill an elicitable arg to skip that action's picker (e.g. { label }). */
  args?: Record<string, unknown>;
}

export interface ResolvedIntent {
  binding: SwipeBinding;
  presentation: ActionPresentation;
}

export const ACTION_PRESENTATION: Record<string, ActionPresentation> = {
  'archive-thread':   { tone: 'safe',   icon: 'archive', label: 'Archive' },
  'delete-thread':    { tone: 'danger', icon: 'trash',   label: 'Delete' },
  'snooze-thread':    { tone: 'info',   icon: 'clock',   label: 'Snooze' },
  'add-label-thread': { tone: 'warn',   icon: 'tag',     label: 'Label' },
};

// Thresholds are intentionally low so the light action arms with a short pull;
// the heavy action still needs a clearly longer, deliberate drag. Tune here.
export const ROW_SWIPE_BINDINGS: SwipeBinding[] = [
  { direction: 'end',   armAtFraction: 0.15, action: 'archive-thread' },
  { direction: 'end',   armAtFraction: 0.50, action: 'delete-thread' },
  { direction: 'start', armAtFraction: 0.15, action: 'snooze-thread' },
  { direction: 'start', armAtFraction: 0.50, action: 'add-label-thread' },
];

/** The furthest-armed binding for a direction at this pull fraction, or null. */
export function resolveSwipeIntent(
  direction: 'start' | 'end',
  fraction: number,
  bindings: SwipeBinding[] = ROW_SWIPE_BINDINGS,
): ResolvedIntent | null {
  let best: SwipeBinding | null = null;
  for (const b of bindings) {
    if (b.direction !== direction) continue;
    if (fraction < b.armAtFraction) continue;
    if (!best || b.armAtFraction > best.armAtFraction) best = b;
  }
  if (!best) return null;
  const presentation = ACTION_PRESENTATION[best.action];
  return presentation ? { binding: best, presentation } : null;
}

/** The dispatch command for a released swipe, or null if under the threshold. */
export function swipeCommandFor(
  direction: 'start' | 'end',
  fraction: number,
  rowThreadId: ThreadRef | null,
  ctx: ReadonlyContext,
  bindings: SwipeBinding[] = ROW_SWIPE_BINDINGS,
): { action: ActionId; args: Record<string, unknown> } | null {
  const intent = resolveSwipeIntent(direction, fraction, bindings);
  if (!intent) return null;
  const targets = ctx.selection.length > 0
    ? targetsFromSelection(ctx)
    : (rowThreadId ? [rowThreadId] : []);
  return {
    action: intent.binding.action,
    args: { targets, ...intent.binding.args },
  };
}
