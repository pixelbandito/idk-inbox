import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DispatchProvider } from './DispatchProvider';
import { useDispatchContext, useLayoutState } from './useDispatch';

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
