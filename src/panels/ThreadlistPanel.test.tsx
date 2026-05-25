import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThreadlistPanel } from './ThreadlistPanel';
import type { EmailSummary } from '../lib/gmail/types';

vi.mock('../lib/gmail/fetchByLabel', () => ({
  fetchByLabel: vi.fn(),
}));
import { fetchByLabel } from '../lib/gmail/fetchByLabel';

const emails: EmailSummary[] = [
  { id: 'm1', threadId: 't1', from: 'Alice', subject: 'Lunch?', snippet: 'hey', date: '', unread: true },
  { id: 'm2', threadId: 't2', from: 'Bob', subject: 'Report', snippet: 'done', date: '', unread: false },
];

describe('ThreadlistPanel', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows a sign-in prompt when no token is available', () => {
    render(
      <ThreadlistPanel
        label="INBOX"
        displayName="Inbox"
        getToken={() => null}
        onOpenThread={vi.fn()}
      />,
    );
    expect(screen.getByText(/sign in/i)).toBeInTheDocument();
  });

  it('fetches and renders rows on mount when a token is available', async () => {
    (fetchByLabel as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ emails, failed: 0 });
    render(
      <ThreadlistPanel
        label="INBOX"
        displayName="Inbox"
        getToken={() => 'tok'}
        onOpenThread={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText('Lunch?')).toBeInTheDocument());
    expect(screen.getByText('Report')).toBeInTheDocument();
    expect(fetchByLabel).toHaveBeenCalledWith('tok', 'INBOX');
  });

  it('tapping a row calls onOpenThread with the source label and threadId', async () => {
    (fetchByLabel as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ emails, failed: 0 });
    const open = vi.fn();
    render(
      <ThreadlistPanel
        label="INBOX"
        displayName="Inbox"
        getToken={() => 'tok'}
        onOpenThread={open}
      />,
    );
    await waitFor(() => screen.getByText('Lunch?'));
    fireEvent.click(screen.getByText('Lunch?').closest('li')!);
    expect(open).toHaveBeenCalledWith('INBOX', 't1');
  });

  it('shows the empty state when there are no emails', async () => {
    (fetchByLabel as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ emails: [], failed: 0 });
    render(
      <ThreadlistPanel
        label="INBOX"
        displayName="Inbox"
        getToken={() => 'tok'}
        onOpenThread={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText(/no messages|inbox zero/i)).toBeInTheDocument());
  });

  it('shows the failed-count line when some messages fail to load', async () => {
    (fetchByLabel as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ emails, failed: 1 });
    render(
      <ThreadlistPanel
        label="INBOX"
        displayName="Inbox"
        getToken={() => 'tok'}
        onOpenThread={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText(/1 message.*failed/i)).toBeInTheDocument());
  });
});
