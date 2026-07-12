import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SnoozedAgenda } from './SnoozedAgenda';
import { groupByWakeDay } from '../lib/snooze/agenda';
import { snoozeBucketLabel } from '../lib/snooze/bucket';
import type { EmailSummary } from '../lib/gmail/types';

const dir = new Map<string, string>([
  ['B', snoozeBucketLabel(new Date(2026, 6, 13, 9, 0))],
]);

function email(id: string): EmailSummary {
  return { id, threadId: `t${id}`, from: 'a@b.c', subject: `Subj ${id}`, snippet: '', date: '', unread: false, labels: ['B'] };
}

function renderAgenda(count: number, cap: number) {
  const emails = Array.from({ length: count }, (_, i) => email(String(i)));
  const days = groupByWakeDay(emails, dir);
  render(
    <SnoozedAgenda
      days={days}
      now={new Date(2026, 6, 12, 12, 0)}
      perDayCap={cap}
      renderEmail={(e) => <li key={e.id}>{e.subject}</li>}
    />,
  );
}

describe('SnoozedAgenda', () => {
  it('caps a day and reveals the rest behind +N more', () => {
    renderAgenda(6, 4);
    expect(screen.getAllByText(/^Subj /)).toHaveLength(4);
    fireEvent.click(screen.getByRole('button', { name: '+2 more' }));
    expect(screen.getAllByText(/^Subj /)).toHaveLength(6);
    expect(screen.queryByRole('button', { name: /more/i })).toBeNull();
  });

  it('shows a day heading', () => {
    renderAgenda(1, 4);
    expect(screen.getByText(/Tomorrow ·/)).toBeInTheDocument();
  });
});
