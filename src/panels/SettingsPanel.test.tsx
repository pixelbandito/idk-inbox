import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SettingsPanel } from './SettingsPanel';
import { DispatchProvider } from '../state/DispatchProvider';
import type { Panel } from '../layout/types';
import type { ReactNode } from 'react';

const initialPanels: Panel[] = [
  { kind: 'settings' },
  { kind: 'threadlist', label: 'INBOX' },
];

function renderWithProvider(ui: ReactNode) {
  return render(<DispatchProvider initialPanels={initialPanels}>{ui}</DispatchProvider>);
}

describe('SettingsPanel', () => {
  it('shows the sign-in button when signed out', () => {
    const signIn = vi.fn();
    renderWithProvider(<SettingsPanel signedIn={false} onSignIn={signIn} onSignOut={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(signIn).toHaveBeenCalledTimes(1);
  });

  it('shows the sign-out button when signed in', () => {
    const signOut = vi.fn();
    renderWithProvider(<SettingsPanel signedIn={true} onSignIn={vi.fn()} onSignOut={signOut} />);
    fireEvent.click(screen.getByRole('button', { name: /sign out/i }));
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('renders the panel header with the "Settings" title', () => {
    renderWithProvider(<SettingsPanel signedIn={false} onSignIn={vi.fn()} onSignOut={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
  });
});
