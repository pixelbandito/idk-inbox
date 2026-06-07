import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  archiveThreadAction,
  deleteThreadAction,
  snoozeThreadAction,
  openPanelAction,
  closePanelAction,
  navPanelNextAction,
  enterSelectionAction,
  undoAction,
  threadModel,
} from '../actions/types';
import type { Action, ActionName, ModelName } from '../actions/types';
import type { ReadonlyContext } from '../input/types';
import type { AbstractEvent } from './types';
import { argsFor } from './argsFor';

// ----- Fixtures -----

const baseCtx = (partial: Partial<ReadonlyContext> = {}): ReadonlyContext => ({
  focusedPanelIndex: 0,
  focusedPanelKind: 'threadlist',
  selection: [],
  mode: 'idle',
  signedIn: true,
  ...partial,
});

const action = (name: ActionName, modelName?: ModelName): Action =>
  modelName ? { name, modelName } : { name };

const clickEv = (target: Element | null): AbstractEvent =>
  ({ kind: 'gesture-click', surface: 'row', target });

const swipeEv = (target: Element | null): AbstractEvent => ({
  kind: 'gesture-swipe',
  surface: 'row',
  target,
  axis: 'inline',
  towards: 'end',
  distance:          { fraction: 0.5, pixels: 200 },
  startEdgeDistance: { fraction: 0.5, pixels: 200 },
  endEdgeDistance:   { fraction: 0.5, pixels: 200 },
  dt: 200,
});

const keyEv = (combo: string): AbstractEvent =>
  ({ kind: 'keypress', surface: 'document', combo });

// ----- DOM helpers -----

let host: HTMLElement;

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
});

afterEach(() => {
  document.body.removeChild(host);
});

function rowWithThreadId(id: string): HTMLElement {
  const li = document.createElement('li');
  li.setAttribute('data-thread-id', id);
  const span = document.createElement('span');
  li.appendChild(span);
  host.appendChild(li);
  return span; // the deepest target so argsFor must walk up
}

// ----- Tests -----

describe('argsFor — thread-targeted actions', () => {
  it('uses ctx.selection when non-empty', () => {
    const args = argsFor(
      action(archiveThreadAction, threadModel),
      swipeEv(rowWithThreadId('t-1')),
      baseCtx({ selection: ['a', 'b', 'c'] }),
    );
    expect(args).toEqual({ targets: ['a', 'b', 'c'] });
  });

  it('falls back to data-thread-id walked up from event.target', () => {
    const args = argsFor(
      action(deleteThreadAction, threadModel),
      swipeEv(rowWithThreadId('t-7')),
      baseCtx(),
    );
    expect(args).toEqual({ targets: ['t-7'] });
  });

  it('returns empty targets when neither selection nor row id available', () => {
    const args = argsFor(
      action(snoozeThreadAction, threadModel),
      keyEv('b'),
      baseCtx(),
    );
    expect(args).toEqual({ targets: [] });
  });
});

describe('argsFor — openPanelAction', () => {
  it('returns { kind: "thread", threadId } from the row', () => {
    const args = argsFor(
      action(openPanelAction, threadModel),
      clickEv(rowWithThreadId('t-42')),
      baseCtx(),
    );
    expect(args).toEqual({ kind: 'thread', threadId: 't-42' });
  });

  it('returns empty object when no row found', () => {
    const args = argsFor(
      action(openPanelAction, threadModel),
      clickEv(null),
      baseCtx(),
    );
    expect(args).toEqual({});
  });
});

describe('argsFor — layout / app / selection actions', () => {
  it('layout close-panel takes no args', () => {
    expect(argsFor(
      action(closePanelAction),
      clickEv(null),
      baseCtx(),
    )).toEqual({});
  });

  it('layout nav-panel-next takes no args', () => {
    expect(argsFor(
      action(navPanelNextAction),
      swipeEv(null),
      baseCtx(),
    )).toEqual({});
  });

  it('selection enter-selection takes no args', () => {
    expect(argsFor(
      action(enterSelectionAction),
      clickEv(rowWithThreadId('t-1')),
      baseCtx(),
    )).toEqual({});
  });

  it('app undo takes no args', () => {
    expect(argsFor(
      action(undoAction),
      keyEv('mod+z'),
      baseCtx(),
    )).toEqual({});
  });
});
