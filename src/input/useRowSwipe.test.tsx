import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { useRef } from 'react';
import { useRowSwipe, type RowSwipeOptions } from './useRowSwipe';
import type { ReadonlyContext } from './types';

const ctx = (selection: string[] = []): ReadonlyContext => ({
  focusedPanelIndex: 1, focusedPanelKind: 'threadlist', focusedLabel: 'INBOX',
  selection, mode: 'idle', signedIn: true,
});

function Row(props: RowSwipeOptions) {
  const ref = useRef<HTMLLIElement>(null);
  useRowSwipe(ref, props);
  return <li ref={ref} data-thread-id="t1" data-surface="row" data-testid="row" />;
}

function mountRow(overrides: Partial<RowSwipeOptions> = {}) {
  const onTrigger = vi.fn();
  const dispatch = vi.fn().mockResolvedValue({ ok: true, description: '' });
  const { getByTestId } = render(
    <Row onTrigger={onTrigger} dispatch={dispatch} ctx={ctx()} {...overrides} />,
  );
  const el = getByTestId('row');
  // jsdom reports 0 for layout sizes; the hook divides by clientWidth.
  Object.defineProperty(el, 'clientWidth', { value: 400 });
  return { el, onTrigger, dispatch };
}

/** Press at x=100, drag horizontally by dx in two moves, release. */
function swipe(el: HTMLElement, dx: number) {
  fireEvent.pointerDown(el, { pointerId: 1, clientX: 100, clientY: 100 });
  fireEvent.pointerMove(el, { pointerId: 1, clientX: 100 + dx / 2, clientY: 100 });
  fireEvent.pointerMove(el, { pointerId: 1, clientX: 100 + dx, clientY: 100 });
  fireEvent.pointerUp(el,   { pointerId: 1, clientX: 100 + dx, clientY: 100 });
}

describe('useRowSwipe', () => {
  it('dispatches archive-thread targeting the row on a ~30% drag release', () => {
    const { el, onTrigger, dispatch } = mountRow();
    swipe(el, 120); // 120 / 400 = 0.30 — past the 0.25 tier-1 threshold
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      action: 'archive-thread',
      args: { targets: ['t1'] },
    }));
    // Row swipes never flow through the generic trigger pipeline.
    expect(onTrigger).not.toHaveBeenCalled();
  });

  it('dispatches delete-thread past the ~70% threshold', () => {
    const { el, dispatch } = mountRow();
    swipe(el, 320); // 0.80 — past the 0.70 tier-2 threshold
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      action: 'delete-thread',
      args: { targets: ['t1'] },
    }));
  });

  it('dispatches nothing and springs back on a sub-threshold drag', () => {
    const { el, onTrigger, dispatch } = mountRow();
    swipe(el, 70); // a real swipe (>= 60px) but only 0.175 of the width
    expect(dispatch).not.toHaveBeenCalled();
    expect(onTrigger).not.toHaveBeenCalled();
    expect(el.style.getPropertyValue('--drag-x')).toBe('0px');
  });

  it('forwards a plain click to onTrigger without dispatching', () => {
    const { el, onTrigger, dispatch } = mountRow();
    fireEvent.pointerDown(el, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerUp(el,   { pointerId: 1, clientX: 101, clientY: 100 });
    expect(onTrigger).toHaveBeenCalledTimes(1);
    expect(onTrigger).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'gesture-click', surface: 'row', target: el,
    }));
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('paints live pull visuals and buzzes once when an action arms', () => {
    const vibrate = vi.fn();
    Object.defineProperty(navigator, 'vibrate', {
      value: vibrate, configurable: true, writable: true,
    });
    try {
      const { el } = mountRow();
      fireEvent.pointerDown(el, { pointerId: 1, clientX: 100, clientY: 100 });

      fireEvent.pointerMove(el, { pointerId: 1, clientX: 140, clientY: 100 }); // 0.10 — unarmed
      expect(el.style.getPropertyValue('--drag-x')).toBe('40px');
      expect(el.dataset.pull).toBe('end');
      expect(el.dataset.armedTone).toBeUndefined();
      expect(el.dataset.armedIcon).toBeUndefined();
      expect(vibrate).not.toHaveBeenCalled();

      fireEvent.pointerMove(el, { pointerId: 1, clientX: 220, clientY: 100 }); // 0.30 — archive arms
      expect(el.dataset.armedTone).toBe('safe');
      expect(el.dataset.armedIcon).toBe('archive');
      expect(vibrate).toHaveBeenCalledTimes(1);

      fireEvent.pointerMove(el, { pointerId: 1, clientX: 230, clientY: 100 }); // same tier — no re-buzz
      expect(vibrate).toHaveBeenCalledTimes(1);

      fireEvent.pointerMove(el, { pointerId: 1, clientX: 140, clientY: 100 }); // back under — disarms
      expect(el.dataset.armedTone).toBeUndefined();
      expect(el.dataset.armedIcon).toBeUndefined();
    } finally {
      Reflect.deleteProperty(navigator, 'vibrate');
    }
  });
});
