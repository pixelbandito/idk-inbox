import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { useRef } from 'react';
import { useOverscrollProducer } from './fromOverscroll';
import type { AbstractEvent } from '../types';

function Body({ onEvent }: { onEvent: (e: AbstractEvent) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useOverscrollProducer(ref, onEvent);
  return (
    <div
      ref={ref}
      data-testid="body"
      data-surface="panel-body"
      style={{ height: 100, overflowY: 'scroll' }}
    >
      <div style={{ height: 1000 }}>content</div>
    </div>
  );
}

function pinScroll(el: Element, scrollTop: number, scrollHeight: number, clientHeight: number) {
  Object.defineProperty(el, 'scrollTop',    { configurable: true, value: scrollTop });
  Object.defineProperty(el, 'scrollHeight', { configurable: true, value: scrollHeight });
  Object.defineProperty(el, 'clientHeight', { configurable: true, value: clientHeight });
}

describe('useOverscrollProducer', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  it('emits a block-end gesture-overscroll AbstractEvent when the underlying overscroll fires', () => {
    const onEvent = vi.fn<(e: AbstractEvent) => void>();
    const { getByTestId } = render(<Body onEvent={onEvent} />);
    const el = getByTestId('body');
    pinScroll(el, 900, 1000, 100);

    // Wheel past the 130px threshold, then let the stream settle (fires on release).
    fireEvent.wheel(el, { deltaY: 90 });
    fireEvent.wheel(el, { deltaY: 90 });
    expect(onEvent).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);

    expect(onEvent).toHaveBeenCalledTimes(1);
    const evt = onEvent.mock.calls[0]![0];
    expect(evt.kind).toBe('gesture-overscroll');
    if (evt.kind !== 'gesture-overscroll') return;
    expect(evt.edge).toBe('block-end');
    expect(evt.surface).toBe('panel-body');
    // Distance carries the configured threshold; fraction normalises to the
    // scroll container's clientHeight (100 → capped at 1).
    expect(evt.distance.pixels).toBe(130);
    expect(evt.distance.fraction).toBeCloseTo(1, 5);
  });

  it('does not emit when the underlying overscroll does not fire', () => {
    const onEvent = vi.fn();
    const { getByTestId } = render(<Body onEvent={onEvent} />);
    const el = getByTestId('body');
    pinScroll(el, 100, 1000, 100);  // not at the bottom edge

    fireEvent.wheel(el, { deltaY: 200 });
    expect(onEvent).not.toHaveBeenCalled();
  });

  it('falls back to document surface when no data-surface ancestor is found', () => {
    // Render a body without data-surface — the producer should still emit,
    // resolving to surface='document'.
    function Bare({ onEvent }: { onEvent: (e: AbstractEvent) => void }) {
      const ref = useRef<HTMLDivElement>(null);
      useOverscrollProducer(ref, onEvent);
      return (
        <div ref={ref} data-testid="bare" style={{ height: 100, overflowY: 'scroll' }}>
          <div style={{ height: 1000 }}>content</div>
        </div>
      );
    }
    const onEvent = vi.fn<(e: AbstractEvent) => void>();
    const { getByTestId } = render(<Bare onEvent={onEvent} />);
    const el = getByTestId('bare');
    pinScroll(el, 900, 1000, 100);

    fireEvent.wheel(el, { deltaY: 200 });
    vi.advanceTimersByTime(200);

    expect(onEvent).toHaveBeenCalledTimes(1);
    const evt = onEvent.mock.calls[0]![0];
    if (evt.kind !== 'gesture-overscroll') throw new Error('wrong kind');
    expect(evt.surface).toBe('document');
  });
});
