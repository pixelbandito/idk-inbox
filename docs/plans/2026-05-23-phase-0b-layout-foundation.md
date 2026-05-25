# Phase 0b — Layout Framework & Read-Only Multi-Panel UX — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the Phase 0a single-screen inbox with a panel-based layout (Settings, label-viewers, threads), read-only, with sign-out + token-expiry handling. No row gestures, no Gmail writes — those come in a separate phase.

**Architecture:** One flat `Panel[]` array drives a horizontal flex container with scroll-snap. Panel content is type-discriminated (`settings | threadlist | thread`). Header swipes shift focus by ±1 panel; wide screens show multiple panels side by side; stashed panels collapse into a slim per-side column. Pure utilities are TDD'd; React components are TDD'd with React Testing Library; gesture/scroll feel is verified manually.

**Tech Stack:** React 18, Vite, TypeScript, Vitest + React Testing Library, Gmail REST API, Google Identity Services (already wired in 0a).

**Design doc:** `docs/plans/2026-05-23-phase-0b-layout-design.md`.

---

## Conventions

- **TDD where the skill applies.** Pure utilities and component rendering: failing test first, watch it fail, implement minimally, watch it pass, commit. Non-deterministic browser feel (smooth-scroll, gesture sensitivity) is verified manually with explicit steps.
- **Frequent commits.** One commit per task. Conventional-commit prefixes (`feat:`, `refactor:`, `chore:`, `test:`).
- **Every commit ends with this trailer** (shown once here, applies to all):
  ```
  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  ```
- **Working directory:** the worktree root `/Users/pixelbandito/Code/email/.worktrees/phase-0b-layout`. All paths below are relative to it.
- **Node 22.13+ required.** Run each npm/node command with the path prefix: `export PATH="/Users/pixelbandito/.nvm/versions/node/v22.13.0/bin:$PATH" && <cmd>` (shell state does not persist between calls).
- **Baseline at start:** 19 tests passing across 6 files, `npm run build` and `npm run lint` clean.

## Milestone overview

- **Milestone A — Library refactors + auth wiring** (Tasks 1–5). Pure-logic foundations. Existing 0a UI still works after each task.
- **Milestone B — Layout primitive** (Tasks 6–9). The flat-array engine, container, header swipe detection, and CSS.
- **Milestone C — Panel types** (Tasks 10–13). Settings, Threadlist, Thread, StashColumn.
- **Milestone D — Integration + verification** (Tasks 14–16). App rewrite, build verification, manual e2e.

---

# Milestone A — Library refactors + auth wiring

## Task 1: Generalize `fetchInbox` → `fetchByLabel`

**Files:**
- Create: `src/lib/gmail/fetchByLabel.ts`, `src/lib/gmail/fetchByLabel.test.ts`
- Delete: `src/lib/gmail/fetchInbox.ts`, `src/lib/gmail/fetchInbox.test.ts`
- Modify: `src/App.tsx` (update import + call site)

**Step 1: Write the failing test**

Create `src/lib/gmail/fetchByLabel.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchByLabel } from './fetchByLabel';

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

describe('fetchByLabel', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('lists by label then fetches and parses each', async () => {
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce(jsonResponse({ messages: [{ id: 'm1' }] }));
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        id: 'm1', threadId: 't1', snippet: 'hi', labelIds: ['INBOX', 'UNREAD'],
        payload: { headers: [{ name: 'Subject', value: 'Hello' }] },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchByLabel('token123', 'INBOX');

    expect(result.emails).toHaveLength(1);
    expect(result.emails[0].subject).toBe('Hello');
    expect(result.failed).toBe(0);

    const listUrl = fetchMock.mock.calls[0][0] as string;
    expect(listUrl).toContain('/messages?q=');
    expect(decodeURIComponent(listUrl)).toContain('label:"INBOX"');
    expect(fetchMock.mock.calls[1][0]).toContain('/messages/m1');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer token123');
  });

  it('quotes labels with slashes for nested names', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    await fetchByLabel('t', 'InboxZero/Snoozed');

    const listUrl = decodeURIComponent(fetchMock.mock.calls[0][0] as string);
    expect(listUrl).toContain('label:"InboxZero/Snoozed"');
  });

  it('returns an empty result when no messages match', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);
    expect(await fetchByLabel('t', 'INBOX')).toEqual({ emails: [], failed: 0 });
  });

  it('throws when the list request fails', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: false, status: 401 } as Response);
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchByLabel('bad', 'INBOX')).rejects.toThrow(/401/);
  });

  it('returns successful messages and a failed count on per-message 429', async () => {
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce(jsonResponse({ messages: [{ id: 'm1' }, { id: 'm2' }] }));
    fetchMock.mockResolvedValueOnce(jsonResponse({
      id: 'm1', threadId: 't1', snippet: 'ok', labelIds: ['INBOX'],
      payload: { headers: [{ name: 'Subject', value: 'A' }] },
    }));
    fetchMock.mockResolvedValueOnce({ ok: false, status: 429 } as Response);
    vi.stubGlobal('fetch', fetchMock);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await fetchByLabel('t', 'INBOX');
    expect(result.emails).toHaveLength(1);
    expect(result.failed).toBe(1);
    warnSpy.mockRestore();
  });
});
```

**Step 2: Run the test — expect FAIL**

`npm test -- fetchByLabel` → FAIL (module does not exist).

**Step 3: Write the implementation**

Create `src/lib/gmail/fetchByLabel.ts`:

```ts
import { parseGmailMessage, type RawGmailMessage } from './parseMessage';
import type { EmailSummary } from './types';

const BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

function authHeaders(token: string) {
  return { headers: { Authorization: `Bearer ${token}` } };
}

export interface LabelFetchResult {
  emails: EmailSummary[];
  failed: number;
}

export async function fetchByLabel(
  token: string,
  label: string,
  maxResults = 25,
): Promise<LabelFetchResult> {
  const q = `label:"${label}"`;
  const listUrl = `${BASE}/messages?q=${encodeURIComponent(q)}&maxResults=${maxResults}`;

  const listRes = await fetch(listUrl, authHeaders(token));
  if (!listRes.ok) throw new Error(`Gmail list failed: ${listRes.status}`);

  const listJson = (await listRes.json()) as { messages?: { id: string }[] };
  const ids = listJson.messages ?? [];

  // format=metadata still returns labelIds, which parseGmailMessage needs for
  // the unread flag — keep that if changing this param.
  const settled = await Promise.allSettled(
    ids.map(async ({ id }) => {
      const res = await fetch(
        `${BASE}/messages/${id}?format=metadata` +
          `&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
        authHeaders(token),
      );
      if (!res.ok) throw new Error(`Gmail get failed: ${res.status}`);
      return (await res.json()) as RawGmailMessage;
    }),
  );

  const emails: EmailSummary[] = [];
  let failed = 0;
  for (const r of settled) {
    if (r.status === 'fulfilled') emails.push(parseGmailMessage(r.value));
    else {
      failed++;
      console.warn('Gmail message fetch failed:', r.reason);
    }
  }
  return { emails, failed };
}
```

**Step 4: Update App.tsx to call the new function**

In `src/App.tsx`:
- Change `import { fetchInbox } from './lib/gmail/fetchInbox';` →
  `import { fetchByLabel } from './lib/gmail/fetchByLabel';`
- Change the call `await fetchInbox(token)` → `await fetchByLabel(token, 'INBOX')`.

**Step 5: Delete the old files**

```bash
rm src/lib/gmail/fetchInbox.ts src/lib/gmail/fetchInbox.test.ts
```

**Step 6: Run the full suite and build**

`npm test` → expect 6 files, 19 tests pass (count unchanged: 5 fetchByLabel tests replace the 4 fetchInbox tests plus 1 new — adjust to whatever passes). Actually: 5 new tests for fetchByLabel; original suite drops 4. Net: 19 - 4 + 5 = 20 tests.
`npm run build` → clean.

**Step 7: Commit**

```
refactor: generalize fetchInbox into fetchByLabel(token, label)
```

---

## Task 2: `labelBootstrap` — ensure app labels exist

**Files:**
- Create: `src/lib/gmail/labelBootstrap.ts`, `src/lib/gmail/labelBootstrap.test.ts`

**Step 1: Write the failing test**

Create `src/lib/gmail/labelBootstrap.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ensureAppLabels, APP_LABEL, SNOOZED_LABEL } from './labelBootstrap';

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

