import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { LabelPicker } from './LabelPicker';
import { DispatchProvider } from '../state/DispatchProvider';
import { useDispatchContext, useDispatcher } from '../state/useDispatch';
import { spyThreadWriteClient } from '../test/spyThreadWriteClient';

vi.mock('../lib/gmail/fetchLabels', () => ({
  fetchUserLabels: vi.fn(),
}));
import { fetchUserLabels } from '../lib/gmail/fetchLabels';

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

  it('removes a typed non-app label verbatim (no idk-inbox/ prefix on remove)', async () => {
    const { modifyThreadLabels } = renderWithPicker('remove-label-thread', ['t2']);
    await act(async () => { fireEvent.click(screen.getByTestId('open')); });
    const input = screen.getByLabelText(/label name/i) as HTMLInputElement;
    await act(async () => { fireEvent.change(input, { target: { value: 'Work' } }); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^remove$/i })); });

    expect(modifyThreadLabels).toHaveBeenCalledWith('tok', ['t2'], {
      add: [], remove: ['Work'],
    });
  });

  it('suggests the user\'s real labels when given a token accessor', async () => {
    (fetchUserLabels as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'L1', name: 'idk-inbox/Trips' },
      { id: 'L2', name: 'Work' },
    ]);
    const { client, modifyThreadLabels } = spyThreadWriteClient();
    render(
      <DispatchProvider
        signedIn
        initialPanels={[{ kind: 'settings' }, { kind: 'threadlist', label: 'INBOX' }]}
        getToken={() => 'tok'}
        threadWriteClient={client}
      >
        <OpenLabelButton action="add-label-thread" targets={['t1']} />
        <LabelPicker getToken={() => 'tok'} />
      </DispatchProvider>,
    );
    await act(async () => { fireEvent.click(screen.getByTestId('open')); });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Trips' })).toBeInTheDocument());
    // Static fallbacks give way to the real list.
    expect(screen.queryByRole('button', { name: /receipts/i })).toBeNull();

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Trips' })); });
    expect(modifyThreadLabels).toHaveBeenCalledWith('tok', ['t1'], {
      add: ['idk-inbox/Trips'], remove: [],
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
