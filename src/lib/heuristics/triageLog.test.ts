import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordSightings,
  recordTriageForThreads,
  senderStats,
  resetTriageLog,
} from './triageLog';
import { cacheThreadSummaries, resetThreadSummaryCache } from '../../state/threadSummaryCache';
import type { EmailSummary } from '../gmail/types';

const NOW = Date.UTC(2026, 6, 7, 12, 0);
const DAY = 24 * 3600 * 1000;

function email(id: string, threadId: string, from: string, unread = true): EmailSummary {
  return { id, threadId, from, subject: 's', snippet: '', date: '', unread };
}

describe('triage log', () => {
  beforeEach(() => {
    resetTriageLog();
    resetThreadSummaryCache();
  });

  it('counts sightings per sender address, deduped by message id', () => {
    const noisy = email('m1', 't1', 'Deals <deals@shop.example>');
    recordSightings([noisy, email('m2', 't2', 'deals@shop.example')], NOW);
    recordSightings([noisy], NOW + DAY); // same message seen again

    const stats = senderStats(14, NOW + DAY);
    expect(stats).toEqual([
      { sender: 'deals@shop.example', seen: 2, dismissedUnread: 0 },
    ]);
  });

  it('records triage events with unread-ness from the summary cache', () => {
    const emails = [
      email('m1', 't1', 'deals@shop.example', true),
      email('m2', 't2', 'deals@shop.example', false),
    ];
    cacheThreadSummaries(emails);
    recordSightings(emails, NOW);

    recordTriageForThreads(['t1', 't2'], 'archive', NOW);

    const stats = senderStats(14, NOW);
    // Only the unread thread counts as dismissed-without-reading.
    expect(stats).toEqual([
      { sender: 'deals@shop.example', seen: 2, dismissedUnread: 1 },
    ]);
  });

  it('forgets everything outside the window', () => {
    const old = email('m1', 't1', 'deals@shop.example');
    cacheThreadSummaries([old]);
    recordSightings([old], NOW - 20 * DAY);
    recordTriageForThreads(['t1'], 'delete', NOW - 20 * DAY);

    expect(senderStats(14, NOW)).toEqual([]);
  });

  it('ignores threads with no cached summary', () => {
    recordTriageForThreads(['unknown'], 'archive', NOW);
    expect(senderStats(14, NOW)).toEqual([]);
  });

  it('persists across module state via localStorage', () => {
    recordSightings([email('m1', 't1', 'a@b.example')], NOW);
    // A fresh read (no in-memory dependence) still sees it.
    expect(senderStats(14, NOW)).toHaveLength(1);
    resetTriageLog();
    expect(senderStats(14, NOW)).toEqual([]);
  });
});
