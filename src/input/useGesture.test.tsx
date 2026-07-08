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

  it('fires onDrag with running deltas during a drag', () => {
    const onDrag = vi.fn();
    const { getByTestId } = render(<Target onDrag={onDrag} />);
    const el = getByTestId('target');
    fireEvent.pointerDown(el, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 130, clientY: 105 });
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 160, clientY: 90 });
    expect(onDrag).toHaveBeenCalledTimes(2);
    expect(onDrag).toHaveBeenNthCalledWith(1, 30, 5);
    expect(onDrag).toHaveBeenNthCalledWith(2, 60, -10);
  });

  it('does not fire onDrag for a tap with no movement', () => {
    const onDrag = vi.fn();
    const { getByTestId } = render(<Target onDrag={onDrag} />);
    const el = getByTestId('target');
    fireEvent.pointerDown(el, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerUp(el,   { pointerId: 1, clientX: 100, clientY: 100 });
    expect(onDrag).not.toHaveBeenCalled();
  });

  it('fires onDragEnd with final deltas after a drag past the swipe threshold (onSwipe still fires)', () => {
    const onDragEnd = vi.fn();
    const onSwipe = vi.fn();
    const { getByTestId } = render(<Target onDragEnd={onDragEnd} onSwipe={onSwipe} />);
    const el = getByTestId('target');
    fireEvent.pointerDown(el, { pointerId: 1, clientX: 50, clientY: 50 });
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 130, clientY: 55 });
    fireEvent.pointerUp(el,   { pointerId: 1, clientX: 150, clientY: 55 });
    expect(onDragEnd).toHaveBeenCalledTimes(1);
    expect(onDragEnd).toHaveBeenCalledWith(100, 5, expect.any(Number));
    expect(onSwipe).toHaveBeenCalledTimes(1); // existing consumers keep their swipe
  });

  it('fires onDragEnd for an ambiguous drag between clickMax and swipeMin', () => {
    const onDragEnd = vi.fn();
    const onClick = vi.fn();
    const onSwipe = vi.fn();
    const { getByTestId } = render(
      <Target onDragEnd={onDragEnd} onClick={onClick} onSwipe={onSwipe} />,
    );
    const el = getByTestId('target');
    fireEvent.pointerDown(el, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 120, clientY: 100 });
    fireEvent.pointerUp(el,   { pointerId: 1, clientX: 130, clientY: 100 }); // dx = 30
    expect(onDragEnd).toHaveBeenCalledTimes(1);
    expect(onDragEnd).toHaveBeenCalledWith(30, 0, expect.any(Number));
    expect(onClick).not.toHaveBeenCalled();
    expect(onSwipe).not.toHaveBeenCalled();
  });

  it('does not fire onDragEnd on a motionless tap (onClick fires instead)', () => {
    const onDragEnd = vi.fn();
    const onClick = vi.fn();
    const { getByTestId } = render(<Target onDragEnd={onDragEnd} onClick={onClick} />);
    const el = getByTestId('target');
    fireEvent.pointerDown(el, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerUp(el,   { pointerId: 1, clientX: 100, clientY: 100 });
    expect(onDragEnd).not.toHaveBeenCalled();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('fires onDragEnd when a dragged gesture is cancelled', () => {
    const onDragEnd = vi.fn();
    const { getByTestId } = render(<Target onDragEnd={onDragEnd} />);
    const el = getByTestId('target');
    fireEvent.pointerDown(el,   { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(el,   { pointerId: 1, clientX: 150, clientY: 100 });
    fireEvent.pointerCancel(el, { pointerId: 1, clientX: 150, clientY: 100 });
    expect(onDragEnd).toHaveBeenCalledTimes(1);
    expect(onDragEnd).toHaveBeenCalledWith(50, 0, expect.any(Number));
  });
});
