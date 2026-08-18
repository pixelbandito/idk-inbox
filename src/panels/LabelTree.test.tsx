import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LabelTree } from './LabelTree';
import { buildLabelTree } from '../lib/gmail/labelTree';

function renderTree(names: string[], onOpen = vi.fn()) {
  const nodes = buildLabelTree(names.map((name, i) => ({ id: `L${i}`, name })));
  render(<LabelTree nodes={nodes} onOpen={onOpen} />);
  return { onOpen };
}

describe('LabelTree', () => {
  it('hides children until their parent is expanded', () => {
    renderTree(['Work', 'Work/Projects']);
    expect(screen.getByRole('button', { name: 'Work' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Projects' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /expand work/i }));
    expect(screen.getByRole('button', { name: 'Projects' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /collapse work/i }));
    expect(screen.queryByRole('button', { name: 'Projects' })).toBeNull();
  });

  it('opens a leaf by its Gmail label name', () => {
    const { onOpen } = renderTree(['idk-inbox/Todo']);
    fireEvent.click(screen.getByRole('button', { name: 'Todo' }));
    expect(onOpen).toHaveBeenCalledWith('idk-inbox/Todo');
  });

  it('a synthetic parent toggles its subtree instead of opening', () => {
    const { onOpen } = renderTree(['Work/Projects/Alpha']);
    // "Work" has no label of its own; clicking its name reveals "Projects".
    fireEvent.click(screen.getByRole('button', { name: 'Work' }));
    expect(screen.getByRole('button', { name: 'Projects' })).toBeInTheDocument();
    expect(onOpen).not.toHaveBeenCalled();
  });
});
