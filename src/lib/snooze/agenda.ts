// Snoozed threads read best grouped by the day they wake, not as one flat list.
// The wake time lives in each thread's bucket sublabel; threads carry label IDs,
// so we resolve them to names through the directory before decoding.

import { wakeTimeOf } from './bucket';
import type { EmailSummary } from '../gmail/types';

/** Wake time for a thread, from whichever of its labels is a snooze bucket. */
export function wakeTimeFromLabels(
  labelIds: readonly string[],
  directory: Map<string, string>,
): Date | null {
  for (const id of labelIds) {
    // System labels use their name as the id; user labels need the directory.
    const wake = wakeTimeOf(directory.get(id) ?? id);
    if (wake) return wake;
  }
  return null;
}

/** One day's worth of snoozed threads; `dayStart` is null for undated threads. */
export interface AgendaDay {
  /** Local midnight of the wake day, or null when no bucket could be decoded. */
  dayStart: Date | null;
  key: string;
  emails: EmailSummary[];
}

const MS_PER_DAY = 86_400_000;

function localMidnight(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Group threads by local wake day, ascending, with undated threads last. */
export function groupByWakeDay(
  emails: EmailSummary[],
  directory: Map<string, string>,
): AgendaDay[] {
  const byKey = new Map<string, AgendaDay>();
  for (const email of emails) {
    const wake = wakeTimeFromLabels(email.labels, directory);
    const dayStart = wake ? localMidnight(wake) : null;
    const key = dayStart ? String(dayStart.getTime()) : 'undated';
    const day = byKey.get(key) ?? { dayStart, key, emails: [] };
    day.emails.push(email);
    byKey.set(key, day);
  }
  return [...byKey.values()].sort(compareDays);
}

function compareDays(a: AgendaDay, b: AgendaDay): number {
  if (!a.dayStart) return 1;
  if (!b.dayStart) return -1;
  return a.dayStart.getTime() - b.dayStart.getTime();
}

/** Human day label, relative for the near future: "Today", "Tomorrow", else a date. */
export function dayHeading(dayStart: Date | null, now: Date): string {
  if (!dayStart) return 'No wake date';
  const date = dayStart.toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
  });
  const days = Math.round((dayStart.getTime() - localMidnight(now).getTime()) / MS_PER_DAY);
  if (days === 0) return `Today · ${date}`;
  if (days === 1) return `Tomorrow · ${date}`;
  if (days === -1) return `Yesterday · ${date}`;
  return date;
}
