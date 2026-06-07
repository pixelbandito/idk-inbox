import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { LayoutContainer } from './LayoutContainer';
import { DispatchProvider } from '../state/DispatchProvider';
import type { Panel } from './types';

function stubRender(panel: Panel) {
  if (panel.kind === 'settings') return <div data-testid="p-settings">settings</div>;
  if (panel.kind === 'threadlist') return <div data-testid={`p-threadlist-${panel.label}`}>list {panel.label}</div>;
  return <div data-testid={`p-thread-${panel.threadId}`}>thread {panel.threadId}</div>;
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
});
