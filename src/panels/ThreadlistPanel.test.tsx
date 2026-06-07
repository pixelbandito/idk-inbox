import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThreadlistPanel } from './ThreadlistPanel';
import { DispatchProvider } from '../state/DispatchProvider';
import { LayoutContainer } from '../layout/LayoutContainer';
import type { EmailSummary } from '../lib/gmail/types';
import type { Panel } from '../layout/types';

vi.mock('../lib/gmail/fetchByLabel', () => ({
  fetchByLabel: vi.fn(),
}));
import { fetchByLabel } from '../lib/gmail/fetchByLabel';

const emails: EmailSummary[] = [
  { id: 'm1', threadId: 't1', from: 'Alice', subject: 'Lunch?', snippet: 'hey', date: '', unread: true },
  { id: 'm2', threadId: 't2', from: 'Bob', subject: 'Report', snippet: 'done', date: '', unread: false },
];

const initialPanels: Panel[] = [
  { kind: 'settings' },
  { kind: 'threadlist', label: 'INBOX' },
];

describe('ThreadlistPanel', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows a sign-in prompt when no token is available', () => {
    render(
      <DispatchProvider initialPanels={initialPanels}>
        <ThreadlistPanel label="INBOX" displayName="Inbox" getToken={() => null} />
      </DispatchProvider>,
    );
    expect(screen.getByText(/sign in/i)).toBeInTheDocument();
  });

  it('fetches and renders rows on mount when a token is available', async () => {
    (fetchByLabel as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ emails, failed: 0 });
    render(
      <DispatchProvider signedIn initialPanels={initialPanels}>
        <ThreadlistPanel label="INBOX" displayName="Inbox" getToken={() => 'tok'} />
      </DispatchProvider>,
    );
    await waitFor(() => expect(screen.getByText('Lunch?')).toBeInTheDocument());
    expect(screen.getByText('Report')).toBeInTheDocument();
    expect(fetchByLabel).toHaveBeenCalledWith('tok', 'INBOX');
  });

  it('tapping a row dispatches open-panel (verified by panel array growing in the layout)', async () => {
    (fetchByLabel as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ emails, failed: 0 });
    render(
      <DispatchProvider signedIn initialPanels={initialPanels}>
        <LayoutContainer
          renderPanel={(panel) =>
            panel.kind === 'threadlist' ? (
              <ThreadlistPanel label={panel.label} displayName="Inbox" getToken={() => 'tok'} />
            ) : (
              <div data-testid={`panel-${panel.kind}`}>{panel.kind}</div>
            )
          }
        />
      </DispatchProvider>,
    );
    await waitFor(() => screen.getByText('Lunch?'));
    const row = screen.getByText('Lunch?').closest('li')!;
    fireEvent.pointerDown(row, { pointerId: 1, clientX: 50, clientY: 50 });
    fireEvent.pointerUp(row, { pointerId: 1, clientX: 52, clientY: 51 });
    await waitFor(() => expect(screen.getByTestId('panel-thread')).toBeInTheDocument());
  });

  it('shows the empty state when there are no emails', async () => {
    (fetchByLabel as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ emails: [], failed: 0 });
    render(
      <DispatchProvider signedIn initialPanels={initialPanels}>
        <ThreadlistPanel label="INBOX" displayName="Inbox" getToken={() => 'tok'} />
      </DispatchProvider>,
    );
    await waitFor(() => expect(screen.getByText(/no messages|inbox zero/i)).toBeInTheDocument());
  });

  it('shows the failed-count line when some messages fail to load', async () => {
    (fetchByLabel as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ emails, failed: 1 });
    render(
      <DispatchProvider signedIn initialPanels={initialPanels}>
        <ThreadlistPanel label="INBOX" displayName="Inbox" getToken={() => 'tok'} />
      </DispatchProvider>,
    );
    await waitFor(() => expect(screen.getByText(/1 message.*failed/i)).toBeInTheDocument());
  });

  it('selected rows get the email--selected class', async () => {
    (fetchByLabel as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ emails, failed: 0 });
    render(
      <DispatchProvider signedIn initialPanels={initialPanels}>
        <ThreadlistPanel label="INBOX" displayName="Inbox" getToken={() => 'tok'} />
      </DispatchProvider>,
    );
    await waitFor(() => screen.getByText('Lunch?'));
    // No selection yet → no selected rows
    expect(document.querySelectorAll('.email--selected').length).toBe(0);
  });
});
