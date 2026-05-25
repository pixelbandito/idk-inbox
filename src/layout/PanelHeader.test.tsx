import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PanelHeader } from './PanelHeader';

describe('PanelHeader', () => {
  it('renders the title', () => {
    render(<PanelHeader title="Inbox" onSwipeLeft={() => {}} onSwipeRight={() => {}} />);
    expect(screen.getByRole('heading', { name: 'Inbox' })).toBeInTheDocument();
  });

  it('fires onSwipeLeft when the user drags far enough leftward', () => {
    const left = vi.fn();
    const right = vi.fn();
    render(<PanelHeader title="Inbox" onSwipeLeft={left} onSwipeRight={right} />);
    const header = screen.getByRole('banner');
    fireEvent.pointerDown(header, { clientX: 300, pointerId: 1 });
    fireEvent.pointerMove(header, { clientX: 100, pointerId: 1 });
    fireEvent.pointerUp(header, { clientX: 100, pointerId: 1 });
    expect(left).toHaveBeenCalledTimes(1);
    expect(right).not.toHaveBeenCalled();
  });

  it('fires onSwipeRight when the user drags far enough rightward', () => {
    const left = vi.fn();
    const right = vi.fn();
    render(<PanelHeader title="Inbox" onSwipeLeft={left} onSwipeRight={right} />);
    const header = screen.getByRole('banner');
    fireEvent.pointerDown(header, { clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(header, { clientX: 300, pointerId: 1 });
    fireEvent.pointerUp(header, { clientX: 300, pointerId: 1 });
    expect(right).toHaveBeenCalledTimes(1);
    expect(left).not.toHaveBeenCalled();
  });

  it('does not fire when the drag is below threshold', () => {
    const left = vi.fn();
    const right = vi.fn();
    render(<PanelHeader title="Inbox" onSwipeLeft={left} onSwipeRight={right} />);
    const header = screen.getByRole('banner');
    fireEvent.pointerDown(header, { clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(header, { clientX: 130, pointerId: 1 });
    fireEvent.pointerUp(header, { clientX: 130, pointerId: 1 });
    expect(left).not.toHaveBeenCalled();
    expect(right).not.toHaveBeenCalled();
  });
});