describe('ensureAppLabels', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('exports the canonical label names', () => {
    expect(APP_LABEL).toBe('InboxZero');
    expect(SNOOZED_LABEL).toBe('InboxZero/Snoozed');
  });

  it('creates both labels when neither exists', async () => {
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce(jsonResponse({ labels: [{ id: 'l1', name: 'INBOX' }] }));
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 'lz', name: 'InboxZero' }));
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 'lzs', name: 'InboxZero/Snoozed' }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await ensureAppLabels('token');

    expect(result.created.sort()).toEqual(['InboxZero', 'InboxZero/Snoozed']);
    expect(fetchMock.mock.calls).toHaveLength(3); // list + 2 creates
    // creates are POST to /labels
    expect(fetchMock.mock.calls[1][1].method).toBe('POST');
    const body1 = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(body1.name).toBe('InboxZero');
  });

  it('creates only the missing label when one exists', async () => {
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce(jsonResponse({
      labels: [{ id: 'l1', name: 'INBOX' }, { id: 'lz', name: 'InboxZero' }],
    }));
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 'lzs', name: 'InboxZero/Snoozed' }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await ensureAppLabels('token');

    expect(result.created).toEqual(['InboxZero/Snoozed']);
    expect(fetchMock.mock.calls).toHaveLength(2);
  });

  it('returns empty created when both labels already exist (idempotent)', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({
      labels: [
        { id: 'lz', name: 'InboxZero' },
        { id: 'lzs', name: 'InboxZero/Snoozed' },
      ],
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await ensureAppLabels('token');
    expect(result.created).toEqual([]);
    expect(fetchMock.mock.calls).toHaveLength(1); // only list
  });

  it('throws when the list call fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: false, status: 401 } as Response));
    await expect(ensureAppLabels('bad')).rejects.toThrow(/401/);
  });
});
```

**Step 2: Run — expect FAIL**

`npm test -- labelBootstrap` → FAIL.

**Step 3: Write the implementation**

Create `src/lib/gmail/labelBootstrap.ts`:

```ts
export const APP_LABEL = 'InboxZero';
export const SNOOZED_LABEL = 'InboxZero/Snoozed';

const BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

interface GmailLabel {
  id: string;
  name: string;
}

interface ListLabelsResponse {
  labels?: GmailLabel[];
}

export interface BootstrapResult {
  created: string[];
}

