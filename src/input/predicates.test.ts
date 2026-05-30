import { describe, it, expect } from 'vitest';
import { predicates, evaluateWhen } from './predicates';
import type { ReadonlyContext } from './types';

function makeCtx(over: Partial<ReadonlyContext> = {}): ReadonlyContext {
  return {
    focusedPanelIndex: 1, focusedPanelKind: 'threadlist', focusedLabel: 'INBOX',
    selection: [], mode: 'idle', signedIn: true, ...over,
  };
}

describe('predicates', () => {
  it('mode-idle is true only when mode === idle', () => {
    expect(predicates['mode-idle'](makeCtx())).toBe(true);
    expect(predicates['mode-idle'](makeCtx({ mode: 'cmd-k' }))).toBe(false);
  });

  it('selection-non-empty depends on selection length', () => {
    expect(predicates['selection-non-empty'](makeCtx())).toBe(false);
    expect(predicates['selection-non-empty'](makeCtx({ selection: ['t1'] }))).toBe(true);
  });

  it('in-thread-panel / in-threadlist-panel', () => {
    expect(predicates['in-thread-panel'](makeCtx({ focusedPanelKind: 'thread' }))).toBe(true);
    expect(predicates['in-threadlist-panel'](makeCtx())).toBe(true);
  });

  it('not-in-picker excludes both picker modes', () => {
    expect(predicates['not-in-picker'](makeCtx())).toBe(true);
    expect(predicates['not-in-picker'](makeCtx({ mode: 'picker-snooze' }))).toBe(false);
    expect(predicates['not-in-picker'](makeCtx({ mode: 'picker-label' }))).toBe(false);
  });
});

describe('evaluateWhen', () => {
  it('returns true when when is undefined', () => {
    expect(evaluateWhen(undefined, makeCtx())).toBe(true);
  });

  it('evaluates a single id', () => {
    expect(evaluateWhen('mode-idle', makeCtx())).toBe(true);
    expect(evaluateWhen('mode-cmd-k', makeCtx())).toBe(false);
  });

  it('evaluates an array as AND', () => {
    expect(evaluateWhen(['mode-idle', 'in-threadlist-panel'], makeCtx())).toBe(true);
    expect(evaluateWhen(['mode-idle', 'selection-non-empty'], makeCtx())).toBe(false);
  });

  it('returns false on unknown predicate id (safe default)', () => {
    expect(evaluateWhen('does-not-exist', makeCtx())).toBe(false);
  });
});
