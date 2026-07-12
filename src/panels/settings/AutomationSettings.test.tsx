import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AutomationSettings } from './AutomationSettings';
import { resetLocalState } from '../../test/resetLocalState';
import { isProcessorEnabled } from '../../lib/automation/settings';
import { addAutoArchiveRule, autoArchiveRules } from '../../lib/rules/autoArchive';

describe('AutomationSettings', () => {
  beforeEach(() => resetLocalState());

  it('lists each processor with a plain-language summary', () => {
    render(<AutomationSettings />);
    expect(screen.getByText('Sender fatigue')).toBeInTheDocument();
    expect(screen.getByText('Auto-archive rules')).toBeInTheDocument();
    expect(screen.getByText(/keep archiving unread/i)).toBeInTheDocument();
  });

  it('toggling a processor persists its off state', () => {
    render(<AutomationSettings />);
    const toggle = screen.getByRole('switch', { name: /enable sender fatigue/i });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(isProcessorEnabled('sender-fatigue')).toBe(false);
  });

  it('shows an empty state when there are no auto-archive rules', () => {
    render(<AutomationSettings />);
    expect(screen.getByText(/no rules yet/i)).toBeInTheDocument();
  });

  it('lists auto-archive rules and removes one on demand', () => {
    addAutoArchiveRule('spam@shop.example');
    render(<AutomationSettings />);
    expect(screen.getByText('spam@shop.example')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /remove auto-archive rule for spam@shop.example/i }));
    expect(autoArchiveRules()).toHaveLength(0);
    expect(screen.queryByText('spam@shop.example')).toBeNull();
  });
});
