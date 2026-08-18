import { describe, it, expect, vi } from 'vitest';
import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { LayoutContainer, type PanelRenderProps } from './LayoutContainer';
import { DispatchProvider } from '../state/DispatchProvider';
import { useDispatchContext, useDispatcher } from '../state/useDispatch';
import type { Panel } from './types';

function OpenThreadButton() {
  const dispatch = useDispatcher();
  const ctx = useDispatchContext();
  return (
    <button
      data-testid="open"
      onClick={() =>
        void dispatch({
          action: 'open-panel',
          args: { kind: 'thread', threadId: 't-new' },
          context: ctx,
        })
      }
    >
      open
    </button>
  );
}

function stubRender(panel: Panel, _i: number, props: PanelRenderProps) {
  if (panel.kind === 'settings') return <div data-testid="p-settings">settings</div>;
  if (panel.kind === 'labels') return <div data-testid="p-labels">labels</div>;
  if (panel.kind === 'threadlist') return <div data-testid={`p-threadlist-${panel.label}`}>list {panel.label}</div>;
  if (panel.kind === 'automations') return <div data-testid="p-automations">automations</div>;
  return (
    <div data-testid={`p-thread-${panel.threadId}`}>
      thread {panel.threadId}
      <button aria-label="Close thread" onClick={props.onClose}>×</button>
    </div>
  );
}

const initial: Panel[] = [
  { kind: 'settings' },
  { kind: 'threadlist', label: 'INBOX' },
  { kind: 'threadlist', label: 'idk-inbox/Snoozed' },
];

describe('LayoutContainer', () => {
  it('renders one section per panel in order', () => {
    const { container } = render(
      <DispatchProvider initialPanels={initial}>
        <LayoutContainer renderPanel={stubRender} />
      </DispatchProvider>,
    );
    const sections = container.querySelectorAll('main.panels > section.panel');
    expect(sections).toHaveLength(3);
    expect(sections[0].getAttribute('data-kind')).toBe('settings');
    expect(sections[1].getAttribute('data-kind')).toBe('threadlist');
    expect(sections[1].getAttribute('data-label')).toBe('INBOX');
    expect(sections[2].getAttribute('data-label')).toBe('idk-inbox/Snoozed');
  });

  it('scrolls the focused panel into view instantly, not smoothly', () => {
    // Smooth programmatic scrolls get pinned by the scroller's
    // `scroll-snap-stop: always`, leaving the focused panel just off-screen —
    // the regression that broke opening a thread. Instant snaps straight to it.
    const spy = vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(() => {});
    render(
      <DispatchProvider initialPanels={initial}>
        <LayoutContainer renderPanel={stubRender} />
      </DispatchProvider>,
    );
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ inline: 'start', behavior: 'instant' }),
    );
    spy.mockRestore();
  });

  it('marks the focused panel active and activates a panel on pointer-down', async () => {
    const { container } = render(
      <DispatchProvider initialPanels={initial}>
        <LayoutContainer renderPanel={stubRender} />
      </DispatchProvider>,
    );
    const sections = container.querySelectorAll('main.panels > section.panel');
    // Default focus is the first non-settings panel (INBOX, index 1).
    expect(sections[1].getAttribute('data-active')).toBe('true');
    expect(sections[2].getAttribute('data-active')).toBeNull();

    await act(async () => { fireEvent.pointerDown(sections[2]); });
    expect(sections[2].getAttribute('data-active')).toBe('true');
    expect(sections[1].getAttribute('data-active')).toBeNull();
  });

  it('gives a freshly-opened panel the enter animation but not the initial ones', async () => {
    const { container, getByTestId } = render(
      <DispatchProvider initialPanels={initial}>
        <LayoutContainer renderPanel={stubRender} />
        <OpenThreadButton />
      </DispatchProvider>,
    );
    // Nothing animates on the initial mount.
    expect(container.querySelectorAll('section.panel--enter')).toHaveLength(0);

    await act(async () => { fireEvent.click(getByTestId('open')); });

    const entering = container.querySelectorAll('section.panel--enter');
    expect(entering).toHaveLength(1);
    expect(entering[0].getAttribute('data-thread-id')).toBe('t-new');
  });

  it('removes the panel when its onClose prop is invoked (close-panel dispatch)', async () => {
    const panels: Panel[] = [
      { kind: 'settings' },
      { kind: 'threadlist', label: 'INBOX' },
      { kind: 'thread', threadId: 't-42', sourceLabel: 'INBOX' },
    ];
    const { container, getByLabelText, queryByTestId } = render(
      <DispatchProvider initialPanels={panels}>
        <LayoutContainer renderPanel={stubRender} />
      </DispatchProvider>,
    );
    expect(queryByTestId('p-thread-t-42')).not.toBeNull();
    await act(async () => {
      fireEvent.click(getByLabelText('Close thread'));
    });
    // The panel plays its exit animation before the close-panel dispatch lands.
    await waitFor(() => {
      const sections = container.querySelectorAll('main.panels > section.panel');
      expect(sections).toHaveLength(2);
    });
    expect(queryByTestId('p-thread-t-42')).toBeNull();
  });
});
