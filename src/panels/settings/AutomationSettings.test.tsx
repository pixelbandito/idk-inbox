import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AutomationSettings } from './AutomationSettings';
import { DispatchProvider } from '../../state/DispatchProvider';
import { useLayoutState } from '../../state/useDispatch';
import { resetLocalState } from '../../test/resetLocalState';
import { isProcessorEnabled } from '../../lib/automation/settings';
import { addAutoArchiveRule } from '../../lib/rules/autoArchive';
import type { Panel } from '../../layout/types';

const initialPanels: Panel[] = [{ kind: 'settings' }, { kind: 'threadlist', label: 'INBOX' }];

function PanelCountProbe() {
  const { panels } = useLayoutState();
  return <div data-testid="panel-count">{panels.length}</div>;
}

function renderHub() {
  render(
    <DispatchProvider signedIn initialPanels={initialPanels}>
      <AutomationSettings />
      <PanelCountProbe />
    </DispatchProvider>,
  );
}

describe('AutomationSettings', () => {
  beforeEach(() => resetLocalState());

  it('lists each processor with a plain-language summary', () => {
    renderHub();
    expect(screen.getByText('Sender fatigue')).toBeInTheDocument();
    expect(screen.getByText('Auto-archive rules')).toBeInTheDocument();
    expect(screen.getByText(/keep archiving unread/i)).toBeInTheDocument();
  });

  it('toggling a processor persists its off state', () => {
    renderHub();
    const toggle = screen.getByRole('switch', { name: /enable sender fatigue/i });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(isProcessorEnabled('sender-fatigue')).toBe(false);
  });

  it('shows an empty state when there are no auto-archive rules', () => {
    renderHub();
    expect(screen.getByText(/no rules yet/i)).toBeInTheDocument();
  });

  it('links to the actions panel with the live rule count', () => {
    addAutoArchiveRule('spam@shop.example');
    renderHub();
    const cta = screen.getByRole('button', { name: /view 1 action/i });

    fireEvent.click(cta);
    // The automations panel is appended to the workspace.
    expect(screen.getByTestId('panel-count').textContent).toBe('3');
  });
});
