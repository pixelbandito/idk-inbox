import { describe, it, expect } from 'vitest';
import { snoozeBucketLabel, wakeTimeOf, SNOOZE_BUCKET_PREFIX } from './bucket';

describe('snooze bucket labels', () => {
  it('encodes a wake time as a label-safe UTC bucket name', () => {
    const until = new Date(Date.UTC(2026, 6, 9, 14, 30, 59));
    expect(snoozeBucketLabel(until)).toBe('idk-inbox/Snoozed/2026-07-09-1430');
  });

  it('round-trips through encode/decode at minute precision', () => {
    const until = new Date(Date.UTC(2026, 11, 31, 23, 59, 42));
    const decoded = wakeTimeOf(snoozeBucketLabel(until));
    expect(decoded?.toISOString()).toBe('2026-12-31T23:59:00.000Z');
  });

  it('decodes only labels under the bucket prefix', () => {
    expect(wakeTimeOf('idk-inbox/Snoozed')).toBeNull();
    expect(wakeTimeOf('idk-inbox/Receipts')).toBeNull();
    expect(wakeTimeOf('INBOX')).toBeNull();
  });

  it('rejects malformed bucket suffixes', () => {
    expect(wakeTimeOf(`${SNOOZE_BUCKET_PREFIX}not-a-date`)).toBeNull();
    expect(wakeTimeOf(`${SNOOZE_BUCKET_PREFIX}2026-13-40-9999`)).toBeNull();
  });
});
