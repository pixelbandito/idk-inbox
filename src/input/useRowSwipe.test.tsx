import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import { useRef } from 'react';
import { useRowSwipe, type RowSwipeApi, type RowSwipeOptions } from './useRowSwipe';
import type { ReadonlyContext } from './types';

const ctx = (selection: string[] = []): ReadonlyContext => ({
  focusedPanelIndex: 1, focusedPanelKind: 'threadlist', focusedLabel: 'INBOX',
  selection, mode: 'idle', signedIn: true,
});

function Row(props: RowSwipeOptions & { apiOut?: (api: RowSwipeApi) => void }) {
  const ref = useRef<HTMLLIElement>(null);
  const { apiOut, ...opts } = props;
  const api = useRowSwipe(ref, opts);
  apiOut?.(api);
  return (
    <li ref={ref} data-thread-id="t1" data-surface="row" data-testid="row">
      {api.reveal && (
        <button data-testid="action" onClick={api.commitReveal}>{api.reveal.label}</button>
      )}
    </li>
  );
}

function mountRow(overrides: Partial<RowSwipeOptions & { apiOut?: (api: RowSwipeApi) => void }> = {}) {
  const onTrigger = vi.fn();
  const dispatch = vi.fn().mockResolvedValue({ ok: true, description: '' });
  const utils = render(<Row onTrigger={onTrigger} dispatch={dispatch} ctx={ctx()} {...overrides} />);
  const el = utils.getByTestId('row');
  // jsdom reports 0 for layout sizes; the hook divides by clientWidth.
  Object.defineProperty(el, 'clientWidth', { value: 400 });
  return { el, onTrigger, dispatch, getByTestId: utils.getByTestId, queryByTestId: utils.queryByTestId };
}

/** Press at x=100, drag horizontally by dx in two moves, release. */
function swipe(el: HTMLElement, dx: number) {
  fireEvent.pointerDown(el, { pointerId: 1, clientX: 100, clientY: 100 });
  fireEvent.pointerMove(el, { pointerId: 1, clientX: 100 + dx / 2, clientY: 100 });
  fireEvent.pointerMove(el, { pointerId: 1, clientX: 100 + dx, clientY: 100 });
  fireEvent.pointerUp(el,   { pointerId: 1, clientX: 100 + dx, clientY: 100 });
}

describe('useRowSwipe — pointer drag-to-commit', () => {
  it('dispatches archive-thread targeting the row on a ~30% drag release', () => {
    const { el, onTrigger, dispatch } = mountRow();
    swipe(el, 120); // 120 / 400 = 0.30 — past the 0.15 tier-1 threshold
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      action: 'archive-thread',
      args: { targets: ['t1'] },
    }));
    expect(onTrigger).not.toHaveBeenCalled();
  });

  it('dispatches delete-thread past the ~50% threshold', () => {
    const { el, dispatch } = mountRow();
    swipe(el, 240); // 0.60 — past the 0.50 tier-2 threshold
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      action: 'delete-thread',
      args: { targets: ['t1'] },
    }));
  });

  it('fires onCommit when a swipe commits', () => {
    const onCommit = vi.fn();
    const { el } = mountRow({ onCommit });
    swipe(el, 120);
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('dispatches nothing, springs back, and does not fire onCommit under the tier-1 threshold', () => {
    const onCommit = vi.fn();
    const { el, onTrigger, dispatch } = mountRow({ onCommit });
    swipe(el, 48); // 0.12 — under the 0.15 threshold (and a drag, not a tap)
    expect(dispatch).not.toHaveBeenCalled();
    expect(onTrigger).not.toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
    expect(el.style.getPropertyValue('--drag-x')).toBe('0px');
  });

  it('forwards a plain click to onTrigger without dispatching', () => {
    const { el, onTrigger, dispatch } = mountRow();
    fireEvent.pointerDown(el, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerUp(el,   { pointerId: 1, clientX: 101, clientY: 100 });
    expect(onTrigger).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'gesture-click', surface: 'row', target: el,
    }));
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('paints live pull visuals and buzzes once when an action arms', () => {
    const vibrate = vi.fn();
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true, writable: true });
    try {
      const { el } = mountRow();
      fireEvent.pointerDown(el, { pointerId: 1, clientX: 100, clientY: 100 });
      fireEvent.pointerMove(el, { pointerId: 1, clientX: 130, clientY: 100 }); // 0.075 — unarmed
      expect(el.dataset.armedTone).toBeUndefined();
      expect(vibrate).not.toHaveBeenCalled();
      fireEvent.pointerMove(el, { pointerId: 1, clientX: 200, clientY: 100 }); // 0.25 — archive arms
      expect(el.dataset.armedIcon).toBe('archive');
      expect(vibrate).toHaveBeenCalledTimes(1);
      fireEvent.pointerMove(el, { pointerId: 1, clientX: 120, clientY: 100 }); // 0.05 — disarms
      expect(el.dataset.armedTone).toBeUndefined();
    } finally {
      Reflect.deleteProperty(navigator, 'vibrate');
    }
  });
});

