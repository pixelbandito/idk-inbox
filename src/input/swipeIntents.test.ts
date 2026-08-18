import { describe, it, expect } from 'vitest';
import {
  resolveSwipeIntent, swipeCommandFor, ACTION_PRESENTATION,
} from './swipeIntents';
import type { ReadonlyContext } from './types';

const ctx = (selection: string[] = []): ReadonlyContext => ({
  focusedPanelIndex: 1, focusedPanelKind: 'threadlist', focusedLabel: 'INBOX',
  selection, mode: 'idle', signedIn: true,
});

describe('resolveSwipeIntent', () => {
  it('returns null under the first threshold', () => {
    expect(resolveSwipeIntent('end', 0.1)).toBeNull();
    expect(resolveSwipeIntent('start', 0.1)).toBeNull();
  });
  it('arms tier 1 between the thresholds', () => {
    expect(resolveSwipeIntent('end', 0.3)?.binding.action).toBe('archive-thread');
    expect(resolveSwipeIntent('start', 0.3)?.binding.action).toBe('snooze-thread');
  });
  it('arms tier 2 past the far threshold', () => {
    expect(resolveSwipeIntent('end', 0.8)?.binding.action).toBe('delete-thread');
    expect(resolveSwipeIntent('start', 0.9)?.binding.action).toBe('add-label-thread');
  });
  it('carries the presentation keyed by action', () => {
    expect(resolveSwipeIntent('end', 0.8)?.presentation).toEqual(
      ACTION_PRESENTATION['delete-thread'],
    );
  });
});

describe('swipeCommandFor', () => {
  it('is null under the first threshold', () => {
    expect(swipeCommandFor('end', 0.1, 't1', ctx())).toBeNull();
  });
  it('targets the swiped row when nothing is selected', () => {
    expect(swipeCommandFor('end', 0.3, 't1', ctx())).toEqual({
      action: 'archive-thread', args: { targets: ['t1'] },
    });
  });
  it('prefers the selection when non-empty', () => {
    expect(swipeCommandFor('end', 0.8, 't1', ctx(['a', 'b']))).toEqual({
      action: 'delete-thread', args: { targets: ['a', 'b'] },
    });
  });
  it('merges a binding args preset (fixed-label slot skips the picker)', () => {
    const bindings = [{ direction: 'start' as const, armAtFraction: 0.25,
      action: 'add-label-thread', args: { label: 'idk-inbox/Receipts' } }];
    expect(swipeCommandFor('start', 0.3, 't1', ctx(), bindings)).toEqual({
      action: 'add-label-thread', args: { targets: ['t1'], label: 'idk-inbox/Receipts' },
    });
  });
});
