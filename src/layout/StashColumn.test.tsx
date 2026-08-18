import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StashColumn } from './StashColumn';

describe('StashColumn', () => {
  it('does not render when count is zero', () => {
    const { container } = render(<StashColumn side="left" count={0} revealed={false} onActivate={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the count badge for a positive count', () => {
    render(<StashColumn side="right" count={3} revealed onActivate={vi.fn()} />);
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('calls onActivate when clicked', () => {
    const activate = vi.fn();
    render(<StashColumn side="left" count={2} revealed={false} onActivate={activate} />);
    fireEvent.click(screen.getByRole('button'));
    expect(activate).toHaveBeenCalledTimes(1);
  });
});
