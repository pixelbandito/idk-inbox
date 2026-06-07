import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { LabelPicker } from './LabelPicker';
import { DispatchProvider } from '../state/DispatchProvider';
import { useDispatchContext, useDispatcher } from '../state/useDispatch';

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
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  it('is not visible by default', () => {
    render(<DispatchProvider signedIn><LabelPicker /></DispatchProvider>);
    expect(screen.queryByText(/apply label/i)).toBeNull();
  });

  it('opens when add-label-thread is dispatched without label, applying a suggested label dispatches with label set', async () => {
    render(
      <DispatchProvider signedIn initialPanels={[{kind:'settings'},{kind:'threadlist',label:'INBOX'}]}>
        <OpenLabelButton action="add-label-thread" targets={['t1']} />
        <LabelPicker />
      </DispatchProvider>,
    );
    await act(async () => { fireEvent.click(screen.getByTestId('open')); });
    expect(screen.getByText(/apply label/i)).toBeInTheDocument();

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /receipts/i })); });

    expect(console.info).toHaveBeenCalledWith(
      '[stub:add-label-thread]',
      expect.objectContaining({ targets: ['t1'], label: 'idk-inbox/Receipts' }),
    );
    await waitFor(() => expect(screen.queryByText(/apply label/i)).toBeNull());
  });

  it('typing a custom name and submitting prefixes idk-inbox/ if missing', async () => {
    render(
      <DispatchProvider signedIn initialPanels={[{kind:'settings'},{kind:'threadlist',label:'INBOX'}]}>
        <OpenLabelButton action="add-label-thread" targets={['t1']} />
        <LabelPicker />
      </DispatchProvider>,
    );
    await act(async () => { fireEvent.click(screen.getByTestId('open')); });
    const input = screen.getByLabelText(/label name/i) as HTMLInputElement;
    await act(async () => { fireEvent.change(input, { target: { value: 'CustomLabel' } }); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^apply$/i })); });

    expect(console.info).toHaveBeenCalledWith(
      '[stub:add-label-thread]',
      expect.objectContaining({ label: 'idk-inbox/CustomLabel' }),
    );
  });

  it('also handles remove-label-thread', async () => {
    render(
      <DispatchProvider signedIn initialPanels={[{kind:'settings'},{kind:'threadlist',label:'INBOX'}]}>
        <OpenLabelButton action="remove-label-thread" targets={['t2']} />
        <LabelPicker />
      </DispatchProvider>,
    );
    await act(async () => { fireEvent.click(screen.getByTestId('open')); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /todo/i })); });

    expect(console.info).toHaveBeenCalledWith(
      '[stub:remove-label-thread]',
      expect.objectContaining({ targets: ['t2'], label: 'idk-inbox/Todo' }),
    );
  });

  it('Cancel dismisses without dispatching', async () => {
    render(
      <DispatchProvider signedIn initialPanels={[{kind:'settings'},{kind:'threadlist',label:'INBOX'}]}>
        <OpenLabelButton action="add-label-thread" targets={['t1']} />
        <LabelPicker />
      </DispatchProvider>,
    );
    await act(async () => { fireEvent.click(screen.getByTestId('open')); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /cancel/i })); });
    await waitFor(() => expect(screen.queryByText(/apply label/i)).toBeNull());
    expect(console.info).not.toHaveBeenCalledWith('[stub:add-label-thread]', expect.any(Object));
  });
});
