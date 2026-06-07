import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { useDocumentKeyboard } from './useDocumentKeyboard';
import { DispatchProvider } from '../state/DispatchProvider';

function App({ children }: { children?: React.ReactNode }) {
  useDocumentKeyboard();
  return <>{children}</>;
}

function dispatchKey(init: KeyboardEventInit & { from?: Element | null }) {
  const { from, ...evtInit } = init;
  const target = from ?? document.body;
  target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...evtInit }));
}

describe('useDocumentKeyboard', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  // Step 4 Task 14 migrated every keyboard shortcut to the new pipeline;
  // useDocumentKeyboard now reads an empty bindings list and is a no-op.
  // The hook itself is scheduled for deletion in Step 5. End-to-end
  // keyboard coverage now lives in the keyboard producer tests.
  it('attaches and detaches without throwing when no keyboard bindings exist', () => {
    const { unmount } = render(
      <DispatchProvider signedIn initialPanels={[{kind:'settings'},{kind:'threadlist',label:'INBOX'}]}>
        <App />
      </DispatchProvider>,
    );
    dispatchKey({ key: 'j' });
    expect(console.info).not.toHaveBeenCalledWith('[stub:archive-thread]', expect.any(Object));
    unmount();
  });
});
