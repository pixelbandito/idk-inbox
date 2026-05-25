import { describe, it, expect, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { LayoutContainer, type PanelRenderProps } from './LayoutContainer';
import type { Panel } from './types';

function stubRender(panel: Panel) {
  if (panel.kind === 'settings') return <div data-testid="p-settings">settings</div>;
  if (panel.kind === 'threadlist') return <div data-testid={`p-threadlist-${panel.label}`}>list {panel.label}</div>;
  return <div data-testid={`p-thread-${panel.threadId}`}>thread {panel.threadId}</div>;
}

const initial: Panel[] = [
  { kind: 'settings' },
  { kind: 'threadlist', label: 'INBOX' },
  { kind: 'threadlist', label: 'InboxZero/Snoozed' },
];

describe('LayoutContainer', () => {
  it('renders one section per panel in order', () => {
    const { container } = render(<LayoutContainer initialPanels={initial} renderPanel={stubRender} />);
    const sections = container.querySelectorAll('main.panels > section.panel');
    expect(sections).toHaveLength(3);
    expect(sections[0].getAttribute('data-kind')).toBe('settings');
    expect(sections[1].getAttribute('data-kind')).toBe('threadlist');
    expect(sections[1].getAttribute('data-label')).toBe('INBOX');
    expect(sections[2].getAttribute('data-label')).toBe('InboxZero/Snoozed');
  });

  it('inserts a thread panel via the onOpenThread callback', () => {
    const captured: { open?: (label: string, id: string) => void } = {};
    function captureRender(panel: Panel, _idx: number, props: PanelRenderProps) {
      if (panel.kind === 'threadlist' && panel.label === 'INBOX') {
        captured.open = props.onOpenThread;
      }
      return stubRender(panel);
    }
    render(<LayoutContainer initialPanels={initial} renderPanel={captureRender} />);
    act(() => {
      captured.open!('INBOX', 'tA');
    });

    expect(screen.getByTestId('p-thread-tA')).toBeInTheDocument();
    const sections = document.querySelectorAll('main.panels > section.panel');
    expect(sections[2].getAttribute('data-thread-id')).toBe('tA');
  });

  it('removes a thread via onClose', () => {
    let closeFn: (() => void) | undefined;
    function captureRender(panel: Panel, _idx: number, props: PanelRenderProps) {
      if (panel.kind === 'thread') closeFn = props.onClose;
      return stubRender(panel);
    }
    const withThread: Panel[] = [
      { kind: 'settings' },
      { kind: 'threadlist', label: 'INBOX' },
      { kind: 'thread', threadId: 'tA', sourceLabel: 'INBOX' },
      { kind: 'threadlist', label: 'InboxZero/Snoozed' },
    ];
    render(<LayoutContainer initialPanels={withThread} renderPanel={captureRender} />);
    expect(screen.getByTestId('p-thread-tA')).toBeInTheDocument();
    act(() => {
      closeFn!();
    });
    expect(screen.queryByTestId('p-thread-tA')).toBeNull();
  });

  it('shifts focus forward when a panel fires onSwipeLeft', () => {
    let swipeLeft: (() => void) | undefined;
    function captureRender(panel: Panel, _idx: number, props: PanelRenderProps) {
      if (panel.kind === 'threadlist' && panel.label === 'INBOX') {
        swipeLeft = props.onSwipeLeft;
      }
      return stubRender(panel);
    }
    render(<LayoutContainer initialPanels={initial} renderPanel={captureRender} />);

    // Initial focus is index 1 (the INBOX threadlist — first non-settings panel).
    // Firing onSwipeLeft from INBOX should attempt to scroll panel index 2 into view.
    const scrollMock = vi.fn();
    Element.prototype.scrollIntoView = scrollMock;
    act(() => { swipeLeft!(); });
    expect(scrollMock).toHaveBeenCalled();
  });
});