async function listLabels(token: string): Promise<GmailLabel[]> {
  const res = await fetch(`${BASE}/labels`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Gmail labels list failed: ${res.status}`);
  const json = (await res.json()) as ListLabelsResponse;
  return json.labels ?? [];
}

async function createLabel(token: string, name: string): Promise<void> {
  const res = await fetch(`${BASE}/labels`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(`Gmail label create failed: ${res.status}`);
}

export async function ensureAppLabels(token: string): Promise<BootstrapResult> {
  const existing = await listLabels(token);
  const names = new Set(existing.map((l) => l.name));

  const created: string[] = [];
  for (const wanted of [APP_LABEL, SNOOZED_LABEL]) {
    if (!names.has(wanted)) {
      await createLabel(token, wanted);
      created.push(wanted);
    }
  }
  return { created };
}
```

**Step 4: Run — expect PASS** (5 tests).

**Step 5: Full suite + commit**

`npm test` → all pass.
Commit message: `feat: add label bootstrap for InboxZero namespace`.

---

## Task 3: `threadParse` — extract plain text from a Gmail payload

**Files:**
- Create: `src/lib/gmail/threadParse.ts`, `src/lib/gmail/threadParse.test.ts`

**Step 1: Write the failing test**

Create `src/lib/gmail/threadParse.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { extractPlainText, base64UrlDecode } from './threadParse';

function b64url(s: string): string {
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

describe('base64UrlDecode', () => {
  it('decodes URL-safe base64 (with - and _)', () => {
    const encoded = b64url('Hello, world! +/=');
    expect(base64UrlDecode(encoded)).toBe('Hello, world! +/=');
  });

  it('handles missing padding', () => {
    const encoded = b64url('hi'); // 2-byte input, unpadded
    expect(base64UrlDecode(encoded)).toBe('hi');
  });

  it('returns empty for empty input', () => {
    expect(base64UrlDecode('')).toBe('');
  });
});

describe('extractPlainText', () => {
  it('extracts a top-level text/plain body', () => {
    const payload = {
      mimeType: 'text/plain',
      body: { data: b64url('Hello there') },
    };
    expect(extractPlainText(payload)).toBe('Hello there');
  });

  it('finds text/plain inside multipart', () => {
    const payload = {
      mimeType: 'multipart/alternative',
      parts: [
        { mimeType: 'text/html', body: { data: b64url('<p>html</p>') } },
        { mimeType: 'text/plain', body: { data: b64url('plain text') } },
      ],
    };
    expect(extractPlainText(payload)).toBe('plain text');
  });

  it('recurses into nested multipart', () => {
    const payload = {
      mimeType: 'multipart/mixed',
      parts: [
        {
          mimeType: 'multipart/alternative',
          parts: [
            { mimeType: 'text/plain', body: { data: b64url('nested plain') } },
          ],
        },
      ],
    };
    expect(extractPlainText(payload)).toBe('nested plain');
  });

  it('falls back to text/html with tags stripped', () => {
    const payload = {
      mimeType: 'text/html',
      body: { data: b64url('<p>hello <b>world</b></p>') },
    };
    expect(extractPlainText(payload)).toBe('hello world');
  });

  it('returns empty string when no body present', () => {
    expect(extractPlainText({ mimeType: 'text/plain' })).toBe('');
    expect(extractPlainText(undefined)).toBe('');
  });
});
```

**Step 2: Run — expect FAIL**

**Step 3: Write the implementation**

Create `src/lib/gmail/threadParse.ts`:

```ts
export function base64UrlDecode(s: string): string {
  if (!s) return '';
  // Convert URL-safe alphabet back to standard base64.
  let b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  // Pad to a multiple of 4.
  const pad = b64.length % 4;
  if (pad) b64 += '='.repeat(4 - pad);
  // atob → binary string → decode as UTF-8.
  const binary = atob(b64);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder('utf-8').decode(bytes);
}

interface MessagePart {
  mimeType?: string;
  body?: { data?: string };
  parts?: MessagePart[];
}

function findPart(
  part: MessagePart | undefined,
  predicate: (p: MessagePart) => boolean,
): MessagePart | null {
  if (!part) return null;
  if (predicate(part)) return part;
  for (const sub of part.parts ?? []) {
    const found = findPart(sub, predicate);
    if (found) return found;
  }
  return null;
}

function stripTags(html: string): string {
  return html
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim();
}

export function extractPlainText(payload: MessagePart | undefined): string {
  const plain = findPart(payload, (p) => p.mimeType === 'text/plain' && !!p.body?.data);
  if (plain) return base64UrlDecode(plain.body!.data!);

  const html = findPart(payload, (p) => p.mimeType === 'text/html' && !!p.body?.data);
  if (html) return stripTags(base64UrlDecode(html.body!.data!));

  return '';
}
```

**Step 4: Run — expect PASS** (8 tests).

**Step 5: Full suite + commit**

`npm test` → all pass.
Commit: `feat: add Gmail thread text extraction`.

---

## Task 4: `fetchThread`

**Files:**
- Create: `src/lib/gmail/fetchThread.ts`, `src/lib/gmail/fetchThread.test.ts`

**Step 1: Write the failing test**

Create `src/lib/gmail/fetchThread.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchThread } from './fetchThread';

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

function b64url(s: string): string {
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

describe('fetchThread', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('fetches a thread and parses each message', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({
      id: 't1',
      messages: [
        {
          id: 'm1',
          payload: {
            headers: [
              { name: 'From', value: 'Alice <a@x.com>' },
              { name: 'To', value: 'Bob <b@x.com>' },
              { name: 'Subject', value: 'Hello' },
              { name: 'Date', value: 'Fri, 16 May 2026 14:00:00 -0700' },
            ],
            mimeType: 'text/plain',
            body: { data: b64url('hi there') },
          },
        },
        {
          id: 'm2',
          payload: {
            headers: [
              { name: 'From', value: 'Bob <b@x.com>' },
              { name: 'Subject', value: 'Re: Hello' },
              { name: 'Date', value: 'Fri, 16 May 2026 15:00:00 -0700' },
            ],
            mimeType: 'text/plain',
            body: { data: b64url('hey back') },
          },
        },
      ],
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchThread('token', 't1');

    expect(result.id).toBe('t1');
    expect(result.subject).toBe('Hello');
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0].from).toBe('Alice <a@x.com>');
    expect(result.messages[0].body).toBe('hi there');
    expect(result.messages[1].body).toBe('hey back');

    expect(fetchMock.mock.calls[0][0]).toContain('/threads/t1?format=full');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer token');
  });

  it('throws when the thread fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: false, status: 404 } as Response));
    await expect(fetchThread('t', 'x')).rejects.toThrow(/404/);
  });

  it('tolerates missing headers and an empty body', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({
      id: 't2',
      messages: [{ id: 'm1', payload: {} }],
    }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await fetchThread('t', 't2');
    expect(result.messages[0].from).toBe('');
    expect(result.messages[0].body).toBe('');
    expect(result.subject).toBe('');
  });
});
```

**Step 2: Run — expect FAIL**

**Step 3: Write the implementation**

Create `src/lib/gmail/fetchThread.ts`:

```ts
import { extractPlainText } from './threadParse';

const BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

interface RawHeader { name: string; value: string }
interface RawPayload {
  headers?: RawHeader[];
  mimeType?: string;
  body?: { data?: string };
  parts?: RawPayload[];
}
interface RawMessage {
  id: string;
  payload?: RawPayload;
}
interface RawThread {
  id: string;
  messages?: RawMessage[];
}

export interface ThreadMessage {
  id: string;
  from: string;
  to: string;
  date: string;
  body: string;
}

export interface ThreadView {
  id: string;
  subject: string;
  messages: ThreadMessage[];
}

function header(headers: RawHeader[] | undefined, name: string): string {
  const h = (headers ?? []).find((x) => x.name.toLowerCase() === name.toLowerCase());
  return h ? h.value : '';
}

function parseMessage(raw: RawMessage): ThreadMessage {
  const headers = raw.payload?.headers ?? [];
  return {
    id: raw.id,
    from: header(headers, 'From'),
    to: header(headers, 'To'),
    date: header(headers, 'Date'),
    body: extractPlainText(raw.payload),
  };
}

export async function fetchThread(token: string, threadId: string): Promise<ThreadView> {
  const res = await fetch(`${BASE}/threads/${threadId}?format=full`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Gmail thread fetch failed: ${res.status}`);

  const raw = (await res.json()) as RawThread;
  const messages = (raw.messages ?? []).map(parseMessage);
  const subject = messages.length > 0
    ? header(raw.messages![0].payload?.headers, 'Subject')
    : '';

  return { id: raw.id, subject, messages };
}
```

**Step 4: Run — expect PASS** (3 tests).

**Step 5: Full suite + commit**

Commit: `feat: add fetchThread for read-only thread display`.

---

## Task 5: Add `signOut` + session-validity to `useGoogleAuth`

**Files:**
- Modify: `src/lib/auth/useGoogleAuth.ts`, `src/lib/auth/tokenStore.ts` (export a small subscribe API for reactivity)

The Phase 0a `useGoogleAuth` exposes `signedIn / error / signIn / getToken`. Phase 0b adds:
- `signOut()` — clears the token + flips `signedIn` to `false`.
- Session validity: `getToken()` returns `null` and flips `signedIn` to `false` when the stored token has expired (per `TokenStore.isValid()`).

`TokenStore` is in a module-level singleton; React state needs to be updated when the token changes from outside. Simplest workable approach: `useGoogleAuth` reads validity on every `getToken()` call, and flips `signedIn` via a `useState` setter if it observes invalidity.

**Step 1: Update `src/lib/auth/useGoogleAuth.ts`**

Replace the file with:

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { GOOGLE_CLIENT_ID, GMAIL_SCOPE } from '../config';
import { TokenStore } from './tokenStore';
import { loadGis } from './loadGis';

const tokenStore = new TokenStore();

export function useGoogleAuth() {
  const [signedIn, setSignedIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clientRef = useRef<google.accounts.oauth2.TokenClient | null>(null);

  // Warm up the GIS library so sign-in is instant.
  useEffect(() => {
    loadGis().catch(() => {});
  }, []);

  const signIn = useCallback(async () => {
    try {
      await loadGis();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load Google sign-in.');
      return;
    }

    if (!clientRef.current) {
      clientRef.current = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: GMAIL_SCOPE,
        callback: (resp) => {
          if (resp.error) {
            setError(resp.error);
            return;
          }
          tokenStore.set(resp.access_token, Number(resp.expires_in));
          setError(null);
          setSignedIn(true);
        },
      });
    }
    clientRef.current.requestAccessToken();
  }, []);

  const signOut = useCallback(() => {
    tokenStore.clear();
    clientRef.current = null;
    setError(null);
    setSignedIn(false);
  }, []);

  const getToken = useCallback(() => {
    if (!tokenStore.isValid()) {
      // Token expired or absent — drop the session so the UI prompts re-auth.
      if (signedIn) setSignedIn(false);
      return null;
    }
    return tokenStore.get()?.accessToken ?? null;
  }, [signedIn]);

  return { signedIn, error, signIn, signOut, getToken };
}
```

