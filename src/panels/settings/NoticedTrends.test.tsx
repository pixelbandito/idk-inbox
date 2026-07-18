import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { NoticedTrends } from './NoticedTrends';
import {
  recordSeen, recordOpen, recordAction, resetBehaviourLog,
} from '../../lib/signals/behaviourLog';
import { cacheThreadSummaries, resetThreadSummaryCache } from '../../state/threadSummaryCache';
import type { EmailSummary } from '../../lib/gmail/types';

function summary(id: string, from: string): EmailSummary {
  return { id, threadId: `t${id}`, from, subject: 's', snippet: '', date: '', unread: true, labels: [] };
}

describe('NoticedTrends', () => {
  beforeEach(() => { resetBehaviourLog(); resetThreadSummaryCache(); });

  it('shows an empty state before anything is measured', () => {
    render(<NoticedTrends />);
    expect(screen.getByText(/nothing measured yet/i)).toBeInTheDocument();
  });

  it('lists a sender with its open and archived-unopened rates', () => {
    // 5 seen from one sender; 4 archived without opening → 80%.
    const emails = Array.from({ length: 5 }, (_, i) => summary(`m${i}`, 'noisy@x.example'));
    cacheThreadSummaries(emails);
    recordSeen(emails);
    recordOpen('tm0'); // opened one
    recordAction(['tm1', 'tm2', 'tm3', 'tm4'], 'archive'); // four archived unopened

    render(<NoticedTrends />);
    const row = screen.getByText('noisy@x.example').closest('li')!;
    expect(within(row).getByText('5 seen')).toBeInTheDocument();
    expect(within(row).getByText('20% opened')).toBeInTheDocument();
    expect(within(row).getByText('80% archived unopened')).toBeInTheDocument();
    // High volume + high archive-unopened → flagged as a fatigue candidate.
    expect(row).toHaveAttribute('data-fatigued', 'true');
  });
});
