import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { SnoozePicker } from './SnoozePicker';
import { DispatchProvider } from '../state/DispatchProvider';
import { useDispatchContext, useDispatcher } from '../state/useDispatch';

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
    vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  it('is not visible by default', () => {
    render(<DispatchProvider signedIn><SnoozePicker /></DispatchProvider>);
    expect(screen.queryByText(/snooze until/i)).toBeNull();
  });

  it('opens when snooze-thread is dispatched without until, then snooze-thread fires with the until filled in', async () => {
    render(
      <DispatchProvider signedIn initialPanels={[{kind:'settings'},{kind:'threadlist',label:'INBOX'}]}>
        <OpenSnoozeButton targets={['t1']} />
        <SnoozePicker />
      </DispatchProvider>,
    );
    await act(async () => { fireEvent.click(screen.getByTestId('open-snooze')); });
    expect(screen.getByText(/snooze until/i)).toBeInTheDocument();

    // Pick "Tomorrow"
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /tomorrow/i })); });

    // The stub log shows snooze-thread fired with both targets and until set.
    expect(console.info).toHaveBeenCalledWith(
      '[stub:snooze-thread]',
      expect.objectContaining({ targets: ['t1'], until: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/) }),
    );

    // After picking, the picker closes (mode returns to idle).
    await waitFor(() => expect(screen.queryByText(/snooze until/i)).toBeNull());
  });

  it('cancel button closes the picker without dispatching snooze-thread', async () => {
    render(
      <DispatchProvider signedIn initialPanels={[{kind:'settings'},{kind:'threadlist',label:'INBOX'}]}>
        <OpenSnoozeButton targets={['t1']} />
        <SnoozePicker />
      </DispatchProvider>,
    );
    await act(async () => { fireEvent.click(screen.getByTestId('open-snooze')); });
    expect(screen.getByText(/snooze until/i)).toBeInTheDocument();

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /cancel/i })); });
    await waitFor(() => expect(screen.queryByText(/snooze until/i)).toBeNull());
    expect(console.info).not.toHaveBeenCalledWith('[stub:snooze-thread]', expect.any(Object));
  });
});
