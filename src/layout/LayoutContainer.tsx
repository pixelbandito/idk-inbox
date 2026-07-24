import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { Panel } from './types';
import { useDispatchContext, useDispatcher, useLayoutState } from '../state/useDispatch';
import { StashColumn } from './StashColumn';

// The slivers stay off-screen until the mouse rests near a screen edge for a
// beat, so they're a deliberate reveal rather than a permanent chrome band.
const EDGE_ZONE_PX = 48;   // ~1 HIG unit (44pt), rounded up
const LINGER_MS = 1000;
// Matches the panelExit animation in index.css; the close is dispatched only
// after the panel has finished collapsing so the exit is actually seen.
const PANEL_EXIT_MS = 260;
// How long after a programmatic scroll to ignore scroll events, so the scroll
// listener doesn't mistake our own in-flight scroll for a user snap.
const PROGRAMMATIC_SCROLL_MS = 500;

export interface PanelRenderProps {
  onOpenThread: (sourceLabel: string, threadId: string) => void;
  onClose: () => void;
}

export interface LayoutContainerProps {
  renderPanel: (panel: Panel, index: number, props: PanelRenderProps) => ReactNode;
}

function dataAttrs(panel: Panel): Record<string, string> {
  if (panel.kind === 'settings') return { 'data-kind': 'settings' };
  if (panel.kind === 'labels') return { 'data-kind': 'labels' };
  if (panel.kind === 'automations') return { 'data-kind': 'automations' };
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
  if (panel.kind === 'labels') return 'labels';
  if (panel.kind === 'automations') return 'automations';
  if (panel.kind === 'threadlist') return `tl:${panel.label}`;
  return `th:${panel.threadId}:${index}`;
}

const noop = () => {};

