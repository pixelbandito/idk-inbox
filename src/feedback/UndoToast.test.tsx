import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { UndoToast } from './UndoToast';
import { DispatchProvider } from '../state/DispatchProvider';
import { useDispatchContext, useDispatcher } from '../state/useDispatch';

function FireArchiveButton() {
  const ctx = useDispatchContext();
  const dispatch = useDispatcher();
  return (
    <button data-testid="fire" onClick={() => {
      void dispatch({ action: 'archive-thread', args: { targets: ['t1'] }, context: ctx });
    }}>fire</button>
  );
}

describe('UndoToast', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers();
    vi.spyOn(console, 'info').mockImplementation(() => {});
  });
  afterEach(() => vi.useRealTimers());

  it('is hidden when the undo stack is empty', () => {
    render(<DispatchProvider signedIn><UndoToast /></DispatchProvider>);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('appears after a successful action with an inverse, showing the description', async () => {
    render(
      <DispatchProvider signedIn initialPanels={[{kind:'settings'},{kind:'threadlist',label:'INBOX'}]}>
        <FireArchiveButton />
        <UndoToast />
      </DispatchProvider>,
    );
    await act(async () => { fireEvent.click(screen.getByTestId('fire')); });
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText(/archived/i)).toBeInTheDocument();
  });

  it('auto-dismisses after the dismissAfterMs threshold', async () => {
    render(
      <DispatchProvider signedIn initialPanels={[{kind:'settings'},{kind:'threadlist',label:'INBOX'}]}>
        <FireArchiveButton />
        <UndoToast dismissAfterMs={1000} />
      </DispatchProvider>,
    );
    await act(async () => { fireEvent.click(screen.getByTestId('fire')); });
    expect(screen.getByRole('status')).toBeInTheDocument();
    await act(async () => { vi.advanceTimersByTime(1100); });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('clicking Undo dispatches the undo action and drains the undo stack', async () => {
    render(
      <DispatchProvider signedIn initialPanels={[{kind:'settings'},{kind:'threadlist',label:'INBOX'}]}>
        <FireArchiveButton />
        <UndoToast />
      </DispatchProvider>,
    );
    await act(async () => { fireEvent.click(screen.getByTestId('fire')); });
    expect(screen.getByRole('status')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /undo/i }));
    });
    // The undo handler re-dispatched the inverse via the INNER dispatcher,
    // so the undo stack is empty (the wrapper didn't push anything).
    // The toast is therefore gone.
    expect(screen.queryByRole('status')).toBeNull();
    // Verify the inverse stub did get logged through the inner dispatcher:
    expect(console.info).toHaveBeenCalledWith('[stub:modify-thread-labels]', expect.any(Object));
  });
});