**Step 2: Verify with the existing suite + build**

`npm test` → existing tests still pass (no new tests in this task; the hook is integration-verified).
`npm run build` → clean.

**Step 3: Commit**

Commit: `feat: add signOut and session-validity to useGoogleAuth`.

---

# Milestone B — Layout primitive

## Task 6: Panel types + pure layout operations (TDD)

**Files:**
- Create: `src/layout/types.ts`, `src/layout/operations.ts`, `src/layout/operations.test.ts`

**Step 1: Create the type module**

Create `src/layout/types.ts`:

```ts
export type Panel =
  | { kind: 'settings' }
  | { kind: 'threadlist'; label: string }
  | { kind: 'thread'; threadId: string; sourceLabel: string };

export type PanelKind = Panel['kind'];
```

**Step 2: Write the failing test for operations**

Create `src/layout/operations.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { openThread, closeAt } from './operations';
import type { Panel } from './types';

const settings: Panel = { kind: 'settings' };
const inbox: Panel = { kind: 'threadlist', label: 'INBOX' };
const snoozed: Panel = { kind: 'threadlist', label: 'InboxZero/Snoozed' };
const thread = (id: string, src: string): Panel => ({ kind: 'thread', threadId: id, sourceLabel: src });

describe('openThread', () => {
  it('inserts a new thread panel immediately after the source threadlist', () => {
    const before: Panel[] = [settings, inbox, snoozed];
    const after = openThread(before, 'INBOX', 'tA');
    expect(after).toEqual([settings, inbox, thread('tA', 'INBOX'), snoozed]);
  });

  it('places a newer thread between the threadlist and existing same-source threads', () => {
    const before: Panel[] = [settings, inbox, thread('tA', 'INBOX'), snoozed];
    const after = openThread(before, 'INBOX', 'tB');
    expect(after).toEqual([
      settings, inbox, thread('tB', 'INBOX'), thread('tA', 'INBOX'), snoozed,
    ]);
  });

  it('throws when the source threadlist is not present', () => {
    const before: Panel[] = [settings, inbox];
    expect(() => openThread(before, 'NoSuch', 't1')).toThrow();
  });
});

describe('closeAt', () => {
  it('removes the panel at the given index', () => {
    const before: Panel[] = [settings, inbox, thread('tA', 'INBOX'), snoozed];
    const after = closeAt(before, 2);
    expect(after).toEqual([settings, inbox, snoozed]);
  });

  it('is a no-op when the index is out of range', () => {
    const before: Panel[] = [settings, inbox];
    expect(closeAt(before, 5)).toEqual(before);
    expect(closeAt(before, -1)).toEqual(before);
  });
});
```

**Step 3: Run — expect FAIL**

**Step 4: Implementation**

Create `src/layout/operations.ts`:

```ts
import type { Panel } from './types';

export function openThread(panels: Panel[], sourceLabel: string, threadId: string): Panel[] {
  const idx = panels.findIndex(
    (p) => p.kind === 'threadlist' && p.label === sourceLabel,
  );
  if (idx === -1) {
    throw new Error(`openThread: no threadlist panel with label ${sourceLabel}`);
  }
  const next: Panel = { kind: 'thread', threadId, sourceLabel };
  return [...panels.slice(0, idx + 1), next, ...panels.slice(idx + 1)];
}

export function closeAt(panels: Panel[], index: number): Panel[] {
  if (index < 0 || index >= panels.length) return panels;
  return [...panels.slice(0, index), ...panels.slice(index + 1)];
}
```

**Step 5: Run — expect PASS** (5 tests).

**Step 6: Commit**

`feat: add Panel types and pure layout operations`.

---

## Task 7: `LayoutContainer` component (TDD-ish for structure, manual for scroll)

**Files:**
- Create: `src/layout/LayoutContainer.tsx`, `src/layout/LayoutContainer.test.tsx`
- (Panel-type stub components for tests — defined inline in the test.)

The container renders the panel array and exposes callbacks for opening/closing threads. For test isolation it accepts a `renderPanel(panel, props)` prop so tests can use stubs. The real wiring of Settings/Threadlist/Thread happens in Task 14.

**Step 1: Failing test**

Create `src/layout/LayoutContainer.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LayoutContainer } from './LayoutContainer';
import type { Panel } from './types';

function stubRender(panel: Panel, _index: number, _props: { onOpenThread: (label: string, id: string) => void; onClose: () => void }) {
  if (panel.kind === 'settings') return <div data-testid="p-settings">settings</div>;
  if (panel.kind === 'threadlist') return <div data-testid={`p-threadlist-${panel.label}`}>list {panel.label}</div>;
  return <div data-testid={`p-thread-${panel.threadId}`}>thread {panel.threadId}</div>;
}

const initial: Panel[] = [
  { kind: 'settings' },
  { kind: 'threadlist', label: 'INBOX' },
  { kind: 'threadlist', label: 'InboxZero/Snoozed' },
];

describe('LayoutContainer', () => {
  it('renders one section per panel in order', () => {
    const { container } = render(<LayoutContainer initialPanels={initial} renderPanel={stubRender} />);
    const sections = container.querySelectorAll('main.panels > section.panel');
    expect(sections).toHaveLength(3);
    expect(sections[0].getAttribute('data-kind')).toBe('settings');
    expect(sections[1].getAttribute('data-kind')).toBe('threadlist');
    expect(sections[1].getAttribute('data-label')).toBe('INBOX');
    expect(sections[2].getAttribute('data-label')).toBe('InboxZero/Snoozed');
  });

  it('inserts a thread panel via the onOpenThread callback', () => {
    const captured: { open?: (label: string, id: string) => void } = {};
    function captureRender(panel: Panel, idx: number, props: { onOpenThread: (label: string, id: string) => void; onClose: () => void }) {
      if (panel.kind === 'threadlist' && panel.label === 'INBOX') {
        captured.open = props.onOpenThread;
      }
      return stubRender(panel, idx, props);
    }
    render(<LayoutContainer initialPanels={initial} renderPanel={captureRender} />);
    captured.open!('INBOX', 'tA');

    expect(screen.getByTestId('p-thread-tA')).toBeInTheDocument();
    // Verify position: thread inserted between INBOX and Snoozed.
    const sections = document.querySelectorAll('main.panels > section.panel');
    expect(sections[2].getAttribute('data-thread-id')).toBe('tA');
  });

  it('removes a thread via onClose', () => {
    let closeFn: (() => void) | undefined;
    function captureRender(panel: Panel, idx: number, props: { onOpenThread: (label: string, id: string) => void; onClose: () => void }) {
      if (panel.kind === 'thread') closeFn = props.onClose;
      return stubRender(panel, idx, props);
    }
    const withThread: Panel[] = [
      { kind: 'settings' },
      { kind: 'threadlist', label: 'INBOX' },
      { kind: 'thread', threadId: 'tA', sourceLabel: 'INBOX' },
      { kind: 'threadlist', label: 'InboxZero/Snoozed' },
    ];
    render(<LayoutContainer initialPanels={withThread} renderPanel={captureRender} />);
    expect(screen.getByTestId('p-thread-tA')).toBeInTheDocument();
    closeFn!();
    expect(screen.queryByTestId('p-thread-tA')).toBeNull();
  });
});
```

