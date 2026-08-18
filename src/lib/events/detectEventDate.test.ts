import { describe, it, expect } from 'vitest';
import { detectEventDate } from './detectEventDate';

// Fixed "now": Tuesday 2026-07-07, 12:00 local.
const NOW = new Date(2026, 6, 7, 12, 0);

function detect(text: string) {
  return detectEventDate(text, NOW);
}

describe('detectEventDate', () => {
  it('finds an ISO date', () => {
    const hit = detect('Reminder: dentist on 2026-07-12, bring your card');
    expect(hit?.matchedText).toBe('2026-07-12');
    expect(hit?.date).toEqual(new Date(2026, 6, 12));
  });

  it('finds a month-name date and infers the current year', () => {
    const hit = detect('Concert tickets for Jul 12!');
    expect(hit?.date).toEqual(new Date(2026, 6, 12));
  });

  it('rolls a passed month-name date into next year', () => {
    const hit = detect('Save the date: February 14');
    expect(hit?.date).toEqual(new Date(2027, 1, 14));
  });

  it('handles full month names, ordinals, and explicit years', () => {
    expect(detect('due September 3rd')?.date).toEqual(new Date(2026, 8, 3));
    expect(detect('summit on December 1, 2026')?.date).toEqual(new Date(2026, 11, 1));
  });

  it('handles day-first forms ("12 July")', () => {
    expect(detect('flight departs 12 July')?.date).toEqual(new Date(2026, 6, 12));
  });

  it('finds numeric M/D dates (US order)', () => {
    expect(detect('game on 7/12')?.date).toEqual(new Date(2026, 6, 12));
    expect(detect('closing on 8/1/2026')?.date).toEqual(new Date(2026, 7, 1));
  });

  it('returns the earliest upcoming date when several appear', () => {
    const hit = detect('Rescheduled from 2026-09-20 to 2026-07-20');
    expect(hit?.date).toEqual(new Date(2026, 6, 20));
  });

  it('ignores past dates with explicit years', () => {
    expect(detect('receipt from 2025-03-01')).toBeNull();
    expect(detect('invoice dated 3/1/2020')).toBeNull();
  });

  it('ignores invalid calendar dates and non-dates', () => {
    expect(detect('error code 13/45 in build 2026-13-40')).toBeNull();
    expect(detect('nothing datelike here')).toBeNull();
    expect(detect('version 2.6.7 released')).toBeNull();
  });

  it('treats today as upcoming (an event later today is still an event)', () => {
    expect(detect('happening 7/7')?.date).toEqual(new Date(2026, 6, 7));
  });
});
