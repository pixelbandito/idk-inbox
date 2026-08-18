import { describe, it, expect } from 'vitest';
import { deriveMessageSignals } from './messageSignals';
import type { RawGmailMessage } from '../gmail/parseMessage';

function msg(headers: Record<string, string>): RawGmailMessage {
  return {
    id: 'm1', threadId: 't1', snippet: '',
    payload: { headers: Object.entries(headers).map(([name, value]) => ({ name, value })) },
  };
}

describe('deriveMessageSignals', () => {
  it('extracts sender domain, role pattern, and plus tag', () => {
    const s = deriveMessageSignals(msg({ From: 'Deals <no-reply+promo@mail.shop.example>' }));
    expect(s.fromDomain).toBe('mail.shop.example');
    expect(s.rolePattern).toBe('noreply');
    expect(s.plusTag).toBe('promo');
  });

  it('flags a Reply-To on a different domain than From', () => {
    const s = deriveMessageSignals(msg({
      From: 'News <bounce@sendgrid.net>', 'Reply-To': 'hi@brand.example',
    }));
    expect(s.replyToDomain).toBe('brand.example');
    expect(s.replyToMismatch).toBe(true);
  });

  it('counts To/Cc and locates the account address', () => {
    const s = deriveMessageSignals(
      msg({ From: 'a@b.c', To: 'x@y.z, me@acct.example', Cc: 'p@q.r' }),
      'me@acct.example',
    );
    expect(s.toCount).toBe(2);
    expect(s.ccCount).toBe(1);
    expect(s.recipientRole).toBe('to');
  });

  it('reports cc-only and none placements, and unknown without an account address', () => {
    const base = { From: 'a@b.c', To: 'x@y.z', Cc: 'me@acct.example' };
    expect(deriveMessageSignals(msg(base), 'me@acct.example').recipientRole).toBe('cc');
    expect(deriveMessageSignals(msg({ From: 'a@b.c', To: 'x@y.z' }), 'me@acct.example').recipientRole).toBe('none');
    expect(deriveMessageSignals(msg(base)).recipientRole).toBe('unknown');
  });

  it('reads list, unsubscribe, precedence, and auto-submitted headers', () => {
    const s = deriveMessageSignals(msg({
      From: 'a@b.c',
      'List-Id': 'Shop Deals <deals.shop.example>',
      'List-Unsubscribe': '<https://shop.example/u>',
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      Precedence: 'bulk',
      'Auto-Submitted': 'auto-generated',
    }));
    expect(s.listId).toBe('Shop Deals <deals.shop.example>');
    expect(s.hasUnsubscribe).toBe(true);
    expect(s.oneClickUnsubscribe).toBe(true);
    expect(s.precedenceBulk).toBe(true);
    expect(s.autoSubmitted).toBe(true);
  });

  it('parses SPF/DKIM/DMARC verdicts from Authentication-Results', () => {
    const s = deriveMessageSignals(msg({
      From: 'a@b.c',
      'Authentication-Results': 'mx.google.com; spf=pass smtp.mailfrom=b.c; dkim=fail header.d=b.c; dmarc=pass',
    }));
    expect(s.authentication).toEqual({ spf: 'pass', dkim: 'fail', dmarc: 'pass' });
  });

  it('detects a reply from In-Reply-To / References', () => {
    expect(deriveMessageSignals(msg({ From: 'a@b.c', 'In-Reply-To': '<x@y>' })).isReply).toBe(true);
    expect(deriveMessageSignals(msg({ From: 'a@b.c' })).isReply).toBe(false);
  });

  it('returns benign defaults for a bare personal message', () => {
    const s = deriveMessageSignals(msg({ From: 'Alice <alice@example.com>' }), 'me@acct.example');
    expect(s.rolePattern).toBeNull();
    expect(s.plusTag).toBeNull();
    expect(s.replyToMismatch).toBe(false);
    expect(s.hasUnsubscribe).toBe(false);
    expect(s.precedenceBulk).toBe(false);
    expect(s.autoSubmitted).toBe(false);
    expect(s.authentication).toEqual({ spf: null, dkim: null, dmarc: null });
  });
});
