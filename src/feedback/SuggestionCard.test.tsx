import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { SuggestionCard } from './SuggestionCard';
import { DispatchProvider } from '../state/DispatchProvider';
import { spyThreadWriteClient } from '../test/spyThreadWriteClient';
import { resetLocalState } from '../test/resetLocalState';
import { recordSeen, recordAction } from '../lib/signals/behaviourLog';
import { autoArchiveRules } from '../lib/rules/autoArchive';
import { cacheThreadSummaries } from '../state/threadSummaryCache';
import type { EmailSummary } from '../lib/gmail/types';
import type { MessageSignals } from '../lib/signals/messageSignals';

const SENDER = 'deals@shop.example';

function signals(over: Partial<MessageSignals>): MessageSignals {
  return {
    fromDomain: 'shop.example', rolePattern: null, plusTag: null, replyToDomain: null,
    replyToMismatch: false, toCount: 0, ccCount: 0, recipientRole: 'unknown', listId: null,
    hasUnsubscribe: false, oneClickUnsubscribe: false, precedenceBulk: false, autoSubmitted: false,
    authentication: { spf: null, dkim: null, dmarc: null }, isReply: false, ...over,
  };
}

// A plain fatigued sender by default; `unsub` makes it an unread newsletter.
function email(i: number, unsub?: string): EmailSummary {
  return {
    id: `m${i}`, threadId: `t${i}`, from: `Deals <${SENDER}>`,
    subject: 'sale!', snippet: '', date: '', unread: true, labels: [],
    ...(unsub ? { listUnsubscribe: unsub, signals: signals({ hasUnsubscribe: true }) } : {}),
  };
}

/** 6 seen, 5 archived without opening → over the volume/rate bars. */
function seed(unsub?: string) {
  const emails = Array.from({ length: 6 }, (_, i) => email(i, unsub));
  cacheThreadSummaries(emails);
  recordSeen(emails);
  recordAction(emails.slice(0, 5).map((e) => e.threadId), 'archive');
  return emails;
}

function renderCard(emails: EmailSummary[], getToken: () => string | null = () => null) {
  const { client } = spyThreadWriteClient();
  render(
    <DispatchProvider signedIn getToken={() => 'tok'} threadWriteClient={client}>
      <SuggestionCard emails={emails} getToken={getToken} />
    </DispatchProvider>,
  );
}

describe('SuggestionCard', () => {
  beforeEach(() => { vi.restoreAllMocks(); resetLocalState(); });

  it('stays hidden with no measured activity', async () => {
    renderCard([email(1)]);
    await act(async () => {}); // flush the microtask
    expect(screen.queryByRole('region', { name: /suggestion/i })).toBeNull();
  });

  it('offers to auto-archive a plain fatigued sender, with the evidence', async () => {
    renderCard(seed());
    const card = await screen.findByRole('region', { name: /suggestion/i });
    expect(card).toHaveTextContent(/auto-archive mail from/i);
    expect(card).toHaveTextContent('5 of the last 6');
    expect(card).toHaveTextContent(SENDER);
    expect(screen.queryByRole('button', { name: /^unsubscribe$/i })).toBeNull();
  });

  it('previews how many are already in the inbox before you confirm', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      { ok: true, status: 200, json: async () => ({ threads: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] }) } as Response,
    );
    vi.stubGlobal('fetch', fetchMock);

    renderCard(seed(), () => 'tok');
    const card = await screen.findByRole('region', { name: /suggestion/i });
    await waitFor(() => expect(card).toHaveTextContent(/archives 3 already in your inbox/i));
  });

  it('auto-archive stores a rule and settles the suggestion', async () => {
    renderCard(seed());
    const button = await screen.findByRole('button', { name: /auto-archive this sender/i });
    await act(async () => { fireEvent.click(button); });
    expect(autoArchiveRules().map((r) => r.sender)).toEqual([SENDER]);
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: /suggestion/i })).toBeNull());
  });

  it('prefers unsubscribe for an unread newsletter that offers one', async () => {
    renderCard(seed('<https://shop.example/unsub>'));
    const card = await screen.findByRole('region', { name: /suggestion/i });
    expect(card).toHaveTextContent(/unsubscribe from/i);
    expect(screen.getByRole('button', { name: /^unsubscribe$/i })).toBeInTheDocument();
    // Unsubscribe is the cleaner exit, so auto-archive isn't also offered.
    expect(screen.queryByRole('button', { name: /auto-archive/i })).toBeNull();
  });

  it('keeps the suggestion standing when unsubscribe cannot open', async () => {
    // A List-Unsubscribe header with no usable URI → the action returns
    // ok:false, so the card must NOT settle.
    renderCard(seed('<not-a-uri>'));
    const button = await screen.findByRole('button', { name: /^unsubscribe$/i });
    await act(async () => { fireEvent.click(button); });
    expect(screen.getByRole('region', { name: /suggestion/i })).toBeInTheDocument();
  });

  it('resolving hides the card and persists across re-renders', async () => {
    renderCard(seed());
    const dismiss = await screen.findByRole('button', { name: /don.t suggest again/i });
    await act(async () => { fireEvent.click(dismiss); });
    expect(screen.queryByRole('region', { name: /suggestion/i })).toBeNull();

    renderCard(seed()); // a fresh mount stays quiet: the resolution is stored
    await act(async () => {});
    expect(screen.queryByRole('region', { name: /suggestion/i })).toBeNull();
  });
});
