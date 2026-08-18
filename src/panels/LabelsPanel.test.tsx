import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LabelsPanel } from './LabelsPanel';
import { DispatchProvider } from '../state/DispatchProvider';
import { useLayoutState } from '../state/useDispatch';
import type { Panel } from '../layout/types';

vi.mock('../lib/gmail/fetchLabels', () => ({
  fetchUserLabels: vi.fn(),
}));
import { fetchUserLabels } from '../lib/gmail/fetchLabels';

const initialPanels: Panel[] = [
  { kind: 'settings' },
  { kind: 'threadlist', label: 'INBOX' },
  { kind: 'labels' },
];

function PanelCountProbe() {
  const { panels } = useLayoutState();
  return <div data-testid="panel-count">{panels.length}</div>;
}

describe('LabelsPanel', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows a sign-in prompt when no token is available', () => {
    render(
      <DispatchProvider initialPanels={initialPanels}>
        <LabelsPanel getToken={() => null} />
      </DispatchProvider>,
    );
    expect(screen.getByText(/sign in/i)).toBeInTheDocument();
  });

  it('lists user labels by display name', async () => {
    (fetchUserLabels as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'L5', name: 'Work' },
      { id: 'L4', name: 'idk-inbox/Todo' },
    ]);
    render(
      <DispatchProvider signedIn initialPanels={initialPanels}>
        <LabelsPanel getToken={() => 'tok'} />
      </DispatchProvider>,
    );
    await waitFor(() => expect(screen.getByText('Todo')).toBeInTheDocument());
    expect(screen.getByText('Work')).toBeInTheDocument();
  });

  it('tapping a label opens its threadlist panel', async () => {
    (fetchUserLabels as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'L4', name: 'idk-inbox/Todo' },
    ]);
    render(
      <DispatchProvider signedIn initialPanels={initialPanels}>
        <LabelsPanel getToken={() => 'tok'} />
        <PanelCountProbe />
      </DispatchProvider>,
    );
    await waitFor(() => expect(screen.getByText('Todo')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Todo' }));
    await waitFor(() => expect(screen.getByTestId('panel-count').textContent).toBe('4'));
  });

  it('shows an empty state when there are no labels', async () => {
    (fetchUserLabels as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    render(
      <DispatchProvider signedIn initialPanels={initialPanels}>
        <LabelsPanel getToken={() => 'tok'} />
      </DispatchProvider>,
    );
    await waitFor(() => expect(screen.getByText(/no labels yet/i)).toBeInTheDocument());
  });

  it('surfaces fetch errors', async () => {
    (fetchUserLabels as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Gmail labels list failed: 500'));
    render(
      <DispatchProvider signedIn initialPanels={initialPanels}>
        <LabelsPanel getToken={() => 'tok'} />
      </DispatchProvider>,
    );
    await waitFor(() => expect(screen.getByText(/labels list failed/i)).toBeInTheDocument());
  });
});
