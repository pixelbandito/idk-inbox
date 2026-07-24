import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { useRef } from 'react';
import { useOverscrollClose, type ClosePhase, type CloseMode } from './useOverscrollClose';

function Target(props: {
  onFire: () => void;
  onPhase?: (p: ClosePhase, m: CloseMode) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useOverscrollClose(ref, { armPx: 90, dwellMs: 450, bufferMs: 700, ...props });
  return <div ref={ref} data-testid="t"><div style={{ height: 1000 }}>content</div></div>;
}

function atBottom(el: HTMLElement) {
  Object.defineProperty(el, 'scrollTop', { configurable: true, value: 900 });
  Object.defineProperty(el, 'scrollHeight', { configurable: true, value: 1000 });
  Object.defineProperty(el, 'clientHeight', { configurable: true, value: 100 });
}

describe('useOverscrollClose', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  describe('touch: pull and hold', () => {
    it('closes only after the pull is armed AND held past the dwell, then released', () => {
      const onFire = vi.fn();
      const phases: ClosePhase[] = [];
      const { getByTestId } = render(<Target onFire={onFire} onPhase={(p) => phases.push(p)} />);
      const el = getByTestId('t');
      atBottom(el);

      fireEvent.touchStart(el, { touches: [{ clientY: 500 }] });
      fireEvent.touchMove(el, { touches: [{ clientY: 390 }] }); // 110px up → armed
      expect(phases).toContain('armed');

      vi.advanceTimersByTime(450); // hold past the dwell
      expect(phases).toContain('ready');

      fireEvent.touchEnd(el);
      expect(onFire).toHaveBeenCalledTimes(1);
    });

    it('springs back without closing if released before the dwell completes', () => {
      const onFire = vi.fn();
      const { getByTestId } = render(<Target onFire={onFire} />);
      const el = getByTestId('t');
      atBottom(el);

      fireEvent.touchStart(el, { touches: [{ clientY: 500 }] });
      fireEvent.touchMove(el, { touches: [{ clientY: 390 }] }); // armed
      vi.advanceTimersByTime(200); // let go early
      fireEvent.touchEnd(el);
      expect(onFire).not.toHaveBeenCalled();
    });

    it('does not arm on a short pull', () => {
      const onFire = vi.fn();
      const { getByTestId } = render(<Target onFire={onFire} />);
      const el = getByTestId('t');
      atBottom(el);
      fireEvent.touchStart(el, { touches: [{ clientY: 500 }] });
      fireEvent.touchMove(el, { touches: [{ clientY: 460 }] }); // only 40px
      vi.advanceTimersByTime(450);
      fireEvent.touchEnd(el);
      expect(onFire).not.toHaveBeenCalled();
    });
  });

  describe('wheel: pull, then the spring-back buffer', () => {
    it('closes when armed and the buffer elapses with no intervention', () => {
      const onFire = vi.fn();
      const { getByTestId } = render(<Target onFire={onFire} />);
      const el = getByTestId('t');
      atBottom(el);

      fireEvent.wheel(el, { deltaY: 200 }); // 120px pull → armed
      vi.advanceTimersByTime(130);          // wheel settles → buffer begins
      expect(onFire).not.toHaveBeenCalled();
      vi.advanceTimersByTime(700);          // buffer elapses → commit
      expect(onFire).toHaveBeenCalledTimes(1);
    });

    it('an active scroll-back during the buffer cancels the close', () => {
      const onFire = vi.fn();
      const { getByTestId } = render(<Target onFire={onFire} />);
      const el = getByTestId('t');
      atBottom(el);

      fireEvent.wheel(el, { deltaY: 200 });   // armed
      vi.advanceTimersByTime(130);            // buffer running
      fireEvent.wheel(el, { deltaY: -50 });   // scroll back = cancel
      vi.advanceTimersByTime(700);
      expect(onFire).not.toHaveBeenCalled();
    });

    it('pushing further during the buffer keeps it alive, then still closes', () => {
      const onFire = vi.fn();
      const { getByTestId } = render(<Target onFire={onFire} />);
      const el = getByTestId('t');
      atBottom(el);

      fireEvent.wheel(el, { deltaY: 200 });
      vi.advanceTimersByTime(130);            // buffer running
      fireEvent.wheel(el, { deltaY: 200 });   // push again → keeps alive
      vi.advanceTimersByTime(130);            // re-settle → new buffer
      vi.advanceTimersByTime(700);            // buffer elapses
      expect(onFire).toHaveBeenCalledTimes(1);
    });

    it('a gentle wheel that never arms does not close', () => {
      const onFire = vi.fn();
      const { getByTestId } = render(<Target onFire={onFire} />);
      const el = getByTestId('t');
      atBottom(el);
      fireEvent.wheel(el, { deltaY: 60 }); // 36px pull, below arm
      vi.advanceTimersByTime(130 + 700);
      expect(onFire).not.toHaveBeenCalled();
    });
  });

  it('does not engage away from the bottom edge', () => {
    const onFire = vi.fn();
    const { getByTestId } = render(<Target onFire={onFire} />);
    const el = getByTestId('t');
    Object.defineProperty(el, 'scrollTop', { configurable: true, value: 100 });
    Object.defineProperty(el, 'scrollHeight', { configurable: true, value: 1000 });
    Object.defineProperty(el, 'clientHeight', { configurable: true, value: 100 });
    fireEvent.wheel(el, { deltaY: 300 });
    vi.advanceTimersByTime(130 + 700);
    expect(onFire).not.toHaveBeenCalled();
  });
});
