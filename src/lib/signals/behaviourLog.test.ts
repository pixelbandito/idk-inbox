import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordSeen, recordOpen, recordAction, fingerprintStats,
  allFingerprintStats, parseFingerprintKey,
  senderKey, listKey, normalizeListId, fingerprintKeysFor, resetBehaviourLog,
} from './behaviourLog';
import { cacheThreadSummaries, resetThreadSummaryCache } from '../../state/threadSummaryCache';
import type { EmailSummary } from '../gmail/types';

const NOW = new Date(2026, 6, 12, 12, 0).getTime();
const DAY = 24 * 3600 * 1000;

function summary(id: string, from: string, listId?: string): EmailSummary {
  return {
    id, threadId: `t${id}`, from, subject: 's', snippet: '', date: '', unread: true, labels: [],
    ...(listId ? { signals: { fromDomain: '', rolePattern: null, plusTag: null, replyToDomain: null,
      replyToMismatch: false, toCount: 0, ccCount: 0, recipientRole: 'unknown', listId,
      hasUnsubscribe: false, oneClickUnsubscribe: false, precedenceBulk: false, autoSubmitted: false,
      authentication: { spf: null, dkim: null, dmarc: null }, isReply: false } } : {}),
  };
}

describe('fingerprint keys', () => {
  it('keys a message by sender, and also by List-Id when present', () => {
    expect(fingerprintKeysFor(summary('m1', 'Deals <deals@shop.example>'))).toEqual([
      senderKey('deals@shop.example'),
    ]);
    expect(fingerprintKeysFor(summary('m2', 'x@y.z', 'Shop <deals.shop.example>'))).toEqual([
      senderKey('x@y.z'), listKey('deals.shop.example'),
    ]);
  });

  it('normalizes a List-Id header to its bracketed id', () => {
    expect(normalizeListId('Shop Deals <Deals.Shop.Example>')).toBe('deals.shop.example');
    expect(normalizeListId('bare.id')).toBe('bare.id');
  });
});

describe('behaviourLog', () => {
  beforeEach(() => { resetBehaviourLog(); resetThreadSummaryCache(); });

  it('counts sightings deduped by message id per fingerprint', () => {
    const a = summary('m1', 'a@b.c');
    recordSeen([a, a, summary('m2', 'a@b.c')], NOW);
    expect(fingerprintStats(senderKey('a@b.c'), 14, NOW).seen).toBe(2);
  });

  it('rolls a listed message up into both its sender and its list', () => {
    recordSeen([summary('m1', 'x@y.z', 'Shop <deals.shop.example>')], NOW);
    expect(fingerprintStats(senderKey('x@y.z'), 14, NOW).seen).toBe(1);
    expect(fingerprintStats(listKey('deals.shop.example'), 14, NOW).seen).toBe(1);
  });

  it('conditions archive on whether the thread was opened first', () => {
    const opened = summary('m1', 'a@b.c');
    const unopened = summary('m2', 'a@b.c');
    cacheThreadSummaries([opened, unopened]);

    recordOpen(opened.threadId, NOW);
    recordAction([opened.threadId], 'archive', NOW);
    recordAction([unopened.threadId], 'archive', NOW);

    const stats = fingerprintStats(senderKey('a@b.c'), 14, NOW);
    expect(stats.archived).toBe(2);
    expect(stats.archivedWithoutOpen).toBe(1); // only the un-opened one
    expect(stats.opened).toBe(1);
  });

  it('records the other actions and skips threads with no cached summary', () => {
    cacheThreadSummaries([summary('m1', 'a@b.c')]);
    recordAction(['tm1', 'unknown-thread'], 'snooze', NOW);
    recordAction(['tm1'], 'unsubscribe', NOW);
    const stats = fingerprintStats(senderKey('a@b.c'), 14, NOW);
    expect(stats.snoozed).toBe(1);
    expect(stats.unsubscribed).toBe(1);
  });

  it('only counts events inside the window', () => {
    cacheThreadSummaries([summary('m1', 'a@b.c')]);
    recordAction(['tm1'], 'archive', NOW - 20 * DAY);
    recordAction(['tm1'], 'archive', NOW);
    expect(fingerprintStats(senderKey('a@b.c'), 14, NOW).archived).toBe(1); // the old one aged out
  });

  it('allFingerprintStats returns one entry per tracked key', () => {
    recordSeen([summary('m1', 'a@b.c'), summary('m2', 'x@y.z', 'Shop <deals.shop.example>')], NOW);
    const keys = allFingerprintStats(14, NOW).map((s) => s.key).sort();
    expect(keys).toEqual([senderKey('a@b.c'), senderKey('x@y.z'), listKey('deals.shop.example')].sort());
  });

  it('parseFingerprintKey splits a key into kind and value', () => {
    expect(parseFingerprintKey(senderKey('a@b.c'))).toEqual({ kind: 'sender', value: 'a@b.c' });
    expect(parseFingerprintKey(listKey('deals.shop.example'))).toEqual({ kind: 'list', value: 'deals.shop.example' });
  });
});
