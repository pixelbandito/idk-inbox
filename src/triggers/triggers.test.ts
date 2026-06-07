import { describe, it, expect } from 'vitest';
import type { AbstractEvent, Distance, Surface } from './types';
import {
  click,
  pressLong,
  swipeInlineEnd,
  swipeInlineEndEdge,
  swipeInlineStart,
  swipeInlineStartEdge,
  swipeBlockEnd,
  swipeBlockStart,
  overscrollBlockEnd,
  keypressJ,
  keypressE,
  keypressHash,
  keypressBang,
  keypressB,
  keypressModK,
  keypressEscape,
  keypressModZ,
  keypressModShiftZ,
  TRIGGERS,
  TRIGGER_BY_NAME,
} from './triggers';

// ----- Synthesis helpers -----

const dist = (fraction: number, pixels: number): Distance => ({ fraction, pixels });

const clickEv  = (surface: Surface = 'row'): AbstractEvent =>
  ({ kind: 'gesture-click', surface, target: null });

const longEv = (dt = 500, surface: Surface = 'row'): AbstractEvent =>
  ({ kind: 'gesture-long-press', surface, target: null, dt });

const swipeEv = (opts: {
  axis: 'inline' | 'block';
  towards: 'start' | 'end';
  distance: Distance;
  startEdgeDistance?: Distance;
  endEdgeDistance?:   Distance;
  surface?: Surface;
  dt?: number;
}): AbstractEvent => ({
  kind: 'gesture-swipe',
  surface: opts.surface ?? 'row',
  target: null,
  axis: opts.axis,
  towards: opts.towards,
  distance:          opts.distance,
  startEdgeDistance: opts.startEdgeDistance ?? dist(0.5, 200),
  endEdgeDistance:   opts.endEdgeDistance   ?? dist(0.5, 200),
  dt: opts.dt ?? 200,
});

const overscrollEv = (
  edge: 'block-start' | 'block-end',
  distance: Distance,
  surface: Surface = 'panel-body',
): AbstractEvent => ({ kind: 'gesture-overscroll', surface, edge, distance });

const keyEv = (combo: string, surface: Surface = 'document'): AbstractEvent =>
  ({ kind: 'keypress', surface, combo });

// ----- Registry sanity -----

describe('TRIGGERS registry', () => {
  it('exports every defined trigger record', () => {
    const names = new Set(TRIGGERS.map((t) => t.name));
    for (const sym of [
      click, pressLong,
      swipeInlineEnd, swipeInlineEndEdge, swipeInlineStart, swipeInlineStartEdge,
      swipeBlockEnd, swipeBlockStart,
      overscrollBlockEnd,
      keypressJ, keypressE, keypressHash, keypressBang, keypressB,
      keypressModK, keypressEscape, keypressModZ, keypressModShiftZ,
    ]) {
      expect(names.has(sym)).toBe(true);
    }
  });
  it('TRIGGER_BY_NAME mirrors TRIGGERS', () => {
    for (const t of TRIGGERS) {
      expect(TRIGGER_BY_NAME.get(t.name)).toBe(t);
    }
  });
});

// ----- Click & long-press -----

describe('click trigger', () => {
  const t = TRIGGER_BY_NAME.get(click)!;
  it('matches gesture-click', () => {
    expect(t.match(clickEv())).toBe(true);
  });
  it('does not match other event kinds', () => {
    expect(t.match(longEv())).toBe(false);
    expect(t.match(keyEv('j'))).toBe(false);
  });
});

describe('pressLong trigger', () => {
  const t = TRIGGER_BY_NAME.get(pressLong)!;
  it('matches gesture-long-press', () => {
    expect(t.match(longEv())).toBe(true);
  });
  it('does not match click', () => {
    expect(t.match(clickEv())).toBe(false);
  });
});

// ----- Inline swipe triggers -----

describe('swipeInlineEnd trigger', () => {
  const t = TRIGGER_BY_NAME.get(swipeInlineEnd)!;
  it('matches an inline-end swipe past the bulk threshold', () => {
    expect(t.match(swipeEv({
      axis: 'inline', towards: 'end',
      distance: dist(0.25, 100),
    }))).toBe(true);
  });
  it('does not match a too-short swipe', () => {
    expect(t.match(swipeEv({
      axis: 'inline', towards: 'end',
      distance: dist(0.10, 30),
    }))).toBe(false);
  });
  it('does not match block-axis or start-direction swipes', () => {
    expect(t.match(swipeEv({
      axis: 'block', towards: 'end',
      distance: dist(0.30, 200),
    }))).toBe(false);
    expect(t.match(swipeEv({
      axis: 'inline', towards: 'start',
      distance: dist(0.30, 200),
    }))).toBe(false);
  });
});

