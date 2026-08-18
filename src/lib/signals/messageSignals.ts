// Header-derived fingerprint signals for a message — the cheap, private,
// reliable slice of the signal catalog (docs/plans/2026-07-12-signal-catalog-
// and-measurement.md). Pure and header-only: no bodies, no network. Thread- and
// MIME-derived signals come later, from the thread/full fetch.

import type { RawGmailMessage } from '../gmail/parseMessage';
import { senderAddressOf } from '../gmail/address';

export type AuthResult = 'pass' | 'fail' | 'neutral' | 'softfail' | 'none' | 'other';

/** Where the account address appears among the recipients. */
export type RecipientRole = 'to' | 'cc' | 'none' | 'unknown';

export interface MessageSignals {
  fromDomain: string;
  /** Canonical role keyword the local-part matches (noreply, support, …), or null. */
  rolePattern: string | null;
  /** The `+tag` on the sender's local-part, e.g. "news" for me+news@…, or null. */
  plusTag: string | null;
  replyToDomain: string | null;
  /** Reply-To domain differs from From domain — a common bulk-sender tell. */
  replyToMismatch: boolean;
  toCount: number;
  ccCount: number;
  /** Whether the account is in To, only in Cc, or neither; unknown without its address. */
  recipientRole: RecipientRole;
  listId: string | null;
  hasUnsubscribe: boolean;
  /** RFC 8058 one-click unsubscribe advertised. */
  oneClickUnsubscribe: boolean;
  precedenceBulk: boolean;
  autoSubmitted: boolean;
  authentication: { spf: AuthResult | null; dkim: AuthResult | null; dmarc: AuthResult | null };
  /** In-Reply-To / References present — this is a reply within a thread. */
  isReply: boolean;
}

// Local-part tokens that mark unattended / bulk senders. Matched after stripping
// separators, as a prefix so "noreply-123" and "no.reply" both hit "noreply".
const ROLE_TOKENS = [
  'noreply', 'donotreply', 'notifications', 'notification', 'mailerdaemon',
  'bounce', 'info', 'support', 'help', 'admin', 'contact', 'hello',
  'sales', 'marketing', 'newsletter', 'news', 'updates', 'alerts', 'alert', 'team',
];

function headerMap(raw: RawGmailMessage): Map<string, string> {
  const map = new Map<string, string>();
  for (const h of raw.payload?.headers ?? []) map.set(h.name.toLowerCase(), h.value);
  return map;
}

function domainOf(address: string): string {
  const at = address.lastIndexOf('@');
  return at >= 0 ? address.slice(at + 1).toLowerCase() : '';
}

function localPartOf(address: string): string {
  const at = address.indexOf('@');
  return (at >= 0 ? address.slice(0, at) : address).toLowerCase();
}

function rolePatternOf(localPart: string): string | null {
  const normalized = localPart.split('+')[0].replace(/[._-]/g, '');
  return ROLE_TOKENS.find((token) => normalized.startsWith(token)) ?? null;
}

function plusTagOf(localPart: string): string | null {
  const plus = localPart.indexOf('+');
  return plus >= 0 ? localPart.slice(plus + 1) || null : null;
}

/** Count comma-separated addresses in a To/Cc header (empty → 0). */
function addressCount(headerValue: string): number {
  const trimmed = headerValue.trim();
  return trimmed ? trimmed.split(',').filter((p) => p.trim()).length : 0;
}

function recipientRoleOf(
  toValue: string,
  ccValue: string,
  accountAddress: string | undefined,
): RecipientRole {
  if (!accountAddress) return 'unknown';
  const account = accountAddress.toLowerCase();
  const includes = (value: string) => value.toLowerCase().includes(account);
  if (includes(toValue)) return 'to';
  if (includes(ccValue)) return 'cc';
  return 'none';
}

const AUTH_RESULTS: AuthResult[] = ['pass', 'fail', 'neutral', 'softfail', 'none'];

/** Pull one mechanism's verdict out of an Authentication-Results header. */
function authResultFor(header: string, mechanism: string): AuthResult | null {
  const match = new RegExp(`\\b${mechanism}=([a-z]+)`, 'i').exec(header);
  if (!match) return null;
  const value = match[1].toLowerCase();
  return (AUTH_RESULTS as string[]).includes(value) ? (value as AuthResult) : 'other';
}

/**
 * Derive the header-only signals for a message. `accountAddress` (the signed-in
 * user's address) unlocks the To/Cc position signal; omit it and that stays
 * "unknown".
 */
export function deriveMessageSignals(
  raw: RawGmailMessage,
  accountAddress?: string,
): MessageSignals {
  const h = headerMap(raw);
  const get = (name: string) => h.get(name) ?? '';

  const fromAddress = senderAddressOf(get('from'));
  const fromLocal = localPartOf(fromAddress);
  const fromDomain = domainOf(fromAddress);

  const replyTo = get('reply-to');
  const replyToDomain = replyTo ? domainOf(senderAddressOf(replyTo)) : null;

  const auth = get('authentication-results');

  return {
    fromDomain,
    rolePattern: rolePatternOf(fromLocal),
    plusTag: plusTagOf(fromLocal),
    replyToDomain,
    replyToMismatch: replyToDomain !== null && replyToDomain !== fromDomain,
    toCount: addressCount(get('to')),
    ccCount: addressCount(get('cc')),
    recipientRole: recipientRoleOf(get('to'), get('cc'), accountAddress),
    listId: get('list-id') || null,
    hasUnsubscribe: h.has('list-unsubscribe'),
    oneClickUnsubscribe: h.has('list-unsubscribe-post'),
    precedenceBulk: /\b(bulk|list|junk)\b/i.test(get('precedence')),
    autoSubmitted: get('auto-submitted').trim().toLowerCase() !== ''
      && get('auto-submitted').trim().toLowerCase() !== 'no',
    authentication: {
      spf: authResultFor(auth, 'spf'),
      dkim: authResultFor(auth, 'dkim'),
      dmarc: authResultFor(auth, 'dmarc'),
    },
    isReply: h.has('in-reply-to') || h.has('references'),
  };
}
