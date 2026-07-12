import { describe, it, expect } from 'vitest';
import { act, fireEvent, render } from '@testing-library/react';
import { LayoutContainer, type PanelRenderProps } from './LayoutContainer';
import { DispatchProvider } from '../state/DispatchProvider';
import type { Panel } from './types';

function stubRender(panel: Panel, _i: number, props: PanelRenderProps) {
  if (panel.kind === 'settings') return <div data-testid="p-settings">settings</div>;
  if (panel.kind === 'labels') return <div data-testid="p-labels">labels</div>;
  if (panel.kind === 'threadlist') return <div data-testid={`p-threadlist-${panel.label}`}>list {panel.label}</div>;
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
    const sections = container.querySelectorAll('main.panels > section.panel');
    expect(sections).toHaveLength(2);
    expect(queryByTestId('p-thread-t-42')).toBeNull();
  });
});
