import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InboxList } from './InboxList';
import type { EmailSummary } from '../lib/gmail/types';

const emails: EmailSummary[] = [
  { id: 'm1', threadId: 't1', from: 'Alice', subject: 'Lunch?', snippet: 'hey', date: '', unread: true },
  { id: 'm2', threadId: 't2', from: 'Bob', subject: 'Report', snippet: 'done', date: '', unread: false },
];

describe('InboxList', () => {
  it('renders a row per email', () => {
    render(<InboxList emails={emails} />);
    expect(screen.getByText('Lunch?')).toBeInTheDocument();
    expect(screen.getByText('Report')).toBeInTheDocument();
  });

  it('marks unread emails with the unread class', () => {
    render(<InboxList emails={emails} />);
    expect(screen.getByText('Lunch?').closest('li')).toHaveClass('email--unread');
    expect(screen.getByText('Report').closest('li')).not.toHaveClass('email--unread');
  });

  it('shows an inbox-zero message when empty', () => {
    render(<InboxList emails={[]} />);
    expect(screen.getByText(/inbox zero/i)).toBeInTheDocument();
  });
});
