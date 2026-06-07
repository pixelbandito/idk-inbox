import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { useRef } from 'react';
import { useGestureProducer, computeSwipeGeometry } from './fromGesture';
import type { AbstractEvent } from '../types';

// ---------- pure geometry tests (no React, no DOM) ----------

const RECT = { left: 0, right: 400, top: 0, bottom: 50, width: 400, height: 50 };

describe('computeSwipeGeometry', () => {
  it('classifies dominant +dx as inline / end in LTR', () => {
    const g = computeSwipeGeometry(200, 5, 50, 25, 250, 30, RECT, 'ltr');
    expect(g.axis).toBe('inline');
    expect(g.towards).toBe('end');
    expect(g.distance.pixels).toBe(200);
    expect(g.distance.fraction).toBe(0.5);
  });

  it('classifies dominant -dx as inline / start in LTR', () => {
    const g = computeSwipeGeometry(-200, 5, 250, 25, 50, 30, RECT, 'ltr');
    expect(g.axis).toBe('inline');
    expect(g.towards).toBe('start');
  });

  it('swaps inline towards in RTL', () => {
    const g = computeSwipeGeometry(200, 5, 50, 25, 250, 30, RECT, 'rtl');
    expect(g.axis).toBe('inline');
    expect(g.towards).toBe('start');   // +dx in RTL means towards inline start
  });

  it('classifies dominant +dy as block / end', () => {
    const tallRect = { left: 0, right: 400, top: 0, bottom: 800, width: 400, height: 800 };
    const g = computeSwipeGeometry(5, 200, 100, 50, 105, 250, tallRect, 'ltr');
    expect(g.axis).toBe('block');
    expect(g.towards).toBe('end');
  });

  it('computes startEdgeDistance from pointerdown to inline-start edge (LTR)', () => {
    // started at x=50, surface left=0 → 50px from start edge.
    const g = computeSwipeGeometry(200, 0, 50, 25, 250, 25, RECT, 'ltr');
    expect(g.startEdgeDistance.pixels).toBe(50);
    expect(g.startEdgeDistance.fraction).toBeCloseTo(0.125);
  });

  it('computes endEdgeDistance from pointerup to inline-end edge (LTR)', () => {
    // ended at x=380, surface right=400 → 20px from end edge.
    const g = computeSwipeGeometry(200, 0, 180, 25, 380, 25, RECT, 'ltr');
    expect(g.endEdgeDistance.pixels).toBe(20);
    expect(g.endEdgeDistance.fraction).toBeCloseTo(0.05);
  });

  it('mirrors edge distances in RTL', () => {
    // RTL: inline-start edge is rect.right; inline-end edge is rect.left.
    // started at x=350, rect.right=400 → start-edge = 50px.
    // ended at x=20, rect.left=0 → end-edge = 20px.
    const g = computeSwipeGeometry(-330, 0, 350, 25, 20, 25, RECT, 'rtl');
    expect(g.startEdgeDistance.pixels).toBe(50);
    expect(g.endEdgeDistance.pixels).toBe(20);
  });

  it('caps fractions at 1 (no overshoot)', () => {
    const g = computeSwipeGeometry(600, 0, 50, 25, 650, 25, RECT, 'ltr');
    expect(g.distance.fraction).toBe(1);
  });

  it('clamps negative pixel inputs to 0', () => {
    // pointerdown past the rect's left edge would yield startEdge < 0
    const g = computeSwipeGeometry(200, 0, -50, 25, 150, 25, RECT, 'ltr');
    expect(g.startEdgeDistance.pixels).toBe(0);
  });
});

// ---------- hook integration tests (with DOM) ----------

interface HarnessProps {
  onEvent: (e: AbstractEvent) => void;
  surfaceAttr?: string;   // value of data-surface on the outer container (omit to skip)
}

