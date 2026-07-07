import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { LabelPicker } from './LabelPicker';
import { DispatchProvider } from '../state/DispatchProvider';
import { useDispatchContext, useDispatcher } from '../state/useDispatch';
import { spyThreadWriteClient } from '../test/spyThreadWriteClient';

function OpenLabelButton({ action, targets }: { action: 'add-label-thread' | 'remove-label-thread'; targets: string[] }) {
  const ctx = useDispatchContext();
  const dispatch = useDispatcher();
  return (
    <button data-testid="open" onClick={() => {
      void dispatch({ action, args: { targets }, context: ctx });
    }}>open</button>
  );
}

describe('LabelPicker', () => {
  beforeEach(() => vi.restoreAllMocks());

  function renderWithPicker(action: 'add-label-thread' | 'remove-label-thread', targets: string[]) {
    const { client, modifyThreadLabels } = spyThreadWriteClient();
    render(
      <DispatchProvider
        signedIn
        initialPanels={[{ kind: 'settings' }, { kind: 'threadlist', label: 'INBOX' }]}
        getToken={() => 'tok'}
        threadWriteClient={client}
      >
        <OpenLabelButton action={action} targets={targets} />
        <LabelPicker />
      </DispatchProvider>,
    );
    return { modifyThreadLabels };
  }

  it('is not visible by default', () => {
    render(<DispatchProvider signedIn><LabelPicker /></DispatchProvider>);
    expect(screen.queryByText(/apply label/i)).toBeNull();
  });

  it('opens when add-label-thread is dispatched without label, applying a suggested label dispatches with label set', async () => {
    const { modifyThreadLabels } = renderWithPicker('add-label-thread', ['t1']);
    await act(async () => { fireEvent.click(screen.getByTestId('open')); });
    expect(screen.getByText(/apply label/i)).toBeInTheDocument();

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /receipts/i })); });

    expect(modifyThreadLabels).toHaveBeenCalledWith('tok', ['t1'], {
      add: ['idk-inbox/Receipts'], remove: [],
    });
    await waitFor(() => expect(screen.queryByText(/apply label/i)).toBeNull());
  });

  it('typing a custom name and submitting prefixes idk-inbox/ if missing', async () => {
    const { modifyThreadLabels } = renderWithPicker('add-label-thread', ['t1']);
    await act(async () => { fireEvent.click(screen.getByTestId('open')); });
    const input = screen.getByLabelText(/label name/i) as HTMLInputElement;
    await act(async () => { fireEvent.change(input, { target: { value: 'CustomLabel' } }); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^apply$/i })); });

    expect(modifyThreadLabels).toHaveBeenCalledWith('tok', ['t1'], {
      add: ['idk-inbox/CustomLabel'], remove: [],
    });
  });

  it('also handles remove-label-thread', async () => {
    const { modifyThreadLabels } = renderWithPicker('remove-label-thread', ['t2']);
    await act(async () => { fireEvent.click(screen.getByTestId('open')); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /todo/i })); });

    expect(modifyThreadLabels).toHaveBeenCalledWith('tok', ['t2'], {
      add: [], remove: ['idk-inbox/Todo'],
    });
  });

  it('Cancel dismisses without dispatching', async () => {
    const { modifyThreadLabels } = renderWithPicker('add-label-thread', ['t1']);
    await act(async () => { fireEvent.click(screen.getByTestId('open')); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /cancel/i })); });
    await waitFor(() => expect(screen.queryByText(/apply label/i)).toBeNull());
    expect(modifyThreadLabels).not.toHaveBeenCalled();
  });
});
