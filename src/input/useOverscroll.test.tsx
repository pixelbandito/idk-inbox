import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { useRef } from 'react';
import { useOverscroll } from './useOverscroll';

function Target(props: { onFire: () => void; edge: 'top' | 'bottom'; minPx: number; onProgress?: (f: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useOverscroll(ref, props);
  return (
    <div ref={ref} data-testid="t" style={{ height: 100, overflowY: 'scroll' }}>
      <div style={{ height: 1000 }}>content</div>
    </div>
  );
}

function atBottom(el: HTMLElement) {
  Object.defineProperty(el, 'scrollTop',    { configurable: true, value: 900 });
  Object.defineProperty(el, 'scrollHeight', { configurable: true, value: 1000 });
  Object.defineProperty(el, 'clientHeight', { configurable: true, value: 100 });
}

describe('useOverscroll', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('fires on wheel-settle once the pull passes minPx at the bottom edge', () => {
    const onFire = vi.fn();
    const { getByTestId } = render(<Target onFire={onFire} edge="bottom" minPx={50} />);
    const el = getByTestId('t');
    atBottom(el);
    fireEvent.wheel(el, { deltaY: 30 });
    fireEvent.wheel(el, { deltaY: 30 }); // accumulated 60 >= 50
    expect(onFire).not.toHaveBeenCalled();      // not until it settles
    vi.advanceTimersByTime(200);                // wheel settles
    expect(onFire).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire when the pull settles below minPx (a quick flick)', () => {
    const onFire = vi.fn();
    const { getByTestId } = render(<Target onFire={onFire} edge="bottom" minPx={130} />);
    const el = getByTestId('t');
    atBottom(el);
    fireEvent.wheel(el, { deltaY: 40 }); // only 40 of 130
    vi.advanceTimersByTime(200);
    expect(onFire).not.toHaveBeenCalled();
  });

  it('does not fire when the user is not at the bottom edge', () => {
    const onFire = vi.fn();
    const { getByTestId } = render(<Target onFire={onFire} edge="bottom" minPx={50} />);
    const el = getByTestId('t');
    Object.defineProperty(el, 'scrollTop',    { configurable: true, value: 100 });
    Object.defineProperty(el, 'scrollHeight', { configurable: true, value: 1000 });
    Object.defineProperty(el, 'clientHeight', { configurable: true, value: 100 });
    fireEvent.wheel(el, { deltaY: 100 });
    vi.advanceTimersByTime(200);
    expect(onFire).not.toHaveBeenCalled();
  });

  it('fires touch overscroll on release, not mid-pull', () => {
    const onFire = vi.fn();
    const { getByTestId } = render(<Target onFire={onFire} edge="bottom" minPx={50} />);
    const el = getByTestId('t');
    atBottom(el);
    fireEvent.touchStart(el, { touches: [{ clientY: 500 }] });
    fireEvent.touchMove(el,  { touches: [{ clientY: 440 }] }); // 60px pull up past bottom
    expect(onFire).not.toHaveBeenCalled();
    fireEvent.touchEnd(el);
    expect(onFire).toHaveBeenCalledTimes(1);
  });

  it('reports progress toward the threshold', () => {
    const onProgress = vi.fn();
    const { getByTestId } = render(<Target onFire={vi.fn()} onProgress={onProgress} edge="bottom" minPx={100} />);
    const el = getByTestId('t');
    atBottom(el);
    fireEvent.touchStart(el, { touches: [{ clientY: 500 }] });
    fireEvent.touchMove(el,  { touches: [{ clientY: 450 }] }); // 50/100 = 0.5
    expect(onProgress).toHaveBeenLastCalledWith(0.5);
    fireEvent.touchMove(el,  { touches: [{ clientY: 400 }] }); // 100/100 = 1
    expect(onProgress).toHaveBeenLastCalledWith(1);
  });
});
