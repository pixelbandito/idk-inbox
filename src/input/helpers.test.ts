import { describe, it, expect } from 'vitest';
import {
  targetFromRow, targetsFromSelection, targetFromFocusedRow, targetFromOpenThread,
} from './helpers';
import type { ReadonlyContext } from './types';

function makeCtx(over: Partial<ReadonlyContext> = {}): ReadonlyContext {
  return {
    focusedPanelIndex: 1,
    focusedPanelKind: 'threadlist',
    focusedThreadId: undefined,
    focusedLabel: 'INBOX',
    selection: [],
    mode: 'idle',
    signedIn: true,
    ...over,
  };
}

describe('targetFromRow', () => {
  it('reads data-thread-id off the closest ancestor element', () => {
    const li = document.createElement('li');
    li.setAttribute('data-thread-id', 'tA');
    const span = document.createElement('span');
    li.appendChild(span);
    expect(targetFromRow(span)).toBe('tA');
  });

  it('returns null when no ancestor carries data-thread-id', () => {
    const div = document.createElement('div');
    expect(targetFromRow(div)).toBeNull();
  });
});

describe('targetsFromSelection', () => {
  it('returns a copy of context.selection', () => {
    const ctx = makeCtx({ selection: ['t1', 't2'] });
    expect(targetsFromSelection(ctx)).toEqual(['t1', 't2']);
  });
});

describe('targetFromFocusedRow', () => {
  it('returns the focused thread id when in a thread panel', () => {
    const ctx = makeCtx({ focusedPanelKind: 'thread', focusedThreadId: 'tA' });
    expect(targetFromFocusedRow(ctx)).toBe('tA');
  });

  it('returns null when not focused on a thread panel', () => {
    expect(targetFromFocusedRow(makeCtx())).toBeNull();
  });
});

describe('targetFromOpenThread', () => {
  it('returns the focused thread id (alias of targetFromFocusedRow for the open-thread context)', () => {
    const ctx = makeCtx({ focusedPanelKind: 'thread', focusedThreadId: 'tA' });
    expect(targetFromOpenThread(ctx)).toBe('tA');
  });
});
