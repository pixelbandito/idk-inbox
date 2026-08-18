import { describe, it, expect } from 'vitest';
import { buildLabelTree } from './labelTree';
import type { UserLabel } from './fetchLabels';

const label = (id: string, name: string): UserLabel => ({ id, name });

describe('buildLabelTree', () => {
  it('nests user hierarchies along "/" and keeps app tags at the top level', () => {
    const tree = buildLabelTree([
      label('1', 'Work/Projects'),
      label('2', 'Work'),
      label('3', 'idk-inbox/Todo'),
    ]);

    expect(tree.map((n) => n.segment)).toEqual(['Todo', 'Work']);
    const work = tree.find((n) => n.segment === 'Work')!;
    expect(work.labelName).toBe('Work');
    expect(work.children.map((c) => c.segment)).toEqual(['Projects']);
    expect(work.children[0].labelName).toBe('Work/Projects');
  });

  it('synthesises a parent when only the child label exists', () => {
    const tree = buildLabelTree([label('1', 'Work/Projects/Alpha')]);
    const work = tree[0];
    expect(work.segment).toBe('Work');
    expect(work.labelName).toBeUndefined(); // no "Work" label of its own
    expect(work.children[0].segment).toBe('Projects');
    expect(work.children[0].children[0].labelName).toBe('Work/Projects/Alpha');
  });

  it('sorts siblings alphabetically at every depth', () => {
    const tree = buildLabelTree([
      label('1', 'Zeta'),
      label('2', 'Alpha'),
      label('3', 'Alpha/Zed'),
      label('4', 'Alpha/Ant'),
    ]);
    expect(tree.map((n) => n.segment)).toEqual(['Alpha', 'Zeta']);
    expect(tree[0].children.map((c) => c.segment)).toEqual(['Ant', 'Zed']);
  });
});
