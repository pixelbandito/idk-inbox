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

  const candidates = [
    { label: `Evening before ${event.matchedText}`, when: at(event.date, EVENING_HOUR, -1) },
    { label: `Morning of ${event.matchedText}`,     when: at(event.date, MORNING_HOUR) },
  ];
  return candidates
    .filter((c) => c.when.getTime() > now.getTime())
    .map((c) => ({ label: c.label, until: c.when.toISOString() }));
}
