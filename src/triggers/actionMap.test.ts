import { describe, it, expect } from 'vitest';
import {
  archiveThreadAction,
  deleteThreadAction,
  spamThreadAction,
  snoozeThreadAction,
  addLabelThreadAction,
  enterSelectionAction,
  openPanelAction,
  closePanelAction,
  navPanelPrevAction,
  navPanelNextAction,
  openCommandPaletteAction,
  exitModeAction,
  undoAction,
  redoAction,
} from '../actions/types';
import {
  click,
  pressLong,
  swipeInlineEnd,
  swipeInlineEndEdge,
  swipeInlineStart,
  swipeInlineStartEdge,
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
} from './triggers';
import { ACTION_MAP } from './actionMap';

describe('ACTION_MAP — row surface', () => {
  const row = ACTION_MAP.get('row')!;
  it('exists', () => { expect(row).toBeDefined(); });
  it('click → open-panel', () => {
    expect(row.get(click)).toBe(openPanelAction);
  });
  it('swipeInlineEnd → archive-thread', () => {
    expect(row.get(swipeInlineEnd)).toBe(archiveThreadAction);
  });
  it('swipeInlineEndEdge → delete-thread', () => {
    expect(row.get(swipeInlineEndEdge)).toBe(deleteThreadAction);
  });
  it('swipeInlineStart → snooze-thread', () => {
    expect(row.get(swipeInlineStart)).toBe(snoozeThreadAction);
  });
  it('swipeInlineStartEdge → add-label-thread', () => {
    expect(row.get(swipeInlineStartEdge)).toBe(addLabelThreadAction);
  });
  it('pressLong → enter-selection', () => {
    expect(row.get(pressLong)).toBe(enterSelectionAction);
  });
});

describe('ACTION_MAP — panel-header surface', () => {
  const header = ACTION_MAP.get('panel-header')!;
  it('exists', () => { expect(header).toBeDefined(); });
  it('swipeInlineEnd → nav-panel-next', () => {
    expect(header.get(swipeInlineEnd)).toBe(navPanelNextAction);
  });
  it('swipeInlineStart → nav-panel-prev', () => {
    expect(header.get(swipeInlineStart)).toBe(navPanelPrevAction);
  });
});

describe('ACTION_MAP — panel-body surface', () => {
  const body = ACTION_MAP.get('panel-body')!;
  it('exists', () => { expect(body).toBeDefined(); });
  it('overscrollBlockEnd → close-panel', () => {
    expect(body.get(overscrollBlockEnd)).toBe(closePanelAction);
  });
});

describe('ACTION_MAP — document surface', () => {
  const doc = ACTION_MAP.get('document')!;
  it('exists', () => { expect(doc).toBeDefined(); });
  const cases: Array<[string, symbol, symbol]> = [
    ['j',            keypressJ,         archiveThreadAction],
    ['e',            keypressE,         archiveThreadAction],
    ['#',            keypressHash,      deleteThreadAction],
    ['!',            keypressBang,      spamThreadAction],
    ['b',            keypressB,         snoozeThreadAction],
    ['mod+k',        keypressModK,      openCommandPaletteAction],
    ['escape',       keypressEscape,    exitModeAction],
    ['mod+z',        keypressModZ,      undoAction],
    ['mod+shift+z',  keypressModShiftZ, redoAction],
  ];
  for (const [combo, trig, action] of cases) {
    it(`keypress ${combo} → ${action.toString()}`, () => {
      expect(doc.get(trig)).toBe(action);
    });
  }
});

describe('ACTION_MAP — shipped surfaces', () => {
  it('has entries for row, panel-header, panel-body, document', () => {
    for (const s of ['row', 'panel-header', 'panel-body', 'document'] as const) {
      const m = ACTION_MAP.get(s);
      expect(m).toBeDefined();
      expect(m!.size).toBeGreaterThan(0);
    }
  });
  it('does not pre-populate overlay (overlays self-handle pointer events)', () => {
    expect(ACTION_MAP.get('overlay')).toBeUndefined();
  });
});
