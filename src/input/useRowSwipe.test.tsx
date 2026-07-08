import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, act, waitFor } from '@testing-library/react';
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
      {api.reveal?.actions.map((a) => (
        <button key={a.action} data-testid={`action-${a.action}`} onClick={() => api.commitReveal(a.action)}>
          {a.label}
        </button>
      ))}
    </li>
  );
}

function mountRow(overrides: Partial<RowSwipeOptions & { apiOut?: (api: RowSwipeApi) => void }> = {}) {
  const onTrigger = vi.fn();
  // A real write resolves with affectedTargets; that's what triggers onCommit.
  const dispatch = vi.fn().mockResolvedValue({ ok: true, description: '', affectedTargets: ['t1'] });
  const utils = render(<Row onTrigger={onTrigger} dispatch={dispatch} ctx={ctx()} {...overrides} />);
  const el = utils.getByTestId('row');
  Object.defineProperty(el, 'clientWidth', { value: 400 });
  return { el, onTrigger, dispatch, ...utils };
}

function swipe(el: HTMLElement, dx: number) {
  fireEvent.pointerDown(el, { pointerId: 1, clientX: 100, clientY: 100 });
  fireEvent.pointerMove(el, { pointerId: 1, clientX: 100 + dx / 2, clientY: 100 });
  fireEvent.pointerMove(el, { pointerId: 1, clientX: 100 + dx, clientY: 100 });
  fireEvent.pointerUp(el,   { pointerId: 1, clientX: 100 + dx, clientY: 100 });
}

describe('useRowSwipe — pointer drag-to-commit', () => {
  it('dispatches archive-thread targeting the row on a ~30% drag release', () => {
    const { el, onTrigger, dispatch } = mountRow();
    swipe(el, 120); // 0.30 — past the 0.15 tier-1 threshold
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      action: 'archive-thread', args: { targets: ['t1'] },
    }));
    expect(onTrigger).not.toHaveBeenCalled();
    // Tile is reset to centre on commit (no lingering slid-off reveal).
    expect(el.style.getPropertyValue('--drag-x')).toBe('0px');
    expect(el.dataset.armedTone).toBeUndefined();
  });

  it('dispatches delete-thread past the ~50% threshold', () => {
    const { el, dispatch } = mountRow();
    swipe(el, 240); // 0.60
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ action: 'delete-thread' }));
  });

  it('fires onCommit(action) after the write resolves', async () => {
    const onCommit = vi.fn();
    const { el } = mountRow({ onCommit });
    swipe(el, 120);
    await waitFor(() => expect(onCommit).toHaveBeenCalledWith('archive-thread'));
  });

  it('does not fire onCommit when the write was a no-op picker (no affectedTargets)', async () => {
    const onCommit = vi.fn();
    const dispatch = vi.fn().mockResolvedValue({ ok: true, description: 'Picker opened' });
    const { el } = mountRow({ onCommit, dispatch });
    swipe(el, 120);
    await Promise.resolve();
    await Promise.resolve();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('dispatches nothing and springs back under the tier-1 threshold', () => {
    const { el, dispatch } = mountRow();
    swipe(el, 48); // 0.12
    expect(dispatch).not.toHaveBeenCalled();
    expect(el.style.getPropertyValue('--drag-x')).toBe('0px');
  });

  it('forwards a plain click to onTrigger without dispatching', () => {
    const { el, onTrigger, dispatch } = mountRow();
    fireEvent.pointerDown(el, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerUp(el,   { pointerId: 1, clientX: 101, clientY: 100 });
    expect(onTrigger).toHaveBeenCalledWith(expect.objectContaining({ kind: 'gesture-click' }));
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe('useRowSwipe — trackpad reveal-then-click', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('reveals one action on a light scroll, committing only on click', () => {
    const { el, dispatch, getByTestId } = mountRow();
    fireEvent.wheel(el, { deltaX: -40, deltaY: 0, cancelable: true });
    fireEvent.wheel(el, { deltaX: -40, deltaY: 0, cancelable: true });
    fireEvent.wheel(el, { deltaX: -40, deltaY: 0, cancelable: true }); // 120px = 0.30
    act(() => { vi.advanceTimersByTime(130); });

    expect(dispatch).not.toHaveBeenCalled();
    expect(el.dataset.revealed).toBe('true');
    expect(el.style.getPropertyValue('--drag-x')).toBe('72px'); // one button wide

    fireEvent.click(getByTestId('action-archive-thread'));
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ action: 'archive-thread' }));
  });

  it('reveals BOTH the light and heavy actions when scrolled far', () => {
    const { el, getByTestId, dispatch } = mountRow();
    fireEvent.wheel(el, { deltaX: -120, deltaY: 0, cancelable: true });
    fireEvent.wheel(el, { deltaX: -120, deltaY: 0, cancelable: true }); // 240px = 0.60
    act(() => { vi.advanceTimersByTime(130); });

    expect(el.style.getPropertyValue('--drag-x')).toBe('144px'); // two buttons wide
    getByTestId('action-archive-thread'); // light present
    getByTestId('action-delete-thread');  // heavy present

    fireEvent.click(getByTestId('action-delete-thread'));
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ action: 'delete-thread' }));
  });

  it('springs back with no reveal when the scroll stays under the threshold', () => {
    const { el, queryByTestId } = mountRow();
    fireEvent.wheel(el, { deltaX: -30, deltaY: 0, cancelable: true }); // 0.075
    act(() => { vi.advanceTimersByTime(130); });
    expect(el.dataset.revealed).toBeUndefined();
    expect(queryByTestId('action-archive-thread')).toBeNull();
    expect(el.style.getPropertyValue('--drag-x')).toBe('0px');
  });

  it('lets vertical-dominant wheel through: no preventDefault, no reveal', () => {
    const { el, queryByTestId } = mountRow();
    const notPrevented = fireEvent.wheel(el, { deltaX: 2, deltaY: 40, cancelable: true });
    expect(notPrevented).toBe(true);
    act(() => { vi.advanceTimersByTime(130); });
    expect(queryByTestId('action-archive-thread')).toBeNull();
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
