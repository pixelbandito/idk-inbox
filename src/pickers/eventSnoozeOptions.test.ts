import { describe, it, expect } from 'vitest';
import { eventSnoozeOptionsFor } from './eventSnoozeOptions';
import type { EmailSummary } from '../lib/gmail/types';

const NOW = new Date(2026, 6, 7, 12, 0); // Tue Jul 7, noon local

function summary(subject: string, snippet = ''): EmailSummary {
  return { id: 'm1', threadId: 't1', from: 'a@b.c', subject, snippet, date: '', unread: false };
}

describe('eventSnoozeOptionsFor', () => {
  it('offers evening-before and morning-of for an upcoming event', () => {
    const options = eventSnoozeOptionsFor(summary('Dentist on Jul 12'), NOW);
    expect(options.map((o) => o.label)).toEqual([
      'Evening before Jul 12',
      'Morning of Jul 12',
    ]);
    expect(new Date(options[0].until)).toEqual(new Date(2026, 6, 11, 18, 0));
    expect(new Date(options[1].until)).toEqual(new Date(2026, 6, 12, 8, 0));
  });

  it('drops options that are already past (event is tomorrow, evening today already offerable)', () => {
    // Event tomorrow at noon-now: evening-before (today 18:00) is still future.
    const options = eventSnoozeOptionsFor(summary('Show on 7/8'), NOW);
    expect(options.map((o) => o.label)).toEqual([
      'Evening before 7/8',
      'Morning of 7/8',
    ]);

    // Event today: both relative times are gone by noon → no options.
    const today = eventSnoozeOptionsFor(summary('Show on 7/7'), NOW);
    expect(today).toEqual([]);
  });

  it('returns nothing without a summary or a detected date', () => {
    expect(eventSnoozeOptionsFor(undefined, NOW)).toEqual([]);
    expect(eventSnoozeOptionsFor(summary('no dates here'), NOW)).toEqual([]);
  });
});