**Step 2: Run — expect FAIL**

**Step 3: Implementation**

Create `src/layout/LayoutContainer.tsx`:

```tsx
import { useCallback, useState, type ReactNode } from 'react';
import type { Panel } from './types';
import { openThread, closeAt } from './operations';

export interface PanelRenderProps {
  onOpenThread: (sourceLabel: string, threadId: string) => void;
  onClose: () => void;
}

export interface LayoutContainerProps {
  initialPanels: Panel[];
  renderPanel: (panel: Panel, index: number, props: PanelRenderProps) => ReactNode;
}

function dataAttrs(panel: Panel): Record<string, string> {
  if (panel.kind === 'settings') return { 'data-kind': 'settings' };
  if (panel.kind === 'threadlist')
    return { 'data-kind': 'threadlist', 'data-label': panel.label };
  return {
    'data-kind': 'thread',
    'data-thread-id': panel.threadId,
    'data-source-label': panel.sourceLabel,
  };
}

function panelKey(panel: Panel, index: number): string {
  if (panel.kind === 'settings') return 'settings';
  if (panel.kind === 'threadlist') return `tl:${panel.label}`;
  return `th:${panel.threadId}:${index}`;
}

export function LayoutContainer({ initialPanels, renderPanel }: LayoutContainerProps) {
  const [panels, setPanels] = useState<Panel[]>(initialPanels);

  const handleOpenThread = useCallback((sourceLabel: string, threadId: string) => {
    setPanels((p) => openThread(p, sourceLabel, threadId));
  }, []);

  const handleCloseAt = useCallback((index: number) => {
    setPanels((p) => closeAt(p, index));
  }, []);

  return (
    <main className="panels" role="region" aria-label="Workspace">
      {panels.map((panel, i) => (
        <section
          key={panelKey(panel, i)}
          className="panel"
          {...dataAttrs(panel)}
        >
          {renderPanel(panel, i, {
            onOpenThread: handleOpenThread,
            onClose: () => handleCloseAt(i),
          })}
        </section>
      ))}
    </main>
  );
}
```

**Step 4: Run — expect PASS** (3 tests).

**Step 5: Commit**

`feat: add LayoutContainer rendering Panel[] in order`.

---

## Task 8: `PanelHeader` with swipe-to-focus-change (TDD with pointer events)

**Files:**
- Create: `src/layout/PanelHeader.tsx`, `src/layout/PanelHeader.test.tsx`

**Step 1: Failing test**

Create `src/layout/PanelHeader.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PanelHeader } from './PanelHeader';

describe('PanelHeader', () => {
  it('renders the title', () => {
    render(<PanelHeader title="Inbox" onSwipeLeft={() => {}} onSwipeRight={() => {}} />);
    expect(screen.getByRole('heading', { name: 'Inbox' })).toBeInTheDocument();
  });

  it('fires onSwipeLeft when the user drags far enough leftward', () => {
    const left = vi.fn();
    const right = vi.fn();
    render(<PanelHeader title="Inbox" onSwipeLeft={left} onSwipeRight={right} />);
    const header = screen.getByRole('banner');
    fireEvent.pointerDown(header, { clientX: 300, pointerId: 1 });
    fireEvent.pointerMove(header, { clientX: 100, pointerId: 1 });
    fireEvent.pointerUp(header, { clientX: 100, pointerId: 1 });
    expect(left).toHaveBeenCalledTimes(1);
    expect(right).not.toHaveBeenCalled();
  });

  it('fires onSwipeRight when the user drags far enough rightward', () => {
    const left = vi.fn();
    const right = vi.fn();
    render(<PanelHeader title="Inbox" onSwipeLeft={left} onSwipeRight={right} />);
    const header = screen.getByRole('banner');
    fireEvent.pointerDown(header, { clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(header, { clientX: 300, pointerId: 1 });
    fireEvent.pointerUp(header, { clientX: 300, pointerId: 1 });
    expect(right).toHaveBeenCalledTimes(1);
    expect(left).not.toHaveBeenCalled();
  });

  it('does not fire when the drag is below threshold', () => {
    const left = vi.fn();
    const right = vi.fn();
    render(<PanelHeader title="Inbox" onSwipeLeft={left} onSwipeRight={right} />);
    const header = screen.getByRole('banner');
    fireEvent.pointerDown(header, { clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(header, { clientX: 130, pointerId: 1 });
    fireEvent.pointerUp(header, { clientX: 130, pointerId: 1 });
    expect(left).not.toHaveBeenCalled();
    expect(right).not.toHaveBeenCalled();
  });
});
```

**Step 2: Run — expect FAIL**

**Step 3: Implementation**

Create `src/layout/PanelHeader.tsx`:

```tsx
import { useRef, type PointerEvent, type ReactNode } from 'react';

const SWIPE_THRESHOLD_PX = 60;

export interface PanelHeaderProps {
  title: string;
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  actions?: ReactNode;
}

export function PanelHeader({ title, onSwipeLeft, onSwipeRight, actions }: PanelHeaderProps) {
  const startX = useRef<number | null>(null);

  function handleDown(e: PointerEvent<HTMLElement>) {
    startX.current = e.clientX;
  }

  function handleUp(e: PointerEvent<HTMLElement>) {
    if (startX.current === null) return;
    const dx = e.clientX - startX.current;
    startX.current = null;
    if (Math.abs(dx) < SWIPE_THRESHOLD_PX) return;
    if (dx < 0) onSwipeLeft();
    else onSwipeRight();
  }

  return (
    <header
      className="panel__header"
      role="banner"
      onPointerDown={handleDown}
      onPointerUp={handleUp}
      onPointerCancel={() => { startX.current = null; }}
    >
      <h2 className="panel__title">{title}</h2>
      {actions && <div className="panel__actions">{actions}</div>}
    </header>
  );
}
```