export function LayoutContainer({ renderPanel }: LayoutContainerProps) {
  const { panels, focusIndex, setFocusIndex } = useLayoutState();
  const ctx = useDispatchContext();
  const dispatch = useDispatcher();
  const containerRef = useRef<HTMLElement>(null);
  const focusIndexRef = useRef(focusIndex);
  useEffect(() => { focusIndexRef.current = focusIndex; }, [focusIndex]);
  // Set when a focus change came from manual scrolling, so the scroll-into-view
  // effect doesn't fight the user's own scroll.
  const scrollDrivenRef = useRef(false);
  // While we're running our own scroll-into-view, ignore the scroll events it
  // emits — otherwise the scroll listener reads a half-finished position and
  // yanks focus back, so the focused panel never actually lands.
  const programmaticUntilRef = useRef(0);

  // Give a freshly-opened panel the enter animation while the initial set (and
  // any already-present panels) mount quietly. Tracked by key against the DOM
  // so reading the ref stays out of render.
  const seenKeysRef = useRef<Set<string> | null>(null);
  useLayoutEffect(() => {
    const sections = containerRef.current?.querySelectorAll('section.panel');
    if (!sections) return;
    const previouslySeen = seenKeysRef.current;
    const keys = new Set<string>();
    sections.forEach((el) => {
      const key = el.getAttribute('data-panel-key');
      if (!key) return;
      keys.add(key);
      if (previouslySeen && !previouslySeen.has(key)) el.classList.add('panel--enter');
    });
    seenKeysRef.current = keys;
  });

  // Play the exit animation before removing the panel from state.
  const closePanel = (index: number) => {
    const el = document.querySelectorAll('main.panels > section.panel')[index];
    const remove = () =>
      void dispatch({ action: 'close-panel', args: { panelIndex: index }, context: ctx });
    if (el instanceof HTMLElement) {
      el.classList.add('panel--exit');
      setTimeout(remove, PANEL_EXIT_MS);
    } else {
      remove();
    }
  };

  // Scroll the focused panel into view when focus changes programmatically.
  useEffect(() => {
    if (scrollDrivenRef.current) { scrollDrivenRef.current = false; return; }
    const sections = containerRef.current?.querySelectorAll('section.panel');
    const el = sections?.[focusIndex];
    if (el && el instanceof HTMLElement) {
      programmaticUntilRef.current = Date.now() + PROGRAMMATIC_SCROLL_MS;
      // Instant, not smooth: under the scroller's `scroll-snap-stop: always`, a
      // smooth programmatic scroll gets pinned and never lands, so an opened
      // panel would stay just off-screen. Instant snaps straight to it.
      el.scrollIntoView({ inline: 'start', behavior: 'instant' });
    }
  }, [focusIndex]);

  // Manual sticky-scrolling between panels updates which one is "active", so the
  // edge peek counts reflect where you actually are. The active panel is the one
  // snapped to the container's start edge after the scroll settles.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onScroll = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        // Only a user's own snap should move focus; skip the scroll events our
        // own scroll-into-view emits, or it fights itself and never settles.
        if (Date.now() < programmaticUntilRef.current) return;
        const sections = container.querySelectorAll('section.panel');
        if (sections.length === 0) return;
        const start = container.getBoundingClientRect().left;
        let best = 0;
        let bestDist = Infinity;
        sections.forEach((el, i) => {
          const d = Math.abs(el.getBoundingClientRect().left - start);
          if (d < bestDist) { bestDist = d; best = i; }
        });
        if (best !== focusIndexRef.current) {
          scrollDrivenRef.current = true;
          setFocusIndex(() => best);
        }
      }, 90);
    };
    container.addEventListener('scroll', onScroll, { passive: true });
    return () => { container.removeEventListener('scroll', onScroll); if (timer) clearTimeout(timer); };
  }, [setFocusIndex]);

  const stashedLeft  = focusIndex;
  const stashedRight = Math.max(0, panels.length - focusIndex - 1);

  // Mouse-linger reveal (hover devices only; touch shows the slivers via CSS).
  const [edgeReveal, setEdgeReveal] = useState<'left' | 'right' | null>(null);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function' || !window.matchMedia('(hover: hover)').matches) return;
    let candidate: 'left' | 'right' | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onMove = (e: MouseEvent) => {
      const side = e.clientX <= EDGE_ZONE_PX ? 'left'
        : e.clientX >= window.innerWidth - EDGE_ZONE_PX ? 'right'
        : null;
      if (side === candidate) return;
      candidate = side;
      if (timer) { clearTimeout(timer); timer = null; }
      if (side) timer = setTimeout(() => setEdgeReveal(side), LINGER_MS);
      else setEdgeReveal(null);
    };
    window.addEventListener('mousemove', onMove);
    return () => { window.removeEventListener('mousemove', onMove); if (timer) clearTimeout(timer); };
  }, []);

  // Slivers live OUTSIDE the scroller as fixed edge overlays, so they stay
  // visible while the panels scroll behind them — persistent "more this way"
  // hints rather than something you only meet at the scroll extremes.
  return (
    <div className="workspace">
      <main ref={containerRef} className="panels" role="region" aria-label="Workspace">
        {panels.map((panel, i) => (
          <section
            key={panelKey(panel, i)}
            className="panel"
            data-panel-key={panelKey(panel, i)}
            data-active={i === focusIndex ? 'true' : undefined}
            // A gesture on a non-active panel makes it active (in place — no
            // scroll jump). Capture so it runs before the row's own handlers.
            onPointerDownCapture={() => {
              if (i !== focusIndexRef.current) {
                scrollDrivenRef.current = true;
                setFocusIndex(() => i);
              }
            }}
            {...dataAttrs(panel)}
          >
            {renderPanel(panel, i, {
              onOpenThread: noop,
              onClose: () => closePanel(i),
            })}
          </section>
        ))}
      </main>
      <StashColumn
        side="left"
        count={stashedLeft}
        revealed={edgeReveal === 'left'}
        onActivate={() => {
          void dispatch({ action: 'nav-panel-prev', args: {}, context: ctx });
        }}
      />
      <StashColumn
        side="right"
        count={stashedRight}
        revealed={edgeReveal === 'right'}
        onActivate={() => {
          void dispatch({ action: 'nav-panel-next', args: {}, context: ctx });
        }}
      />
    </div>
  );
}
