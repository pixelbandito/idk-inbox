// Snoozed threads carry a bucket sublabel encoding their wake time, so the
// wake-up sweep can find due threads without any server-side store. Buckets
// are minute-precision UTC and avoid characters Gmail label names dislike
// (colons), e.g. "idk-inbox/Snoozed/2026-07-09-1430".

import { SNOOZED_LABEL } from '../gmail/labelBootstrap';

export const SNOOZE_BUCKET_PREFIX = `${SNOOZED_LABEL}/`;

const BUCKET_SUFFIX = /^(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})$/;

export function snoozeBucketLabel(until: Date): string {
  const iso = until.toISOString(); // 2026-07-09T14:30:59.000Z
  const date = iso.slice(0, 10);
  const time = iso.slice(11, 13) + iso.slice(14, 16);
  return `${SNOOZE_BUCKET_PREFIX}${date}-${time}`;
}

/** Wake time encoded in a bucket label, or null for non-bucket labels. */
export function wakeTimeOf(label: string): Date | null {
  if (!label.startsWith(SNOOZE_BUCKET_PREFIX)) return null;
  const match = BUCKET_SUFFIX.exec(label.slice(SNOOZE_BUCKET_PREFIX.length));
  if (!match) return null;
  const [, year, month, day, hour, minute] = match.map(Number);
  const wake = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const survivedRangeChecks =
    wake.getUTCMonth() === month - 1 &&
    wake.getUTCDate() === day &&
    wake.getUTCHours() === hour &&
    wake.getUTCMinutes() === minute;
  return survivedRangeChecks ? wake : null;
}
