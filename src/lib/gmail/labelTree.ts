import type { UserLabel } from './fetchLabels';
import { displayNameOf } from './labelDisplay';

/** One node in the label hierarchy, keyed by its slash-separated display path. */
export interface LabelNode {
  /** The final path segment shown on the row, e.g. "Projects". */
  segment: string;
  /** Full display path, unique per node, e.g. "Work/Projects". */
  path: string;
  /** Gmail label name to open; absent for a synthetic parent with no own label. */
  labelName?: string;
  children: LabelNode[];
}

/**
 * Turn the flat label list into a tree along Gmail's "/" nesting, using each
 * label's DISPLAY name — so the app's own tags (idk-inbox/Todo → "Todo") sit at
 * the top level while genuine user hierarchies (Work/Projects) nest.
 * Intermediate paths with no label of their own become synthetic parents.
 */
export function buildLabelTree(labels: UserLabel[]): LabelNode[] {
  const roots: LabelNode[] = [];
  const byPath = new Map<string, LabelNode>();

  const ensure = (segments: string[]): LabelNode => {
    const path = segments.join('/');
    const existing = byPath.get(path);
    if (existing) return existing;
    const node: LabelNode = { segment: segments[segments.length - 1], path, children: [] };
    byPath.set(path, node);
    if (segments.length === 1) roots.push(node);
    else ensure(segments.slice(0, -1)).children.push(node);
    return node;
  };

  for (const label of labels) {
    ensure(displayNameOf(label.name).split('/')).labelName = label.name;
  }
  sortNodes(roots);
  return roots;
}

function sortNodes(nodes: LabelNode[]): void {
  nodes.sort((a, b) => a.segment.localeCompare(b.segment));
  nodes.forEach((n) => sortNodes(n.children));
}
