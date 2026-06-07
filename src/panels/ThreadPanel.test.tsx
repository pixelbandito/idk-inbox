import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { ThreadPanel } from './ThreadPanel';
import { DispatchProvider } from '../state/DispatchProvider';
import type { Panel } from '../layout/types';

vi.mock('../lib/gmail/fetchThread', () => ({
  fetchThread: vi.fn(),
}));
import { fetchThread } from '../lib/gmail/fetchThread';

const view = {
  id: 't1',
  subject: 'Hello',
  messages: [
    { id: 'm1', from: 'Alice', to: 'Bob', date: 'Fri', body: 'hi there' },
    { id: 'm2', from: 'Bob', to: 'Alice', date: 'Fri', body: 'hey back' },
  ],
};

const initialPanels: Panel[] = [
  { kind: 'settings' },
  { kind: 'threadlist', label: 'INBOX' },
  { kind: 'thread', threadId: 't1', sourceLabel: 'INBOX' },
];

function renderWithProvider(ui: ReactNode) {
  return render(<DispatchProvider initialPanels={initialPanels}>{ui}</DispatchProvider>);
}

describe('ThreadPanel', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the subject as the header title and each message body', async () => {
    (fetchThread as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(view);
    renderWithProvider(
      <ThreadPanel threadId="t1" panelIndex={2} getToken={() => 'tok'} onClose={vi.fn()} />,
    );
    await waitFor(() => screen.getByText('hi there'));
    expect(screen.getByRole('heading', { name: 'Hello' })).toBeInTheDocument();
    expect(screen.getByText('hey back')).toBeInTheDocument();
  });

  it('calls onClose when the close button is clicked', async () => {
    (fetchThread as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(view);
    const close = vi.fn();
    renderWithProvider(<ThreadPanel threadId="t1" panelIndex={2} getToken={() => 'tok'} onClose={close} />);
    await waitFor(() => screen.getByText('hi there'));
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('shows an error message when fetch fails', async () => {
    (fetchThread as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Boom'));
    renderWithProvider(<ThreadPanel threadId="t1" panelIndex={2} getToken={() => 'tok'} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/boom/i)).toBeInTheDocument());
  });
});
