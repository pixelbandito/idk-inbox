// Bridges event-date recognition to the snooze picker: when the thread being
// snoozed mentions an upcoming date, offer wake times relative to it.

import { detectEventDate } from '../lib/events/detectEventDate';
import type { EmailSummary } from '../lib/gmail/types';

export interface EventSnoozeOption {
  label: string;
  until: string; // ISO
}

const EVENING_HOUR = 18;
const MORNING_HOUR = 8;

function at(day: Date, hour: number, daysOffset = 0): Date {
  const d = new Date(day);
  d.setDate(d.getDate() + daysOffset);
  d.setHours(hour, 0, 0, 0);
  return d;
}

export function eventSnoozeOptionsFor(
  summary: EmailSummary | undefined,
  now: Date = new Date(),
): EventSnoozeOption[] {
  if (!summary) return [];
  const event = detectEventDate(`${summary.subject} ${summary.snippet}`, now);
  if (!event) return [];

  // Show the resolved date alongside the matched text: it defuses locale
  // ambiguity ("7/8" → Jul 8 vs 7 Aug), makes a next-year rollover obvious,
  // and lets a false positive (e.g. "1/2 off") be seen and skipped.
  const resolved = event.date.toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
  });
  const candidates = [
    { label: `Evening before ${resolved}`, when: at(event.date, EVENING_HOUR, -1) },
    { label: `Morning of ${resolved}`,     when: at(event.date, MORNING_HOUR) },
  ];
  return candidates
    .filter((c) => c.when.getTime() > now.getTime())
    .map((c) => ({ label: c.label, until: c.when.toISOString() }));
}
