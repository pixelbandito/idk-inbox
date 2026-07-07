import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { SuggestionCard } from './SuggestionCard';
import { DispatchProvider } from '../state/DispatchProvider';
import { spyThreadWriteClient } from '../test/spyThreadWriteClient';
import { resetLocalState } from '../test/resetLocalState';
import { recordSightings, recordTriageForThreads } from '../lib/heuristics/triageLog';
import { autoArchiveRules } from '../lib/rules/autoArchive';
import { cacheThreadSummaries } from '../state/threadSummaryCache';
import type { EmailSummary } from '../lib/gmail/types';

const SENDER = 'deals@shop.example';

function email(i: number, unread = true): EmailSummary {
  return {
    id: `m${i}`, threadId: `t${i}`, from: `Deals <${SENDER}>`,
    subject: 'sale!', snippet: '', date: '', unread,
    listUnsubscribe: '<https://shop.example/unsub>',
  };
}

/** 6 sightings, 5 dismissed unread → over the 5-in-14-days / 80% bar. */
function seedFatigue() {
  const emails = Array.from({ length: 6 }, (_, i) => email(i));
  cacheThreadSummaries(emails);
  recordSightings(emails);
  recordTriageForThreads(emails.slice(0, 5).map((e) => e.threadId), 'archive');
  return emails;
}

function renderCard(emails: EmailSummary[]) {
  const { client } = spyThreadWriteClient();
  const openExternal = vi.fn();
  render(
    <DispatchProvider signedIn getToken={() => 'tok'} threadWriteClient={client}>
      <SuggestionCard emails={emails} />
    </DispatchProvider>,
  );
  return { openExternal };
}

describe('SuggestionCard', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetLocalState();
  });

  it('stays hidden without a fatigued sender', async () => {
    renderCard([email(1)]);
    await act(async () => {}); // flush the microtask
    expect(screen.queryByRole('region', { name: /suggestion/i })).toBeNull();
  });

  it('surfaces the fatigued sender with its stats', async () => {
    const emails = seedFatigue();
    renderCard(emails);
    const card = await screen.findByRole('region', { name: /suggestion/i });
    expect(card).toHaveTextContent('5 of the last 6 seen');
    expect(card).toHaveTextContent(SENDER);
  });

  it('resolving hides the card and persists across re-renders', async () => {
    const emails = seedFatigue();
    renderCard(emails);
    const dismiss = await screen.findByRole('button', { name: /don.t suggest again/i });
    await act(async () => { fireEvent.click(dismiss); });
    expect(screen.queryByRole('region', { name: /suggestion/i })).toBeNull();

    // A fresh mount stays quiet: the resolution is stored.
    renderCard(emails);
    await act(async () => {});
    expect(screen.queryByRole('region', { name: /suggestion/i })).toBeNull();
  });

  it('Auto-archive stores a rule and settles the suggestion', async () => {
    const emails = seedFatigue();
    renderCard(emails);
    const button = await screen.findByRole('button', { name: /auto-archive/i });
    await act(async () => { fireEvent.click(button); });

    expect(autoArchiveRules().map((r) => r.sender)).toEqual([SENDER]);
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: /suggestion/i })).toBeNull());
  });

  it('offers Unsubscribe only when a row carries a List-Unsubscribe header', async () => {
    const bare = seedFatigue().map((e) => ({ ...e, listUnsubscribe: undefined }));
    renderCard(bare);
    await screen.findByRole('region', { name: /suggestion/i });
    expect(screen.queryByRole('button', { name: /unsubscribe/i })).toBeNull();
  });

  it('keeps the suggestion standing when unsubscribe cannot open', async () => {
    // A List-Unsubscribe header with no usable URI → the action returns
    // ok:false, so the card must NOT settle.
    const emails = seedFatigue().map((e) => ({ ...e, listUnsubscribe: '<not-a-uri>' }));
    cacheThreadSummaries(emails); // overwrite the good-link summaries
    renderCard(emails);
    const button = await screen.findByRole('button', { name: /unsubscribe/i });
    await act(async () => { fireEvent.click(button); });
    expect(screen.getByRole('region', { name: /suggestion/i })).toBeInTheDocument();
  });
});
