import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { SnoozePicker } from './SnoozePicker';
import { DispatchProvider } from '../state/DispatchProvider';
import { useDispatchContext, useDispatcher } from '../state/useDispatch';
import { spyThreadWriteClient } from '../test/spyThreadWriteClient';

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
  beforeEach(() => vi.restoreAllMocks());

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

  it('cancel button closes the picker without dispatching snooze-thread', async () => {
    const { modifyThreadLabels } = renderWithPicker(['t1']);
    await act(async () => { fireEvent.click(screen.getByTestId('open-snooze')); });
    expect(screen.getByText(/snooze until/i)).toBeInTheDocument();

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /cancel/i })); });
    await waitFor(() => expect(screen.queryByText(/snooze until/i)).toBeNull());
    expect(modifyThreadLabels).not.toHaveBeenCalled();
  });
});