**Step 4: Run — expect PASS** (4 tests).

**Step 5: Commit**

`feat: add PanelHeader with swipe-to-focus-change`.

---

## Task 9: Layout engine CSS

**Files:**
- Modify: `src/index.css`

Append the layout-engine rules. Replace the entire existing file content with:

```css
:root {
  font-family: system-ui, sans-serif;
  line-height: 1.5;
  color-scheme: light;
}

* { box-sizing: border-box; }

body { margin: 0; }

/* ----- Layout primitive ----- */

.panels {
  display: flex;
  flex-direction: row;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  scroll-behavior: smooth;
  height: 100dvh;
}

.panel {
  flex: 0 0 var(--w, 100dvw);
  scroll-snap-align: start;
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-right: 1px solid #eee;
}

.panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid #eee;
  background: #fafafa;
  touch-action: pan-y;       /* horizontal drags are swipe; vertical scrolls page */
  user-select: none;
}

.panel__title {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
}

.panel__actions {
  display: flex;
  gap: 0.5rem;
}

.panel__body {
  flex: 1;
  overflow-y: auto;
  overscroll-behavior-y: contain;
  min-height: 0;
}

@media (min-width: 768px) {
  .panel { --w: 420px; }
  .panel[data-kind="thread"] { --w: 560px; }
}

/* ----- Inbox list rows (carried from 0a) ----- */

.inbox-list { list-style: none; padding: 0; margin: 0; }
.email {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding: 0.75rem 0.75rem;
  border-bottom: 1px solid #eee;
}
.email--unread { font-weight: 600; background: #f6f9ff; }
.email__from { font-size: 0.85rem; color: #555; }
.email__snippet { font-size: 0.85rem; color: #888; }

.error { color: #c0392b; padding: 0 1rem; }

/* ----- Stash column (Task 13) ----- */

.stash-column {
  flex: 0 0 44px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #f3f3f3;
  border-right: 1px solid #ddd;
  font-size: 0.85rem;
  color: #555;
  cursor: pointer;
}
.stash-column__count {
  font-weight: 600;
}
```

Verify with `npm run build` (succeeds) and a manual `npm run dev` glance.

Commit: `feat: layout engine CSS and panel chrome`.

---

# Milestone C — Panel types

## Task 10: `SettingsPanel`

**Files:**
- Create: `src/panels/SettingsPanel.tsx`, `src/panels/SettingsPanel.test.tsx`

**Step 1: Failing test**

Create `src/panels/SettingsPanel.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SettingsPanel } from './SettingsPanel';

describe('SettingsPanel', () => {
  it('shows the sign-in button when signed out', () => {
    const signIn = vi.fn();
    render(<SettingsPanel signedIn={false} onSignIn={signIn} onSignOut={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(signIn).toHaveBeenCalledTimes(1);
  });

  it('shows the sign-out button when signed in', () => {
    const signOut = vi.fn();
    render(<SettingsPanel signedIn={true} onSignIn={vi.fn()} onSignOut={signOut} />);
    fireEvent.click(screen.getByRole('button', { name: /sign out/i }));
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('renders the panel header with the "Settings" title', () => {
    render(<SettingsPanel signedIn={false} onSignIn={vi.fn()} onSignOut={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
  });
});
```

**Step 2: Run — expect FAIL**

**Step 3: Implementation**

Create `src/panels/SettingsPanel.tsx`:

```tsx
import { PanelHeader } from '../layout/PanelHeader';

export interface SettingsPanelProps {
  signedIn: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
}

export function SettingsPanel({
  signedIn,
  onSignIn,
  onSignOut,
  onSwipeLeft = () => {},
  onSwipeRight = () => {},
}: SettingsPanelProps) {
  return (
    <>
      <PanelHeader title="Settings" onSwipeLeft={onSwipeLeft} onSwipeRight={onSwipeRight} />
      <div className="panel__body" style={{ padding: '1rem' }}>
        {signedIn ? (
          <>
            <p>Signed in.</p>
            <button onClick={onSignOut}>Sign out</button>
          </>
        ) : (
          <>
            <p>Not signed in.</p>
            <button onClick={onSignIn}>Sign in with Google</button>
          </>
        )}
      </div>
    </>
  );
}
```

**Step 4: Run — expect PASS** (3 tests).

**Step 5: Commit**

`feat: add SettingsPanel with sign-in/sign-out`.

---

## Task 11: `ThreadlistPanel`

**Files:**
- Create: `src/panels/ThreadlistPanel.tsx`, `src/panels/ThreadlistPanel.test.tsx`

**Step 1: Failing test**

Create `src/panels/ThreadlistPanel.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThreadlistPanel } from './ThreadlistPanel';
import type { EmailSummary } from '../lib/gmail/types';

vi.mock('../lib/gmail/fetchByLabel', () => ({
  fetchByLabel: vi.fn(),
}));
import { fetchByLabel } from '../lib/gmail/fetchByLabel';

const emails: EmailSummary[] = [
  { id: 'm1', threadId: 't1', from: 'Alice', subject: 'Lunch?', snippet: 'hey', date: '', unread: true },
  { id: 'm2', threadId: 't2', from: 'Bob', subject: 'Report', snippet: 'done', date: '', unread: false },
];

describe('ThreadlistPanel', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows a sign-in prompt when no token is available', () => {
    render(
      <ThreadlistPanel
        label="INBOX"
        displayName="Inbox"
        getToken={() => null}
        onOpenThread={vi.fn()}
      />,
    );
    expect(screen.getByText(/sign in/i)).toBeInTheDocument();
  });

  it('fetches and renders rows on mount when a token is available', async () => {
    (fetchByLabel as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ emails, failed: 0 });
    render(
      <ThreadlistPanel
        label="INBOX"
        displayName="Inbox"
        getToken={() => 'tok'}
        onOpenThread={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText('Lunch?')).toBeInTheDocument());
    expect(screen.getByText('Report')).toBeInTheDocument();
    expect(fetchByLabel).toHaveBeenCalledWith('tok', 'INBOX');
  });

  it('tapping a row calls onOpenThread with the source label and threadId', async () => {
    (fetchByLabel as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ emails, failed: 0 });
    const open = vi.fn();
    render(
      <ThreadlistPanel
        label="INBOX"
        displayName="Inbox"
        getToken={() => 'tok'}
        onOpenThread={open}
      />,
    );
    await waitFor(() => screen.getByText('Lunch?'));
    fireEvent.click(screen.getByText('Lunch?').closest('li')!);
    expect(open).toHaveBeenCalledWith('INBOX', 't1');
  });

  it('shows the empty state when there are no emails', async () => {
    (fetchByLabel as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ emails: [], failed: 0 });
    render(
      <ThreadlistPanel
        label="INBOX"
        displayName="Inbox"
        getToken={() => 'tok'}
        onOpenThread={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText(/no messages|inbox zero/i)).toBeInTheDocument());
  });

  it('shows the failed-count line when some messages fail to load', async () => {
    (fetchByLabel as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ emails, failed: 1 });
    render(
      <ThreadlistPanel
        label="INBOX"
        displayName="Inbox"
        getToken={() => 'tok'}
        onOpenThread={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText(/1 message.*failed/i)).toBeInTheDocument());
  });
});
```

