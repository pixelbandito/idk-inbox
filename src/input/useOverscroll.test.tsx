import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { useRef } from 'react';
import { useOverscroll } from './useOverscroll';

function Target({ onFire, edge, minPx }: { onFire: () => void; edge: 'top' | 'bottom'; minPx: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useOverscroll(ref, { edge, minPx, onFire });
  return (
    <div ref={ref} data-testid="t" style={{ height: 100, overflowY: 'scroll' }}>
      <div style={{ height: 1000 }}>content</div>
    </div>
  );
}

describe('useOverscroll', () => {
  it('fires when wheel deltaY accumulates past minPx at the bottom edge', () => {
    const onFire = vi.fn();
    const { getByTestId } = render(<Target onFire={onFire} edge="bottom" minPx={50} />);
    const el = getByTestId('t');
    Object.defineProperty(el, 'scrollTop',    { configurable: true, value: 900 });
    Object.defineProperty(el, 'scrollHeight', { configurable: true, value: 1000 });
    Object.defineProperty(el, 'clientHeight', { configurable: true, value: 100 });
    fireEvent.wheel(el, { deltaY: 30 });
    fireEvent.wheel(el, { deltaY: 30 });
    expect(onFire).toHaveBeenCalledTimes(1);
  });

  it('does not fire if the user is not at the bottom edge', () => {
    const onFire = vi.fn();
    const { getByTestId } = render(<Target onFire={onFire} edge="bottom" minPx={50} />);
    const el = getByTestId('t');
    Object.defineProperty(el, 'scrollTop',    { configurable: true, value: 100 });
    Object.defineProperty(el, 'scrollHeight', { configurable: true, value: 1000 });
    Object.defineProperty(el, 'clientHeight', { configurable: true, value: 100 });
    fireEvent.wheel(el, { deltaY: 100 });
    expect(onFire).not.toHaveBeenCalled();
  });

  it('also detects bottom overscroll via touchmove events', () => {
    const onFire = vi.fn();
    const { getByTestId } = render(<Target onFire={onFire} edge="bottom" minPx={50} />);
    const el = getByTestId('t');
    Object.defineProperty(el, 'scrollTop',    { configurable: true, value: 900 });
    Object.defineProperty(el, 'scrollHeight', { configurable: true, value: 1000 });
    Object.defineProperty(el, 'clientHeight', { configurable: true, value: 100 });
    fireEvent.touchStart(el, { touches: [{ clientY: 500 }] });
    fireEvent.touchMove(el,  { touches: [{ clientY: 400 }] });
    expect(onFire).toHaveBeenCalled();
  });
});
