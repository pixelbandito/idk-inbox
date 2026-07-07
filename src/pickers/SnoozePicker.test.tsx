import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { SnoozePicker } from './SnoozePicker';
import { DispatchProvider } from '../state/DispatchProvider';
import { useDispatchContext, useDispatcher } from '../state/useDispatch';
import { spyThreadWriteClient } from '../test/spyThreadWriteClient';
import { cacheThreadSummaries, resetThreadSummaryCache } from '../state/threadSummaryCache';

function OpenSnoozeButton({ targets }: { targets: string[] }) {
  const ctx = useDispatchContext();
  const dispatch = useDispatcher();
  return (
    <button data-testid="open-snooze" onClick={() => {
      void dispatch({ action: 'snooze-thread', args: { targets }, context: ctx });
    }}>open</button>
  );
}

describe('SnoozePicker', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetThreadSummaryCache();
  });

  function renderWithPicker(targets: string[]) {
    const { client, modifyThreadLabels } = spyThreadWriteClient();
    render(
      <DispatchProvider
        signedIn
        initialPanels={[{ kind: 'settings' }, { kind: 'threadlist', label: 'INBOX' }]}
        getToken={() => 'tok'}
        threadWriteClient={client}
      >
        <OpenSnoozeButton targets={targets} />
        <SnoozePicker />
      </DispatchProvider>,
    );
    return { modifyThreadLabels };
  }

  it('is not visible by default', () => {
    render(<DispatchProvider signedIn><SnoozePicker /></DispatchProvider>);
    expect(screen.queryByText(/snooze until/i)).toBeNull();
  });

  it('opens when snooze-thread is dispatched without until, then snooze-thread fires with the until filled in', async () => {
    const { modifyThreadLabels } = renderWithPicker(['t1']);
    await act(async () => { fireEvent.click(screen.getByTestId('open-snooze')); });
    expect(screen.getByText(/snooze until/i)).toBeInTheDocument();

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /tomorrow/i })); });

    // The write applies the snooze pair (parent + wake bucket) and leaves the inbox.
    expect(modifyThreadLabels).toHaveBeenCalledWith('tok', ['t1'], {
      add: [
        'idk-inbox/Snoozed',
        expect.stringMatching(/^idk-inbox\/Snoozed\/\d{4}-\d{2}-\d{2}-\d{4}$/),
      ],
      remove: ['INBOX'],
    });

    // After picking, the picker closes (mode returns to idle).
    await waitFor(() => expect(screen.queryByText(/snooze until/i)).toBeNull());
  });

  it('a custom date/time snoozes to that exact bucket', async () => {
    const { modifyThreadLabels } = renderWithPicker(['t1']);
    await act(async () => { fireEvent.click(screen.getByTestId('open-snooze')); });

    const input = screen.getByLabelText(/pick a date/i) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { value: '2099-03-05T08:30' } });
    });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^snooze until/i })); });

    const expectedBucket =
      'idk-inbox/Snoozed/' +
      new Date('2099-03-05T08:30').toISOString().slice(0, 10) +
      '-' +
      new Date('2099-03-05T08:30').toISOString().slice(11, 16).replace(':', '');
    expect(modifyThreadLabels).toHaveBeenCalledWith('tok', ['t1'], {
      add: ['idk-inbox/Snoozed', expectedBucket],
      remove: ['INBOX'],
    });
    await waitFor(() => expect(screen.queryByText(/snooze until/i)).toBeNull());
  });

  it('the custom snooze button stays disabled until a date is chosen', async () => {
    const { modifyThreadLabels } = renderWithPicker(['t1']);
    await act(async () => { fireEvent.click(screen.getByTestId('open-snooze')); });

    const submit = screen.getByRole('button', { name: /^snooze$/i });
    expect(submit).toBeDisabled();
    await act(async () => { fireEvent.click(submit); });
    expect(modifyThreadLabels).not.toHaveBeenCalled();
  });

  it('offers event-relative options when the target thread mentions a date', async () => {
    cacheThreadSummaries([{
      id: 'm1', threadId: 't1', from: 'venue@example.com',
      subject: 'Tickets for 2099-03-05', snippet: 'doors at 7', date: '', unread: true,
    }]);
    const { modifyThreadLabels } = renderWithPicker(['t1']);
    await act(async () => { fireEvent.click(screen.getByTestId('open-snooze')); });

    const resolved = new Date(2099, 2, 5).toLocaleDateString(undefined, {
      weekday: 'short', month: 'short', day: 'numeric',
    });
    const morningOf = await screen.findByRole('button', { name: `Morning of ${resolved}` });
    expect(screen.getByRole('button', { name: `Evening before ${resolved}` })).toBeInTheDocument();

    await act(async () => { fireEvent.click(morningOf); });
    const expectedUntil = new Date(2099, 2, 5, 8, 0); // local morning-of
    const iso = expectedUntil.toISOString();
    const bucket = `idk-inbox/Snoozed/${iso.slice(0, 10)}-${iso.slice(11, 13)}${iso.slice(14, 16)}`;
    expect(modifyThreadLabels).toHaveBeenCalledWith('tok', ['t1'], {
      add: ['idk-inbox/Snoozed', bucket],
      remove: ['INBOX'],
    });
  });

  it('shows no event options for multi-target snoozes or dateless threads', async () => {
    cacheThreadSummaries([{
      id: 'm1', threadId: 't1', from: 'a@b.c',
      subject: 'no dates here', snippet: '', date: '', unread: false,
    }]);
    renderWithPicker(['t1']);
    await act(async () => { fireEvent.click(screen.getByTestId('open-snooze')); });
    expect(screen.queryByRole('button', { name: /evening before/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /morning of/i })).toBeNull();
  });

  it('cancel button closes the picker without dispatching snooze-thread', async () => {
    const { modifyThreadLabels } = renderWithPicker(['t1']);
    await act(async () => { fireEvent.click(screen.getByTestId('open-snooze')); });
    expect(screen.getByText(/snooze until/i)).toBeInTheDocument();

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /cancel/i })); });
    await waitFor(() => expect(screen.queryByText(/snooze until/i)).toBeNull());
    expect(modifyThreadLabels).not.toHaveBeenCalled();
  });
});
