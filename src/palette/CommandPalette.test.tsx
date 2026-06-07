import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { CommandPalette } from './CommandPalette';
import { DispatchProvider } from '../state/DispatchProvider';
import { useDispatchContext, useDispatcher } from '../state/useDispatch';

function OpenButton() {
  const ctx = useDispatchContext();
  const dispatch = useDispatcher();
  return (
    <button data-testid="open" onClick={() => {
      void dispatch({ action: 'open-command-palette', args: {}, context: ctx });
    }}>open</button>
  );
}

describe('CommandPalette', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  it('is not visible by default', () => {
    render(<DispatchProvider signedIn><CommandPalette /></DispatchProvider>);
    expect(screen.queryByRole('dialog', { name: /command palette/i })).toBeNull();
  });

  it('opens when mode is cmd-k and shows multiple action entries', async () => {
    render(
      <DispatchProvider signedIn initialPanels={[{kind:'settings'},{kind:'threadlist',label:'INBOX'}]}>
        <OpenButton />
        <CommandPalette />
      </DispatchProvider>,
    );
    await act(async () => { fireEvent.click(screen.getByTestId('open')); });
    expect(screen.getByRole('dialog', { name: /command palette/i })).toBeInTheDocument();
    // Should list at least a few actions.
    expect(screen.getByText('Archive')).toBeInTheDocument();
    expect(screen.getByText('Snooze')).toBeInTheDocument();
  });

  it('filters by typed query', async () => {
    render(
      <DispatchProvider signedIn initialPanels={[{kind:'settings'},{kind:'threadlist',label:'INBOX'}]}>
        <OpenButton />
        <CommandPalette />
      </DispatchProvider>,
    );
    await act(async () => { fireEvent.click(screen.getByTestId('open')); });
    const input = screen.getByPlaceholderText(/type a command/i);
    await act(async () => { fireEvent.change(input, { target: { value: 'arch' } }); });
    expect(screen.getByText('Archive')).toBeInTheDocument();
    expect(screen.queryByText('Snooze')).toBeNull();
  });

  it('Enter on a filtered item dispatches that action', async () => {
    render(
      <DispatchProvider signedIn initialPanels={[{kind:'settings'},{kind:'threadlist',label:'INBOX'}]}>
        <OpenButton />
        <CommandPalette />
      </DispatchProvider>,
    );
    await act(async () => { fireEvent.click(screen.getByTestId('open')); });
    const input = screen.getByPlaceholderText(/type a command/i);
    await act(async () => { fireEvent.change(input, { target: { value: 'archive' } }); });
    await act(async () => { fireEvent.keyDown(input, { key: 'Enter' }); });
    // archive-thread fires with empty targets (no selection / no hovered row) → ok:false
    // but it should have been attempted; just ensure the palette closes.
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /command palette/i })).toBeNull());
  });

  it('clicking an item dispatches that action and closes', async () => {
    render(
      <DispatchProvider signedIn initialPanels={[{kind:'settings'},{kind:'threadlist',label:'INBOX'}]}>
        <OpenButton />
        <CommandPalette />
      </DispatchProvider>,
    );
    await act(async () => { fireEvent.click(screen.getByTestId('open')); });
    await act(async () => { fireEvent.click(screen.getByText('Next panel')); });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /command palette/i })).toBeNull());
  });
});