function Harness({ onEvent, surfaceAttr }: HarnessProps) {
  // The producer is mounted on an inner element; the surface-bearing element
  // sits between the document and the producer's target so resolveSurface
  // walks up and finds it.
  const ref = useRef<HTMLDivElement>(null);
  useGestureProducer('row', ref, onEvent);
  return (
    <div data-surface={surfaceAttr} data-testid="surface">
      <div ref={ref} data-testid="target" />
    </div>
  );
}

function mockRect(el: Element, rect: Partial<DOMRect>) {
  const full = { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}), ...rect } as DOMRect;
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue(full);
}

describe('useGestureProducer', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('emits gesture-click with the surface and retargeted to the surface element', () => {
    const onEvent = vi.fn<(e: AbstractEvent) => void>();
    const { getByTestId } = render(<Harness onEvent={onEvent} surfaceAttr="row" />);
    const target = getByTestId('target');
    fireEvent.pointerDown(target, { pointerId: 1, clientX: 50, clientY: 25 });
    fireEvent.pointerUp(target,   { pointerId: 1, clientX: 52, clientY: 26 });
    expect(onEvent).toHaveBeenCalledTimes(1);
    const ev = onEvent.mock.calls[0][0];
    expect(ev.kind).toBe('gesture-click');
    if (ev.kind === 'gesture-click') {
      expect(ev.surface).toBe('row');
      expect(ev.target).toBe(getByTestId('surface'));
    }
  });

  it('falls back to surface=document when no data-surface ancestor exists', () => {
    const onEvent = vi.fn<(e: AbstractEvent) => void>();
    const { getByTestId } = render(<Harness onEvent={onEvent} />);
    const target = getByTestId('target');
    fireEvent.pointerDown(target, { pointerId: 1, clientX: 50, clientY: 25 });
    fireEvent.pointerUp(target,   { pointerId: 1, clientX: 52, clientY: 26 });
    const ev = onEvent.mock.calls[0][0];
    expect(ev.kind).toBe('gesture-click');
    if (ev.kind === 'gesture-click') {
      expect(ev.surface).toBe('document');
    }
  });

  it('emits gesture-long-press with dt=0 (TODO marker)', () => {
    const onEvent = vi.fn<(e: AbstractEvent) => void>();
    const { getByTestId } = render(<Harness onEvent={onEvent} surfaceAttr="row" />);
    const target = getByTestId('target');
    fireEvent.pointerDown(target, { pointerId: 1, clientX: 50, clientY: 25 });
    vi.advanceTimersByTime(500);
    expect(onEvent).toHaveBeenCalledTimes(1);
    const ev = onEvent.mock.calls[0][0];
    expect(ev.kind).toBe('gesture-long-press');
    if (ev.kind === 'gesture-long-press') {
      expect(ev.surface).toBe('row');
      expect(ev.dt).toBe(0);
    }
  });

  it('emits gesture-swipe with axis/towards/distances computed from the surface rect', () => {
    const onEvent = vi.fn<(e: AbstractEvent) => void>();
    const { getByTestId } = render(<Harness onEvent={onEvent} surfaceAttr="row" />);
    const surface = getByTestId('surface');
    mockRect(surface, { left: 0, top: 0, right: 400, bottom: 50, width: 400, height: 50 });

    const target = getByTestId('target');
    fireEvent.pointerDown(target, { pointerId: 1, clientX: 50, clientY: 25 });
    fireEvent.pointerUp(target,   { pointerId: 1, clientX: 250, clientY: 30 });

    expect(onEvent).toHaveBeenCalledTimes(1);
    const ev = onEvent.mock.calls[0][0];
    expect(ev.kind).toBe('gesture-swipe');
    if (ev.kind === 'gesture-swipe') {
      expect(ev.surface).toBe('row');
      expect(ev.axis).toBe('inline');
      expect(ev.towards).toBe('end');
      expect(ev.distance.pixels).toBe(200);
      expect(ev.distance.fraction).toBe(0.5);
      expect(ev.startEdgeDistance.pixels).toBe(50);
      expect(ev.endEdgeDistance.pixels).toBe(150);   // 400 - 250
    }
  });
});
