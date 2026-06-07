import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  archiveThreadAction,
  deleteThreadAction,
  openPanelAction,
} from '../actions/types';
import type { ActionName } from '../actions/types';
import type { ReadonlyContext } from '../input/types';
import {
  click,
  swipeInlineEnd,
  swipeInlineEndEdge,
} from './triggers';
import type { Trigger, AbstractEvent, Distance, Surface, TriggerName } from './types';
import { resolveAndFire } from './resolve';

// ----- Fixtures -----

const baseCtx = (): ReadonlyContext => ({
  focusedPanelIndex: 0,
  focusedPanelKind: 'threadlist',
  selection: [],
  mode: 'idle',
  signedIn: true,
});

const dist = (fraction: number, pixels: number): Distance => ({ fraction, pixels });

function rowEl(id = 't-1'): HTMLElement {
  const li = document.createElement('li');
  li.setAttribute('data-thread-id', id);
  return li;
}

const clickEv = (surface: Surface = 'row', target: Element | null = rowEl()): AbstractEvent =>
  ({ kind: 'gesture-click', surface, target });

const swipeEv = (opts: {
  distance:         Distance;
  endEdgeDistance?: Distance;
  surface?:         Surface;
  target?:          Element | null;
}): AbstractEvent => ({
  kind: 'gesture-swipe',
  surface: opts.surface ?? 'row',
  target: opts.target ?? rowEl(),
  axis: 'inline',
  towards: 'end',
  distance:          opts.distance,
  startEdgeDistance: dist(0.5, 200),
  endEdgeDistance:   opts.endEdgeDistance ?? dist(0.5, 200),
  dt: 200,
});

// ----- Test triggers (synthetic — independent of the real registry) -----

const triggerA: TriggerName = Symbol('A');
const triggerB: TriggerName = Symbol('B');

const trueTrigger = (name: TriggerName, priority: number): Trigger => ({
  name,
  priority,
  match: () => true,
});

const falseTrigger = (name: TriggerName, priority: number): Trigger => ({
  name,
  priority,
  match: () => false,
});

// ----- Tests -----

describe('resolveAndFire', () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  it('returns null when no triggers match', async () => {
    const dispatch = vi.fn().mockResolvedValue({ ok: true, description: 'ok' });
    const map = new Map<Surface, Map<TriggerName, ActionName>>([
      ['row', new Map([[triggerA, archiveThreadAction]])],
    ]);
    const result = await resolveAndFire(
      clickEv(),
      baseCtx(),
      dispatch,
      map,
      [falseTrigger(triggerA, 5)],
    );
    expect(result).toBeNull();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('returns null when no surface entry has an assignment for matched triggers', async () => {
    const dispatch = vi.fn().mockResolvedValue({ ok: true, description: 'ok' });
    const map = new Map<Surface, Map<TriggerName, ActionName>>([
      // Different surface than the event will carry.
      ['document', new Map([[triggerA, archiveThreadAction]])],
    ]);
    const result = await resolveAndFire(
      clickEv('row'),
      baseCtx(),
      dispatch,
      map,
      [trueTrigger(triggerA, 5)],
    );
    expect(result).toBeNull();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('fires the assigned action when one trigger matches and has an action', async () => {
    const dispatch = vi.fn().mockResolvedValue({ ok: true, description: 'opened' });
    const map = new Map<Surface, Map<TriggerName, ActionName>>([
      ['row', new Map([[click, openPanelAction]])],
    ]);
    const realClick: Trigger = { name: click, priority: 1, match: (e) => e.kind === 'gesture-click' };
    const result = await resolveAndFire(
      clickEv('row', rowEl('t-99')),
      baseCtx(),
      dispatch,
      map,
      [realClick],
    );
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0][0]).toMatchObject({
      action: openPanelAction,
      args: { kind: 'thread', threadId: 't-99' },
    });
    expect(result).toEqual({ ok: true, description: 'opened' });
  });

  it('higher-priority winner fires when two triggers match', async () => {
    const dispatch = vi.fn().mockResolvedValue({ ok: true, description: 'done' });
    const map = new Map<Surface, Map<TriggerName, ActionName>>([
      ['row', new Map<TriggerName, ActionName>([
        [triggerA, archiveThreadAction],
        [triggerB, deleteThreadAction],
      ])],
    ]);
    await resolveAndFire(
      clickEv('row'),
      baseCtx(),
      dispatch,
      map,
      [
        trueTrigger(triggerA, 5),
        trueTrigger(triggerB, 10),
      ],
    );
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0][0].action).toBe(deleteThreadAction);
  });

  it('falls back to lower-priority trigger when higher has no action in this surface', async () => {
    const dispatch = vi.fn().mockResolvedValue({ ok: true, description: 'archived' });
    const map = new Map<Surface, Map<TriggerName, ActionName>>([
      ['row', new Map([
        // Only triggerA is mapped under row.
        [triggerA, archiveThreadAction],
      ])],
    ]);
    await resolveAndFire(
      clickEv('row'),
      baseCtx(),
      dispatch,
      map,
      [
        trueTrigger(triggerA, 5),
        trueTrigger(triggerB, 10),  // higher priority but unmapped
      ],
    );
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0][0].action).toBe(archiveThreadAction);
  });

  it('warns and fires the first-defined trigger on a priority tie', async () => {
    const dispatch = vi.fn().mockResolvedValue({ ok: true, description: 'done' });
    const map = new Map<Surface, Map<TriggerName, ActionName>>([
      ['row', new Map<TriggerName, ActionName>([
        [triggerA, archiveThreadAction],
        [triggerB, deleteThreadAction],
      ])],
    ]);
    await resolveAndFire(
      clickEv('row'),
      baseCtx(),
      dispatch,
      map,
      [
        trueTrigger(triggerA, 7),
        trueTrigger(triggerB, 7),
      ],
    );
    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledTimes(1);
    // Stable sort means first-defined wins on tie.
    expect(dispatch.mock.calls[0][0].action).toBe(archiveThreadAction);
  });

  it('end-to-end against the real registry: long swipe ending at edge fires delete', async () => {
    const dispatch = vi.fn().mockResolvedValue({ ok: true, description: 'deleted' });
    const map = new Map<Surface, Map<TriggerName, ActionName>>([
      ['row', new Map<TriggerName, ActionName>([
        [swipeInlineEnd,     archiveThreadAction],
        [swipeInlineEndEdge, deleteThreadAction],
      ])],
    ]);
    const realRegistry: Trigger[] = [
      {
        name: swipeInlineEnd,
        priority: 5,
        match: (e) => e.kind === 'gesture-swipe' && e.axis === 'inline' && e.towards === 'end'
                      && e.distance.fraction >= 0.20 && e.distance.pixels >= 60,
      },
      {
        name: swipeInlineEndEdge,
        priority: 10,
        match: (e) => e.kind === 'gesture-swipe' && e.axis === 'inline' && e.towards === 'end'
                      && e.distance.fraction >= 0.50 && e.distance.pixels >= 240
                      && (e.endEdgeDistance.fraction <= 0.05 || e.endEdgeDistance.pixels <= 48),
      },
    ];
    await resolveAndFire(
      swipeEv({ distance: dist(0.60, 300), endEdgeDistance: dist(0.02, 10) }),
      baseCtx(),
      dispatch,
      map,
      realRegistry,
    );
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0][0].action).toBe(deleteThreadAction);
  });
});
