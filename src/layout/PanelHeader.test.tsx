import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PanelHeader } from './PanelHeader';
import { DispatchProvider } from '../state/DispatchProvider';
import type { Panel } from './types';

const initialPanels: Panel[] = [
  { kind: 'settings' },
  { kind: 'threadlist', label: 'INBOX' },
  { kind: 'threadlist', label: 'idk-inbox/Snoozed' },
];

describe('PanelHeader', () => {
  it('renders the title', () => {
    render(
      <DispatchProvider initialPanels={initialPanels}>
        <PanelHeader title="Inbox" />
      </DispatchProvider>,
    );
    expect(screen.getByRole('heading', { name: 'Inbox' })).toBeInTheDocument();
  });

  it('renders actions when provided', () => {
    render(
      <DispatchProvider initialPanels={initialPanels}>
        <PanelHeader title="Inbox" actions={<button>Refresh</button>} />
      </DispatchProvider>,
    );
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
  });

  // Note: integration of swipe -> focus change via the binding system is
  // covered by the useGestureBindings tests and higher-level layout tests.
});
