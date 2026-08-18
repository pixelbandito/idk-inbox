import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ReactNode } from 'react';
import { AutomationActionsPanel } from './AutomationActionsPanel';
import { DispatchProvider } from '../state/DispatchProvider';
import { resetLocalState } from '../test/resetLocalState';
import { addAutoArchiveRule, autoArchiveRules, ruleEnabled } from '../lib/rules/autoArchive';

// PanelHeader wires trigger producers that read the dispatch context.
function renderPanel(ui: ReactNode) {
  return render(<DispatchProvider signedIn>{ui}</DispatchProvider>);
}

describe('AutomationActionsPanel', () => {
  beforeEach(() => resetLocalState());

  it('shows an empty state and a working close button', () => {
    const onClose = vi.fn();
    renderPanel(<AutomationActionsPanel onClose={onClose} />);
    expect(screen.getByText(/no auto-archive actions yet/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /close automations/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('lists each rule and pauses one without deleting it', () => {
    addAutoArchiveRule('deals@shop.example');
    renderPanel(<AutomationActionsPanel onClose={vi.fn()} />);
    const toggle = screen.getByRole('switch', { name: /enable auto-archive for deals@shop.example/i });
    expect(toggle).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(autoArchiveRules()).toHaveLength(1);                 // still there
    expect(ruleEnabled(autoArchiveRules()[0])).toBe(false);     // just paused
  });

  it('removes a single rule', () => {
    addAutoArchiveRule('deals@shop.example');
    renderPanel(<AutomationActionsPanel onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /remove auto-archive rule for deals@shop.example/i }));
    expect(autoArchiveRules()).toHaveLength(0);
    expect(screen.queryByText('deals@shop.example')).toBeNull();
  });

  it('disable-all pauses every rule, then the label flips to enable-all', () => {
    addAutoArchiveRule('a@b.c');
    addAutoArchiveRule('d@e.f');
    renderPanel(<AutomationActionsPanel onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /disable all/i }));
    expect(autoArchiveRules().every((r) => !ruleEnabled(r))).toBe(true);
    expect(screen.getByRole('button', { name: /enable all/i })).toBeInTheDocument();
  });

  it('delete-all clears every rule', () => {
    addAutoArchiveRule('a@b.c');
    addAutoArchiveRule('d@e.f');
    renderPanel(<AutomationActionsPanel onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /delete all/i }));
    expect(autoArchiveRules()).toEqual([]);
    expect(screen.getByText(/no auto-archive actions yet/i)).toBeInTheDocument();
  });
});
