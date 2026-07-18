import { describe, it, expect, beforeEach } from 'vitest';
import { evaluateHeuristics, topSuggestion } from './evaluate';
import { recordSeen, recordAction, resetBehaviourLog } from '../signals/behaviourLog';
import { resolveSuggestionFor, resetResolvedSuggestions } from './resolvedSuggestions';
import { cacheThreadSummaries, resetThreadSummaryCache } from '../../state/threadSummaryCache';
import type { EmailSummary } from '../gmail/types';
import type { MessageSignals } from '../signals/messageSignals';

function signals(over: Partial<MessageSignals> = {}): MessageSignals {
  return {
    fromDomain: 'x.example', rolePattern: null, plusTag: null, replyToDomain: null,
    replyToMismatch: false, toCount: 0, ccCount: 0, recipientRole: 'unknown', listId: null,
    hasUnsubscribe: false, oneClickUnsubscribe: false, precedenceBulk: false, autoSubmitted: false,
    authentication: { spf: null, dkim: null, dmarc: null }, isReply: false, ...over,
  };
}

function email(id: string, from: string, over?: Partial<MessageSignals>): EmailSummary {
  return {
    id, threadId: `t${id}`, from, subject: 's', snippet: '', date: '', unread: true, labels: [],
    signals: signals(over),
  };
}

/** Seed N sightings from one sender, then archive `archived` of them unopened. */
function seed(from: string, n: number, archived: number, over?: Partial<MessageSignals>) {
  const emails = Array.from({ length: n }, (_, i) => email(`${from}-${i}`, from, over));
  cacheThreadSummaries(emails);
  recordSeen(emails);
  recordAction(emails.slice(0, archived).map((e) => e.threadId), 'archive');
}

describe('evaluateHeuristics', () => {
  beforeEach(() => { resetBehaviourLog(); resetThreadSummaryCache(); resetResolvedSuggestions(); });

  it('suggests auto-archive for a fatigued plain sender', () => {
    seed('deals@shop.example', 6, 5); // 5/6 archived unopened, no unsubscribe
    const [s] = evaluateHeuristics();
    expect(s.heuristicId).toBe('fatigue-auto-archive');
    expect(s.action).toEqual({ kind: 'auto-archive' });
    expect(s.fingerprint.value).toBe('deals@shop.example');
    expect(s.detail).toMatch(/5 of the last 6/);
  });

  it('prefers unsubscribe over auto-archive when a one-tap unsubscribe exists', () => {
    // Rarely opened + has unsubscribe → unsubscribe wins even though fatigue also matches.
    seed('news@list.example', 6, 5, { hasUnsubscribe: true });
    const [s] = evaluateHeuristics();
    expect(s.heuristicId).toBe('dead-newsletter-unsubscribe');
    expect(s.action).toEqual({ kind: 'unsubscribe' });
  });

  it('suggests auto-archive for an ignored automated role sender', () => {
    seed('noreply@app.example', 5, 3, { rolePattern: 'noreply' }); // 60% unopened
    expect(topSuggestion()?.heuristicId).toBe('role-noise-auto-archive');
  });

  it('stays quiet below the volume/rate bars', () => {
    seed('friend@x.example', 4, 4);            // too few seen
    seed('mixed@x.example', 10, 3);            // only 30% archived unopened
    expect(evaluateHeuristics()).toEqual([]);
  });

  it('skips a fingerprint the user has already resolved', () => {
    seed('deals@shop.example', 6, 5);
    resolveSuggestionFor('deals@shop.example');
    expect(evaluateHeuristics()).toEqual([]);
  });

  it('ranks the worst offender first', () => {
    seed('mild@x.example', 6, 5);
    seed('worst@x.example', 30, 30);
    expect(evaluateHeuristics()[0].fingerprint.value).toBe('worst@x.example');
  });
});
