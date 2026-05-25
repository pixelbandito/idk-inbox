import type { Panel } from './types';

export function openThread(panels: Panel[], sourceLabel: string, threadId: string): Panel[] {
  const idx = panels.findIndex(
    (p) => p.kind === 'threadlist' && p.label === sourceLabel,
  );
  if (idx === -1) {
    throw new Error(`openThread: no threadlist panel with label ${sourceLabel}`);
  }
  const next: Panel = { kind: 'thread', threadId, sourceLabel };
  return [...panels.slice(0, idx + 1), next, ...panels.slice(idx + 1)];
}

export function closeAt(panels: Panel[], index: number): Panel[] {
  if (index < 0 || index >= panels.length) return panels;
  return [...panels.slice(0, index), ...panels.slice(index + 1)];
}
