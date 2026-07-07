import { describe, it, expect } from 'vitest';
import { eventSnoozeOptionsFor } from './eventSnoozeOptions';
import type { EmailSummary } from '../lib/gmail/types';

const NOW = new Date(2026, 6, 7, 12, 0); // Tue Jul 7, noon local

function summary(subject: string, snippet = ''): EmailSummary {
  return { id: 'm1', threadId: 't1', from: 'a@b.c', subject, snippet, date: '', unread: false };
}

describe('eventSnoozeOptionsFor', () => {
  // Labels carry the RESOLVED date, not the raw matched text, so they read
  // unambiguously regardless of the source format.
  const resolvedJul12 = new Date(2026, 6, 12).toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
  });

  it('offers evening-before and morning-of for an upcoming event', () => {
    const options = eventSnoozeOptionsFor(summary('Dentist on Jul 12'), NOW);
    expect(options.map((o) => o.label)).toEqual([
      `Evening before ${resolvedJul12}`,
      `Morning of ${resolvedJul12}`,
    ]);
    expect(new Date(options[0].until)).toEqual(new Date(2026, 6, 11, 18, 0));
    expect(new Date(options[1].until)).toEqual(new Date(2026, 6, 12, 8, 0));
  });

  it('resolves ambiguous numeric dates to a labelled calendar day', () => {
    // Event tomorrow at noon-now: evening-before (today 18:00) is still future.
    const options = eventSnoozeOptionsFor(summary('Show on 7/8'), NOW);
    const resolved = new Date(2026, 6, 8).toLocaleDateString(undefined, {
      weekday: 'short', month: 'short', day: 'numeric',
    });
    expect(options.map((o) => o.label)).toEqual([
      `Evening before ${resolved}`,
      `Morning of ${resolved}`,
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
