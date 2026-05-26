import { useEffect, useRef, type ReactNode } from 'react';
import type { Panel } from './types';
import { useLayoutState } from '../state/useDispatch';

export interface PanelRenderProps {
  onOpenThread: (sourceLabel: string, threadId: string) => void;
  onClose: () => void;
}

export interface LayoutContainerProps {
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

const noop = () => {};

export function LayoutContainer({ renderPanel }: LayoutContainerProps) {
  const { panels, focusIndex } = useLayoutState();
  const containerRef = useRef<HTMLElement>(null);

  // Smooth-scroll the focused panel into view when focusIndex changes.
  useEffect(() => {
    const el = containerRef.current?.children[focusIndex];
    if (el && el instanceof HTMLElement) {
      el.scrollIntoView({ inline: 'start', behavior: 'smooth' });
    }
  }, [focusIndex]);

  return (
    <main ref={containerRef} className="panels" role="region" aria-label="Workspace">
      {panels.map((panel, i) => (
        <section
          key={panelKey(panel, i)}
          className="panel"
          {...dataAttrs(panel)}
        >
          {renderPanel(panel, i, {
            onOpenThread: noop,
            onClose: noop,
          })}
        </section>
      ))}
    </main>
  );
}
