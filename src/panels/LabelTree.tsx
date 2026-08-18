import { useState, type CSSProperties } from 'react';
import type { LabelNode } from '../lib/gmail/labelTree';

export interface LabelTreeProps {
  nodes: LabelNode[];
  onOpen: (labelName: string) => void;
}

/** Collapsible view of the label hierarchy; parents toggle, leaves open a list. */
export function LabelTree({ nodes, onOpen }: LabelTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const toggle = (path: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  return (
    <ul className="label-tree" role="tree">
      {nodes.map((node) => (
        <LabelBranch
          key={node.path}
          node={node}
          depth={0}
          expanded={expanded}
          onToggle={toggle}
          onOpen={onOpen}
        />
      ))}
    </ul>
  );
}

interface BranchProps {
  node: LabelNode;
  depth: number;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  onOpen: (labelName: string) => void;
}

function LabelBranch({ node, depth, expanded, onToggle, onOpen }: BranchProps) {
  const hasChildren = node.children.length > 0;
  const isOpen = expanded.has(node.path);
  const indent = { '--depth': depth } as CSSProperties;

  return (
    <li role="treeitem" aria-expanded={hasChildren ? isOpen : undefined}>
      <div className="label-tree__row" style={indent}>
        <button
          className="label-tree__twist"
          aria-label={isOpen ? `Collapse ${node.segment}` : `Expand ${node.segment}`}
          onClick={() => onToggle(node.path)}
          // Keep the column aligned even for leaves, but leaves have nothing to toggle.
          disabled={!hasChildren}
          data-empty={hasChildren ? undefined : 'true'}
        >
          {hasChildren ? (isOpen ? '▾' : '▸') : ''}
        </button>
        {node.labelName ? (
          <button className="label-tree__name" onClick={() => onOpen(node.labelName!)}>
            {node.segment}
          </button>
        ) : (
          // A synthetic parent has no list of its own — clicking the name toggles.
          <button
            className="label-tree__name label-tree__name--parent"
            onClick={() => onToggle(node.path)}
          >
            {node.segment}
          </button>
        )}
      </div>
      {hasChildren && isOpen && (
        <ul className="label-tree__children" role="group">
          {node.children.map((child) => (
            <LabelBranch
              key={child.path}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
              onOpen={onOpen}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