**Step 2: Run — expect FAIL**

**Step 3: Implementation**

Create `src/panels/ThreadlistPanel.tsx`:

```tsx
import { useCallback, useEffect, useState } from 'react';
import { PanelHeader } from '../layout/PanelHeader';
import { fetchByLabel } from '../lib/gmail/fetchByLabel';
import type { EmailSummary } from '../lib/gmail/types';

export interface ThreadlistPanelProps {
  label: string;
  displayName: string;
  getToken: () => string | null;
  onOpenThread: (sourceLabel: string, threadId: string) => void;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
}

export function ThreadlistPanel({
  label,
  displayName,
  getToken,
  onOpenThread,
  onSwipeLeft = () => {},
  onSwipeRight = () => {},
}: ThreadlistPanelProps) {
  const [emails, setEmails] = useState<EmailSummary[]>([]);
  const [failed, setFailed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    setLoading(true);
    setError(null);
    setFailed(0);
    try {
      const result = await fetchByLabel(token, label);
      setEmails(result.emails);
      setFailed(result.failed);
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : 'Failed to load.');
    } finally {
      setLoading(false);
    }
  }, [getToken, label]);

  useEffect(() => {
    void load();
  }, [load]);

  const token = getToken();
  if (!token) {
    return (
      <>
        <PanelHeader title={displayName} onSwipeLeft={onSwipeLeft} onSwipeRight={onSwipeRight} />
        <div className="panel__body" style={{ padding: '1rem' }}>
          <p>Sign in to view this panel.</p>
        </div>
      </>
    );
  }

  return (
    <>
      <PanelHeader
        title={displayName}
        onSwipeLeft={onSwipeLeft}
        onSwipeRight={onSwipeRight}
        actions={
          <button onClick={() => void load()} disabled={loading} aria-label="Refresh">
            {loading ? '…' : '↻'}
          </button>
        }
      />
      <div className="panel__body">
        {error && <p className="error">{error}</p>}
        {failed > 0 && (
          <p className="error">
            {failed} message{failed === 1 ? '' : 's'} failed to load — try again.
          </p>
        )}
        {emails.length === 0 && !loading && !error ? (
          <p style={{ padding: '1rem', color: '#888' }}>
            {label === 'INBOX' ? 'Inbox zero 🎉' : 'No messages here.'}
          </p>
        ) : (
          <ul className="inbox-list">
            {emails.map((e) => (
              <li
                key={e.id}
                className={e.unread ? 'email email--unread' : 'email'}
                onClick={() => onOpenThread(label, e.threadId)}
              >
                <span className="email__from">{e.from}</span>
                <span className="email__subject">{e.subject}</span>
                <span className="email__snippet">{e.snippet}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
```

**Step 4: Run — expect PASS** (5 tests).

**Step 5: Commit**

`feat: add ThreadlistPanel (generic label-viewer, tap-to-open)`.

---

## Task 12: `ThreadPanel`

**Files:**
- Create: `src/panels/ThreadPanel.tsx`, `src/panels/ThreadPanel.test.tsx`

**Step 1: Failing test**

Create `src/panels/ThreadPanel.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThreadPanel } from './ThreadPanel';

vi.mock('../lib/gmail/fetchThread', () => ({
  fetchThread: vi.fn(),
}));
import { fetchThread } from '../lib/gmail/fetchThread';

const view = {
  id: 't1',
  subject: 'Hello',
  messages: [
    { id: 'm1', from: 'Alice', to: 'Bob', date: 'Fri', body: 'hi there' },
    { id: 'm2', from: 'Bob', to: 'Alice', date: 'Fri', body: 'hey back' },
  ],
};

describe('ThreadPanel', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the subject as the header title and each message body', async () => {
    (fetchThread as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(view);
    render(
      <ThreadPanel threadId="t1" getToken={() => 'tok'} onClose={vi.fn()} />,
    );
    await waitFor(() => screen.getByText('hi there'));
    expect(screen.getByRole('heading', { name: 'Hello' })).toBeInTheDocument();
    expect(screen.getByText('hey back')).toBeInTheDocument();
  });

  it('calls onClose when the close button is clicked', async () => {
    (fetchThread as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(view);
    const close = vi.fn();
    render(<ThreadPanel threadId="t1" getToken={() => 'tok'} onClose={close} />);
    await waitFor(() => screen.getByText('hi there'));
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('shows an error message when fetch fails', async () => {
    (fetchThread as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Boom'));
    render(<ThreadPanel threadId="t1" getToken={() => 'tok'} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/boom/i)).toBeInTheDocument());
  });
});
```

**Step 2: Run — expect FAIL**

**Step 3: Implementation**

Create `src/panels/ThreadPanel.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { PanelHeader } from '../layout/PanelHeader';
import { fetchThread, type ThreadView } from '../lib/gmail/fetchThread';

export interface ThreadPanelProps {
  threadId: string;
  getToken: () => string | null;
  onClose: () => void;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
}

export function ThreadPanel({
  threadId,
  getToken,
  onClose,
  onSwipeLeft = () => {},
  onSwipeRight = () => {},
}: ThreadPanelProps) {
  const [view, setView] = useState<ThreadView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setError('Not signed in.');
      return;
    }
    fetchThread(token, threadId)
      .then(setView)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load thread.'));
  }, [threadId, getToken]);

  return (
    <>
      <PanelHeader
        title={view?.subject ?? ''}
        onSwipeLeft={onSwipeLeft}
        onSwipeRight={onSwipeRight}
        actions={<button onClick={onClose} aria-label="Close thread">×</button>}
      />
      <div className="panel__body">
        {error && <p className="error">{error}</p>}
        {view && (
          <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {view.messages.map((m) => (
              <li key={m.id} style={{ padding: '1rem', borderBottom: '1px solid #eee' }}>
                <div style={{ fontSize: '0.85rem', color: '#555' }}>
                  <strong>{m.from}</strong> · {m.date}
                </div>
                <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', marginTop: '0.5rem' }}>
                  {m.body}
                </pre>
              </li>
            ))}
          </ol>
        )}
      </div>
    </>
  );
}
```

**Step 4: Run — expect PASS** (3 tests).

**Step 5: Commit**

`feat: add ThreadPanel for read-only thread display`.

---

## Task 13: `StashColumn` (count badge + bulk-click; slices deferred)

