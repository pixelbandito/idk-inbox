import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Panel } from './types';
import { openThread, closeAt } from './operations';

export interface PanelRenderProps {
  onOpenThread: (sourceLabel: string, threadId: string) => void;
  onClose: () => void;
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
}

export interface LayoutContainerProps {
  initialPanels: Panel[];
  renderPanel: (panel: Panel, index: number, props: PanelRenderProps) => ReactNode;
}

function dataAttrs(panel: Panel): Record<string, string> {
  if (panel.kind === 'settings') return { 'data-kind': 'settings' };
  if (panel.kind === 'threadlist')
    return { 'data-kind': 'threadlist', 'data-label': panel.label };
  return {
    'data-kind': 'thread',
    'data-thread-id': panel.threadId,
    'data-source-label': panel.sourceLabel,
  };
}

function panelKey(panel: Panel, index: number): string {
  if (panel.kind === 'settings') return 'settings';
  if (panel.kind === 'threadlist') return `tl:${panel.label}`;
  return `th:${panel.threadId}:${index}`;
}

// Initial focus lands on the first non-settings panel if present.
function defaultFocus(panels: Panel[]): number {
  const idx = panels.findIndex((p) => p.kind !== 'settings');
  return idx === -1 ? 0 : idx;
}

export function LayoutContainer({ initialPanels, renderPanel }: LayoutContainerProps) {
  const [panels, setPanels] = useState<Panel[]>(initialPanels);
  const [focusIndex, setFocusIndex] = useState<number>(() => defaultFocus(initialPanels));
  const containerRef = useRef<HTMLElement>(null);

  // Smooth-scroll the focused panel into view when focusIndex changes.
  useEffect(() => {
    const el = containerRef.current?.children[focusIndex];
    if (el && el instanceof HTMLElement) {
      el.scrollIntoView({ inline: 'start', behavior: 'smooth' });
    }
  }, [focusIndex]);

  const handleOpenThread = useCallback((sourceLabel: string, threadId: string) => {
    setPanels((p) => {
      const next = openThread(p, sourceLabel, threadId);
      // Focus follows the newly inserted thread.
      const idx = next.findIndex(
        (panel) => panel.kind === 'thread' && panel.threadId === threadId,
      );
      if (idx !== -1) setFocusIndex(idx);
      return next;
    });
  }, []);

  const handleCloseAt = useCallback((index: number) => {
    setPanels((p) => closeAt(p, index));
    setFocusIndex((i) => Math.max(0, i > index ? i - 1 : i));
  }, []);

  // Swipe-left on a header means "move forward in the sequence" (the next
  // panel slides in from the right). Swipe-right is the inverse.
  const focusForward = useCallback(() => {
    setFocusIndex((i) => Math.min(panels.length - 1, i + 1));
  }, [panels.length]);
  const focusBackward = useCallback(() => {
    setFocusIndex((i) => Math.max(0, i - 1));
  }, []);

  return (
    <main ref={containerRef} className="panels" role="region" aria-label="Workspace">
      {panels.map((panel, i) => (
        <section
          key={panelKey(panel, i)}
          className="panel"
          {...dataAttrs(panel)}
        >
          {renderPanel(panel, i, {
            onOpenThread: handleOpenThread,
            onClose: () => handleCloseAt(i),
            onSwipeLeft: focusForward,
            onSwipeRight: focusBackward,
          })}
        </section>
      ))}
    </main>
  );
}