describe('useRowSwipe — trackpad reveal-then-click', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('reveals a click-to-commit action on settle, without auto-committing', () => {
    const { el, dispatch, getByTestId } = mountRow();
    // Rightward two-finger scroll reports negative deltaX; 120px = 0.30 → archive.
    fireEvent.wheel(el, { deltaX: -40, deltaY: 0, cancelable: true });
    fireEvent.wheel(el, { deltaX: -40, deltaY: 0, cancelable: true });
    fireEvent.wheel(el, { deltaX: -40, deltaY: 0, cancelable: true });
    expect(dispatch).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(130); }); // scroll settles

    expect(dispatch).not.toHaveBeenCalled();     // revealed, NOT committed
    expect(el.dataset.revealed).toBe('true');
    expect(el.style.getPropertyValue('--drag-x')).toBe('80px'); // snapped open

    fireEvent.click(getByTestId('action'));       // now commit
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      action: 'archive-thread', args: { targets: ['t1'] },
    }));
  });

  it('reveals the heavy action when scrolled past the far threshold', () => {
    const { el, getByTestId, dispatch } = mountRow();
    fireEvent.wheel(el, { deltaX: -120, deltaY: 0, cancelable: true }); // 0.30
    fireEvent.wheel(el, { deltaX: -120, deltaY: 0, cancelable: true }); // 0.60 → delete
    act(() => { vi.advanceTimersByTime(130); });
    fireEvent.click(getByTestId('action'));
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ action: 'delete-thread' }));
  });

  it('springs back with no reveal when the scroll stays under the threshold', () => {
    const { el, queryByTestId } = mountRow();
    fireEvent.wheel(el, { deltaX: -30, deltaY: 0, cancelable: true }); // 0.075
    act(() => { vi.advanceTimersByTime(130); });
    expect(el.dataset.revealed).toBeUndefined();
    expect(queryByTestId('action')).toBeNull();
    expect(el.style.getPropertyValue('--drag-x')).toBe('0px');
  });

  it('lets vertical-dominant wheel through: no preventDefault, no reveal', () => {
    const { el, queryByTestId } = mountRow();
    const notPrevented = fireEvent.wheel(el, { deltaX: 2, deltaY: 40, cancelable: true });
    expect(notPrevented).toBe(true);
    act(() => { vi.advanceTimersByTime(130); });
    expect(queryByTestId('action')).toBeNull();
  });

  it('cancelReveal closes a snapped-open row', () => {
    let api!: RowSwipeApi;
    const { el } = mountRow({ apiOut: (a) => { api = a; } });
    fireEvent.wheel(el, { deltaX: -120, deltaY: 0, cancelable: true });
    act(() => { vi.advanceTimersByTime(130); });
    expect(el.dataset.revealed).toBe('true');
    act(() => { api.cancelReveal(); });
    expect(el.dataset.revealed).toBeUndefined();
    expect(el.style.getPropertyValue('--drag-x')).toBe('0px');
  });
});
