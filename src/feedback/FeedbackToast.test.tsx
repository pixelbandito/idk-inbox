import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { FeedbackToast } from './FeedbackToast';
import { DispatchProvider } from '../state/DispatchProvider';
import { useDispatchContext, useDispatcher } from '../state/useDispatch';
import { spyThreadWriteClient } from '../test/spyThreadWriteClient';
import type { ThreadWriteClient } from '../lib/gmail/threadWriteClient';

function FireButton({ action, args }: { action: string; args: Record<string, unknown> }) {
  const ctx = useDispatchContext();
  const dispatch = useDispatcher();
  return (
    <button data-testid="fire" onClick={() => { void dispatch({ action, args, context: ctx }); }}>
      fire
    </button>
  );
}

const failingClient: ThreadWriteClient = {
  modifyThreadLabels: async () => { throw new Error('Gmail write failed: 401'); },
  deleteLabel: async () => {},
};

describe('FeedbackToast', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.useRealTimers());

  it('is hidden with no feedback', () => {
    render(<DispatchProvider signedIn><FeedbackToast /></DispatchProvider>);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('shows a failed write as an alert', async () => {
    render(
      <DispatchProvider signedIn getToken={() => 'tok'} threadWriteClient={failingClient}>
        <FireButton action="archive-thread" args={{ targets: ['t1'] }} />
        <FeedbackToast />
      </DispatchProvider>,
    );
    await act(async () => { fireEvent.click(screen.getByTestId('fire')); });
    expect(screen.getByRole('alert')).toHaveTextContent('Session expired — sign in again.');
  });

  it('announces undo-less outcomes like the wake sweep as status', async () => {
    // wake-snoozed with due threads: client succeeds, sweep finds one bucket.
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      const u = String(url);
      if (u.endsWith('/labels')) {
        return Promise.resolve({
          ok: true, status: 200,
          json: async () => ({ labels: [{ id: 'L1', name: 'idk-inbox/Snoozed/2000-01-01-0900' }] }),
        } as Response);
      }
      return Promise.resolve({
        ok: true, status: 200,
        json: async () => ({ threads: [{ id: 't1' }] }),
      } as Response);
    }));
    const { client } = spyThreadWriteClient();
    render(
      <DispatchProvider signedIn getToken={() => 'tok'} threadWriteClient={client}>
        <FireButton action="wake-snoozed" args={{}} />
        <FeedbackToast />
      </DispatchProvider>,
    );
    await act(async () => { fireEvent.click(screen.getByTestId('fire')); });
    expect(screen.getByRole('status')).toHaveTextContent('Woke 1 snoozed thread');
  });

  it('keeps errors until dismissed by hand (no auto-dismiss)', async () => {
    vi.useFakeTimers();
    render(
      <DispatchProvider signedIn getToken={() => 'tok'} threadWriteClient={failingClient}>
        <FireButton action="archive-thread" args={{ targets: ['t1'] }} />
        <FeedbackToast dismissAfterMs={1000} />
      </DispatchProvider>,
    );
    await act(async () => { fireEvent.click(screen.getByTestId('fire')); });
    expect(screen.getByRole('alert')).toBeInTheDocument();
    await act(async () => { vi.advanceTimersByTime(5000); });
    expect(screen.getByRole('alert')).toBeInTheDocument(); // still there
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /dismiss/i })); });
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
