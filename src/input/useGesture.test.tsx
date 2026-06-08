import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { useRef } from 'react';
import { useGesture, type GestureCallbacks } from './useGesture';

function Target(props: GestureCallbacks) {
  const ref = useRef<HTMLDivElement>(null);
  useGesture('row', ref, props);
  return <div ref={ref} data-testid="target" data-thread-id="tA" style={{ width: 300, height: 50 }} />;
}

describe('useGesture', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('fires onClick on a quick pointer down/up with no significant movement', () => {
    const onClick = vi.fn();
    const { getByTestId } = render(<Target onClick={onClick} />);
    const el = getByTestId('target');
    fireEvent.pointerDown(el, { pointerId: 1, clientX: 50, clientY: 50 });
    fireEvent.pointerUp(el,   { pointerId: 1, clientX: 52, clientY: 51 });
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('fires onSwipe with direction=right when Δx > threshold and dominant', () => {
    const onSwipe = vi.fn();
    const { getByTestId } = render(<Target onSwipe={onSwipe} />);
    const el = getByTestId('target');
    fireEvent.pointerDown(el, { pointerId: 1, clientX: 50, clientY: 50 });
    fireEvent.pointerUp(el,   { pointerId: 1, clientX: 250, clientY: 55 });
    expect(onSwipe).toHaveBeenCalledTimes(1);
    expect(onSwipe.mock.calls[0][0]).toMatchObject({ direction: 'right', dx: 200 });
  });

  it('fires onSwipe with direction=left when Δx < -threshold and dominant', () => {
    const onSwipe = vi.fn();
    const { getByTestId } = render(<Target onSwipe={onSwipe} />);
    const el = getByTestId('target');
    fireEvent.pointerDown(el, { pointerId: 1, clientX: 250, clientY: 50 });
    fireEvent.pointerUp(el,   { pointerId: 1, clientX: 50, clientY: 50 });
    expect(onSwipe.mock.calls[0][0]).toMatchObject({ direction: 'left' });
  });

  it('fires onSwipe with direction=down when Δy is dominant', () => {
    const onSwipe = vi.fn();
    const { getByTestId } = render(<Target onSwipe={onSwipe} />);
    const el = getByTestId('target');
    fireEvent.pointerDown(el, { pointerId: 1, clientX: 50, clientY: 50 });
    fireEvent.pointerUp(el,   { pointerId: 1, clientX: 55, clientY: 250 });
    expect(onSwipe.mock.calls[0][0]).toMatchObject({ direction: 'down' });
  });

  it('fires onLongPress after the ms threshold without significant movement', () => {
    const onLongPress = vi.fn();
    const { getByTestId } = render(<Target onLongPress={onLongPress} longPressMs={500} />);
    const el = getByTestId('target');
    fireEvent.pointerDown(el, { pointerId: 1, clientX: 50, clientY: 50 });
    vi.advanceTimersByTime(500);
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it('cancels long-press if movement exceeds tolerance', () => {
    const onLongPress = vi.fn();
    const { getByTestId } = render(<Target onLongPress={onLongPress} longPressMs={500} />);
    const el = getByTestId('target');
    fireEvent.pointerDown(el, { pointerId: 1, clientX: 50, clientY: 50 });
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 80, clientY: 80 });
    vi.advanceTimersByTime(500);
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('suppresses onClick if onLongPress already fired during the same gesture cycle', () => {
    const onClick = vi.fn();
    const onLongPress = vi.fn();
    const { getByTestId } = render(<Target onClick={onClick} onLongPress={onLongPress} longPressMs={500} />);
    const el = getByTestId('target');
    fireEvent.pointerDown(el, { pointerId: 1, clientX: 50, clientY: 50 });
    vi.advanceTimersByTime(500);  // long-press fires
    fireEvent.pointerUp(el,   { pointerId: 1, clientX: 51, clientY: 50 });  // release with no motion
    expect(onLongPress).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('still fires onClick on a quick tap when onLongPress is also bound', () => {
    const onClick = vi.fn();
    const onLongPress = vi.fn();
    const { getByTestId } = render(<Target onClick={onClick} onLongPress={onLongPress} longPressMs={500} />);
    const el = getByTestId('target');
    fireEvent.pointerDown(el, { pointerId: 1, clientX: 50, clientY: 50 });
    fireEvent.pointerUp(el,   { pointerId: 1, clientX: 52, clientY: 51 });  // release before timer
    expect(onLongPress).not.toHaveBeenCalled();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('treats below-threshold drag as a click, not a swipe', () => {
    const onClick = vi.fn();
    const onSwipe = vi.fn();
    const { getByTestId } = render(<Target onClick={onClick} onSwipe={onSwipe} />);
    const el = getByTestId('target');
    fireEvent.pointerDown(el, { pointerId: 1, clientX: 50, clientY: 50 });
    fireEvent.pointerUp(el,   { pointerId: 1, clientX: 65, clientY: 55 });
    expect(onSwipe).not.toHaveBeenCalled();
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
