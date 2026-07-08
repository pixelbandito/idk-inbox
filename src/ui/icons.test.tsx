import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Icon } from './icons';

describe('Icon', () => {
  it('renders an svg for each known name', () => {
    for (const name of ['archive', 'trash', 'clock', 'tag'] as const) {
      const { container } = render(<Icon name={name} />);
      expect(container.querySelector('svg')).toBeTruthy();
    }
  });
  it('marks itself decorative for screen readers', () => {
    const { container } = render(<Icon name="archive" />);
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });
});
