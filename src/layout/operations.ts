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

export interface OpenThreadlistResult {
  panels: Panel[];
  focusIndex: number;
}

/**
 * Opens a threadlist for a label, or focuses the existing one — label lists
 * gather just before the labels panel so they stay near their origin.
 */
export function openThreadlist(panels: Panel[], label: string): OpenThreadlistResult {
  const existing = panels.findIndex((p) => p.kind === 'threadlist' && p.label === label);
  if (existing !== -1) return { panels, focusIndex: existing };

  const labelsPanelIndex = panels.findIndex((p) => p.kind === 'labels');
  const insertAt = labelsPanelIndex === -1 ? panels.length : labelsPanelIndex;
  const next: Panel = { kind: 'threadlist', label, closable: true };
  return {
    panels: [...panels.slice(0, insertAt), next, ...panels.slice(insertAt)],
    focusIndex: insertAt,
  };
}

export function closeAt(panels: Panel[], index: number): Panel[] {
  if (index < 0 || index >= panels.length) return panels;
  return [...panels.slice(0, index), ...panels.slice(index + 1)];
}
