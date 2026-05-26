import { describe, it, expect } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { DispatchProvider } from './DispatchProvider';
import { useDispatchContext, useDispatcher, useLayoutState, useUndoState } from './useDispatch';

function Probe() {
  const ctx = useDispatchContext();
  return (
    <>
      <div data-testid="mode">{ctx.mode}</div>
      <div data-testid="selectionCount">{ctx.selection.length}</div>
      <div data-testid="signedIn">{String(ctx.signedIn)}</div>
    </>
  );
}

describe('DispatchProvider', () => {
  it('provides initial context with mode=idle, empty selection, signedIn=false by default', () => {
    render(<DispatchProvider><Probe /></DispatchProvider>);
    expect(screen.getByTestId('mode').textContent).toBe('idle');
    expect(screen.getByTestId('selectionCount').textContent).toBe('0');
    expect(screen.getByTestId('signedIn').textContent).toBe('false');
  });

  it('honors the signedIn prop', () => {
    render(<DispatchProvider signedIn><Probe /></DispatchProvider>);
    expect(screen.getByTestId('signedIn').textContent).toBe('true');
  });

  it('throws when useDispatchContext is called outside the provider', () => {
    function Lonely() {
      useDispatchContext();
      return null;
    }
    expect(() => render(<Lonely />)).toThrow(/DispatchProvider/);
  });
});

function LayoutProbe() {
  const { panels } = useLayoutState();
  return <div data-testid="panel-count">{panels.length}</div>;
}

describe('layout state', () => {
  it('initialPanels prop populates the layout panels', () => {
    render(
      <DispatchProvider initialPanels={[{ kind: 'settings' }, { kind: 'threadlist', label: 'INBOX' }]}>
        <LayoutProbe />
      </DispatchProvider>,
    );
    expect(screen.getByTestId('panel-count').textContent).toBe('2');
  });
});

describe('dispatcher integration', () => {
  function ArchiveProbe() {
    const dispatch = useDispatcher();
    const undo = useUndoState();
    const ctx = useDispatchContext();
    return (
      <>
        <div data-testid="undo-depth">{undo.undoStack.length}</div>
        <button
          data-testid="fire"
          onClick={async () => {
            await dispatch({ action: 'archive-thread', args: { targets: ['t1'] }, context: ctx });
          }}
        >
          fire
        </button>
      </>
    );
  }

  it('dispatching archive-thread pushes an entry to the undo stack', async () => {
    render(
      <DispatchProvider signedIn>
        <ArchiveProbe />
      </DispatchProvider>,
    );
    expect(screen.getByTestId('undo-depth').textContent).toBe('0');
    await act(async () => {
      screen.getByTestId('fire').click();
    });
    await waitFor(() => expect(screen.getByTestId('undo-depth').textContent).toBe('1'));
  });

  it('unknown actions do not push to the undo stack', async () => {
    function UnknownProbe() {
      const dispatch = useDispatcher();
      const undo = useUndoState();
      const ctx = useDispatchContext();
      return (
        <>
          <div data-testid="undo-depth">{undo.undoStack.length}</div>
          <button
            data-testid="fire"
            onClick={async () => {
              await dispatch({ action: 'no-such-action', args: {}, context: ctx });
            }}
          >
            fire
          </button>
        </>
      );
    }
    render(
      <DispatchProvider signedIn>
        <UnknownProbe />
      </DispatchProvider>,
    );
    await act(async () => {
      screen.getByTestId('fire').click();
    });
    expect(screen.getByTestId('undo-depth').textContent).toBe('0');
  });
});