describe('swipeInlineEndEdge trigger', () => {
  const t = TRIGGER_BY_NAME.get(swipeInlineEndEdge)!;
  it('matches a long swipe ending at the end edge', () => {
    expect(t.match(swipeEv({
      axis: 'inline', towards: 'end',
      distance:        dist(0.60, 300),
      endEdgeDistance: dist(0.02, 10),
    }))).toBe(true);
  });
  it('does not match when distance falls short', () => {
    expect(t.match(swipeEv({
      axis: 'inline', towards: 'end',
      distance:        dist(0.30, 120),
      endEdgeDistance: dist(0.02, 10),
    }))).toBe(false);
  });
  it('does not match when not near the end edge', () => {
    expect(t.match(swipeEv({
      axis: 'inline', towards: 'end',
      distance:        dist(0.60, 300),
      endEdgeDistance: dist(0.40, 200),
    }))).toBe(false);
  });
});

describe('swipeInlineStart trigger', () => {
  const t = TRIGGER_BY_NAME.get(swipeInlineStart)!;
  it('matches an inline-start swipe past the bulk threshold', () => {
    expect(t.match(swipeEv({
      axis: 'inline', towards: 'start',
      distance: dist(0.30, 100),
    }))).toBe(true);
  });
  it('does not match an end-direction swipe', () => {
    expect(t.match(swipeEv({
      axis: 'inline', towards: 'end',
      distance: dist(0.30, 100),
    }))).toBe(false);
  });
});

describe('swipeInlineStartEdge trigger', () => {
  const t = TRIGGER_BY_NAME.get(swipeInlineStartEdge)!;
  it('matches a long swipe ending at the start edge', () => {
    expect(t.match(swipeEv({
      axis: 'inline', towards: 'start',
      distance:          dist(0.60, 300),
      startEdgeDistance: dist(0.02, 10),
    }))).toBe(true);
  });
  it('does not match when not near the start edge', () => {
    expect(t.match(swipeEv({
      axis: 'inline', towards: 'start',
      distance:          dist(0.60, 300),
      startEdgeDistance: dist(0.40, 200),
    }))).toBe(false);
  });
});

// ----- Block swipes (reserved, no consumers) -----

describe('swipeBlockEnd / swipeBlockStart triggers (reserved)', () => {
  it('swipeBlockEnd matches a block-end swipe', () => {
    const t = TRIGGER_BY_NAME.get(swipeBlockEnd)!;
    expect(t.match(swipeEv({
      axis: 'block', towards: 'end',
      distance: dist(0.30, 100),
    }))).toBe(true);
    expect(t.match(swipeEv({
      axis: 'inline', towards: 'end',
      distance: dist(0.30, 100),
    }))).toBe(false);
  });
  it('swipeBlockStart matches a block-start swipe', () => {
    const t = TRIGGER_BY_NAME.get(swipeBlockStart)!;
    expect(t.match(swipeEv({
      axis: 'block', towards: 'start',
      distance: dist(0.30, 100),
    }))).toBe(true);
    expect(t.match(swipeEv({
      axis: 'block', towards: 'end',
      distance: dist(0.30, 100),
    }))).toBe(false);
  });
});

// ----- Overscroll -----

describe('overscrollBlockEnd trigger', () => {
  const t = TRIGGER_BY_NAME.get(overscrollBlockEnd)!;
  it('matches a block-end overscroll past threshold', () => {
    expect(t.match(overscrollEv('block-end', dist(0.20, 80)))).toBe(true);
  });
  it('does not match block-start', () => {
    expect(t.match(overscrollEv('block-start', dist(0.20, 80)))).toBe(false);
  });
  it('does not match a too-small overscroll', () => {
    expect(t.match(overscrollEv('block-end', dist(0.02, 5)))).toBe(false);
  });
});

// ----- Keypresses -----

describe('keypress triggers', () => {
  const cases: Array<[symbol, string]> = [
    [keypressJ,         'j'],
    [keypressE,         'e'],
    [keypressHash,      '#'],
    [keypressBang,      '!'],
    [keypressB,         'b'],
    [keypressModK,      'mod+k'],
    [keypressEscape,    'escape'],
    [keypressModZ,      'mod+z'],
    [keypressModShiftZ, 'mod+shift+z'],
  ];

  for (const [sym, combo] of cases) {
    it(`${combo} matches its trigger and nothing else`, () => {
      const t = TRIGGER_BY_NAME.get(sym)!;
      expect(t.match(keyEv(combo))).toBe(true);
      expect(t.match(keyEv('q'))).toBe(false);
      expect(t.match(clickEv())).toBe(false);
    });
  }
});
