import { useEffect, useRef, type ReactNode } from 'react';
import type { Panel } from './types';
import { useDispatchContext, useDispatcher, useLayoutState } from '../state/useDispatch';
import { StashColumn } from './StashColumn';

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
  const ctx = useDispatchContext();
  const dispatch = useDispatcher();
  const containerRef = useRef<HTMLElement>(null);

  // Smooth-scroll the focused panel into view when focusIndex changes.
  useEffect(() => {
    // The focused panel section is at index focusIndex + 1 since the
    // first child is the left stash column placeholder. But the stash
    // column null-renders when count is 0, so we look up via querySelector.
    const sections = containerRef.current?.querySelectorAll('section.panel');
    const el = sections?.[focusIndex];
    if (el && el instanceof HTMLElement) {
      el.scrollIntoView({ inline: 'start', behavior: 'smooth' });
    }
  }, [focusIndex]);

  const stashedLeft  = focusIndex;
  const stashedRight = Math.max(0, panels.length - focusIndex - 1);

  return (
    <main ref={containerRef} className="panels" role="region" aria-label="Workspace">
      <StashColumn
        side="left"
        count={stashedLeft}
        onActivate={() => {
          void dispatch({ action: 'nav-panel-prev', args: {}, context: ctx });
        }}
      />
      {panels.map((panel, i) => (
        <section
          key={panelKey(panel, i)}
          className="panel"
          {...dataAttrs(panel)}
        >
          {renderPanel(panel, i, {
            onOpenThread: noop,
            onClose: () => {
              void dispatch({ action: 'close-panel', args: { panelIndex: i }, context: ctx });
            },
          })}
        </section>
      ))}
      <StashColumn
        side="right"
        count={stashedRight}
        onActivate={() => {
          void dispatch({ action: 'nav-panel-next', args: {}, context: ctx });
        }}
      />
    </main>
  );
}