**Files:**
- Create: `src/layout/StashColumn.tsx`, `src/layout/StashColumn.test.tsx`

For 0b v1, ship the count badge and a single bulk click. The sliced visualization is left as a follow-up; the component contract already accepts the data needed (count and per-side hidden panels) so adding slices later is purely visual.

**Step 1: Failing test**

Create `src/layout/StashColumn.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StashColumn } from './StashColumn';

describe('StashColumn', () => {
  it('does not render when count is zero', () => {
    const { container } = render(<StashColumn side="left" count={0} onActivate={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the count badge for a positive count', () => {
    render(<StashColumn side="right" count={3} onActivate={vi.fn()} />);
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('calls onActivate when clicked', () => {
    const activate = vi.fn();
    render(<StashColumn side="left" count={2} onActivate={activate} />);
    fireEvent.click(screen.getByRole('button'));
    expect(activate).toHaveBeenCalledTimes(1);
  });
});
```

**Step 2: Run — expect FAIL**

**Step 3: Implementation**

Create `src/layout/StashColumn.tsx`:

```tsx
export interface StashColumnProps {
  side: 'left' | 'right';
  count: number;
  onActivate: () => void;
}

export function StashColumn({ side, count, onActivate }: StashColumnProps) {
  if (count <= 0) return null;
  return (
    <button
      type="button"
      className="stash-column"
      data-side={side}
      onClick={onActivate}
      aria-label={`${count} panel${count === 1 ? '' : 's'} hidden`}
    >
      <span className="stash-column__count">{count}</span>
    </button>
  );
}
```

**Step 4: Run — expect PASS** (3 tests).

**Step 5: Commit**

`feat: add StashColumn v1 (count badge + bulk click)`.

---

# Milestone D — Integration + verification

## Task 14: Rewrite `App.tsx` to use the layout

**Files:**
- Modify: `src/App.tsx`

The new `App.tsx`:
- Calls `useGoogleAuth` once.
- On first sign-in, calls `ensureAppLabels(token)` once (best-effort; errors are logged but don't block).
- Renders a `LayoutContainer` with the default panel set: `[settings, threadlist('INBOX'), threadlist('InboxZero/Snoozed')]`.
- The `renderPanel` prop wires each panel kind to its component, passing `getToken`, `signedIn`, callbacks.

Replace `src/App.tsx`:

```tsx
import { useEffect, useRef } from 'react';
import { useGoogleAuth } from './lib/auth/useGoogleAuth';
import { LayoutContainer, type PanelRenderProps } from './layout/LayoutContainer';
import { SettingsPanel } from './panels/SettingsPanel';
import { ThreadlistPanel } from './panels/ThreadlistPanel';
import { ThreadPanel } from './panels/ThreadPanel';
import { ensureAppLabels, SNOOZED_LABEL } from './lib/gmail/labelBootstrap';
import type { Panel } from './layout/types';
import './index.css';

const INITIAL_PANELS: Panel[] = [
  { kind: 'settings' },
  { kind: 'threadlist', label: 'INBOX' },
  { kind: 'threadlist', label: SNOOZED_LABEL },
];

function displayName(label: string): string {
  if (label === 'INBOX') return 'Inbox';
  // Strip the InboxZero/ prefix; "InboxZero/Snoozed" → "Snoozed".
  return label.replace(/^InboxZero\//, '');
}

export default function App() {
  const { signedIn, error, signIn, signOut, getToken } = useGoogleAuth();
  const bootstrapped = useRef(false);

  useEffect(() => {
    if (!signedIn || bootstrapped.current) return;
    const token = getToken();
    if (!token) return;
    bootstrapped.current = true;
    ensureAppLabels(token).catch((e) => {
      // Non-blocking — Snoozed will show empty if the label is missing.
      console.warn('label bootstrap failed:', e);
    });
  }, [signedIn, getToken]);

  function renderPanel(panel: Panel, index: number, props: PanelRenderProps) {
    if (panel.kind === 'settings') {
      return <SettingsPanel signedIn={signedIn} onSignIn={signIn} onSignOut={signOut} />;
    }
    if (panel.kind === 'threadlist') {
      return (
        <ThreadlistPanel
          label={panel.label}
          displayName={displayName(panel.label)}
          getToken={getToken}
          onOpenThread={props.onOpenThread}
        />
      );
    }
    return (
      <ThreadPanel
        threadId={panel.threadId}
        getToken={getToken}
        onClose={props.onClose}
      />
    );
  }

  return (
    <>
      {error && <p className="error">Sign-in error: {error}</p>}
      <LayoutContainer initialPanels={INITIAL_PANELS} renderPanel={renderPanel} />
    </>
  );
}
```

Verify:
- `npm test` → all suites pass.
- `npm run build` → clean.
- `npm run lint` → clean.

Commit: `feat: wire LayoutContainer + label bootstrap in App`.

---

## Task 15: Production build verification

Run:
- `npm test` → all pass.
- `npm run build` → succeeds; `dist/` has `index.html`, hashed JS/CSS, `sw.js`, `manifest.webmanifest`.
- `npm run lint` → clean.

No commit unless something changed.

---

## Task 16: Manual end-to-end verification (human)

The human project owner runs the app and confirms:

1. `npm run dev`, open `http://localhost:5173/`.
2. Settings panel shows. Click **Sign in with Google** → grant scopes.
3. Inbox panel populates (or shows "Inbox zero 🎉").
4. Swipe (mobile) or scroll (wide) to Snoozed — it shows the empty state (label might be brand-new).
5. Tap a row → thread opens to the right of Inbox.
6. Click **×** to close the thread.
7. Swipe back to Settings, click **Sign out** → returns to the signed-out view.
8. Sign in again → still works; labels were created idempotently.

If any of those misbehave, file specific notes — the systematic-debugging skill applies the same way it did for Phase 0a.

---

## Definition of Done

- The PWA boots with the panel layout. On mobile, header swipes move focus by one panel. On wide screens, multiple panels are visible side by side.
- Sign in / sign out work end to end. Token expiry surfaces as "please sign in again."
- Inbox panel reads `q=label:"INBOX"`; Snoozed panel reads `q=label:"InboxZero/Snoozed"`. Both render rows or the appropriate empty state.
- Tapping a row opens a Thread panel immediately to the right of its source; clicking × closes it.
- `InboxZero` and `InboxZero/Snoozed` exist in Gmail after first sign-in; subsequent runs are no-ops.
- All TDD units pass (~46 tests total after this phase). Build + lint clean.

## Deferred to later phases (explicitly out of scope)

- Row swipe gestures (archive / trash / snooze on rows) and a unified gesture / mouse / keyboard / button model — its own phase next.
- Snooze duration picker, label-writes, undo toast.
- Stash column slices and per-panel restoration. (v1 is count + bulk click.)
- Reply / compose.
- Pull-to-refresh, auto-poll.
- Multi-select.
- URL deep-linking of the panel sequence.
- Phase 0c: Sheet datastore, Apps Script project, behavior logging.
