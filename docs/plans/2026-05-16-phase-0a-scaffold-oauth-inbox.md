# Phase 0a — Scaffold, OAuth & Read-Only Inbox — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Stand up the PWA, sign in with Google, and display the user's real Gmail inbox read-only — proving the project's two riskiest assumptions (browser OAuth + Gmail API) before any further investment.

**Architecture:** A React + Vite + TypeScript PWA. Google sign-in uses Google Identity Services (GIS) to obtain a short-lived access token in the browser. The app calls the Gmail REST API directly with that token. No backend. Pure logic (token expiry, message parsing, the inbox component) is unit-tested with Vitest; OAuth and live API wiring are verified manually with explicit expected outcomes.

**Tech Stack:** Vite, React 18, TypeScript, `vite-plugin-pwa`, Vitest, React Testing Library, Google Identity Services, Gmail REST API.

**Scope note:** This plan covers Phase 0a only (de-risking slice). The swipe deck, Gmail writes, the Sheet, and behavior logging are deliberately deferred to later plans.

---

## Conventions

- **TDD where the skill applies:** for pure logic and components, write the failing test first, watch it fail, implement minimally, watch it pass, commit. Tasks 4, 5, 6, 8 are TDD. Tasks 1–3, 7, 9, 10 are scaffolding/integration — verified manually with stated expected outcomes.
- **Frequent commits:** one commit per task. Use conventional-commit prefixes (`chore:`, `feat:`, `test:`).
- **Every commit message ends with this trailer** (shown once here, applies to all):
  ```
  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  ```
- **Working directory:** the worktree root `/Users/pixelbandito/Code/email/.worktrees/phase-0-foundation`. All paths below are relative to it.
- All commands run from the worktree root unless stated.

---

## Task 0: Manual prerequisites (Google Cloud setup) — DONE BY THE HUMAN

This is **not code.** The engineer cannot do this; the project owner must. Execution should pause here until a Client ID exists.

**Steps for the project owner:**

1. Go to <https://console.cloud.google.com/> and create a new project (e.g. "inbox-zero").
2. **APIs & Services → Library →** search "Gmail API" → **Enable.**
3. **APIs & Services → OAuth consent screen:**
   - User type: **External.**
   - Fill app name, user support email, developer contact.
   - **Scopes:** add `.../auth/gmail.readonly`.
   - **Test users:** add the project owner's Gmail address (and any others).
   - Leave the app in **Testing** status (no verification needed for ≤100 test users).
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID:**
   - Application type: **Web application.**
   - **Authorized JavaScript origins:** add `http://localhost:5173`.
   - Create, then **copy the Client ID** (looks like `xxxxx.apps.googleusercontent.com`).
5. Hand the Client ID to the engineer for Task 3.

**Verification:** A Client ID string exists and the Gmail API shows "Enabled."

---

## Task 1: Scaffold the Vite + React + TypeScript project

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/index.css` (most created by the scaffolder)
- Create: `src/test/setup.ts`, `src/lib/sanity.test.ts`

**Step 1: Run the Vite scaffolder into the current directory**

Run: `npm create vite@latest . -- --template react-ts`

When prompted "Current directory is not empty," choose **"Ignore files and continue"** (this preserves `docs/` and `.gitignore`).

**Step 2: Install base dependencies**

Run: `npm install`

**Step 3: Install test tooling**

Run: `npm install -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom`

**Step 4: Configure Vitest inside `vite.config.ts`**

Replace `vite.config.ts` with:

```ts
/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
  },
});
```

**Step 5: Create the test setup file**

Create `src/test/setup.ts`:

```ts
import '@testing-library/jest-dom';
```

**Step 6: Add the `test` script to `package.json`**

In `package.json`, add to `"scripts"`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

**Step 7: Add a sanity test**

Create `src/lib/sanity.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

describe('sanity', () => {
  it('runs the test suite', () => {
    expect(1 + 1).toBe(2);
  });
});
```

**Step 8: Verify the test runner works**

Run: `npm test`
Expected: 1 test file, 1 test passed.

**Step 9: Verify the dev server starts**

Run: `npm run dev`
Expected: Vite serves on `http://localhost:5173`. Stop it with Ctrl+C.

**Step 10: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite + React + TS project with Vitest"
```

---

## Task 2: Add PWA support

**Files:**
- Modify: `vite.config.ts`
- Create: PWA icons referenced below (placeholder PNGs are fine for now)

**Step 1: Install the plugin**

Run: `npm install -D vite-plugin-pwa`

**Step 2: Wire the plugin into `vite.config.ts`**

Add the import and plugin entry:

```ts
/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Inbox Zero',
        short_name: 'InboxZero',
        description: 'A lightweight, mobile-first Gmail wrapper',
        theme_color: '#1a1a1a',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
  },
});
```

**Step 3: Add placeholder icons**

Place any two square PNGs at `public/pwa-192x192.png` and `public/pwa-512x512.png` (real artwork is a later polish task). A solid-color square is fine.

**Step 4: Verify the build emits a service worker**

Run: `npm run build`
Expected: build succeeds; `dist/sw.js` and `dist/manifest.webmanifest` exist.

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add PWA support via vite-plugin-pwa"
```

---

## Task 3: Environment config for the Google Client ID

**Files:**
- Create: `.env.local`, `.env.example`, `src/lib/config.ts`
- Modify: `.gitignore`

**Step 1: Ensure `.env.local` is git-ignored**

Append to `.gitignore` (if not already present):

```
.env.local
```

**Step 2: Create `.env.example` (committed, no secrets)**

```
VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
```

**Step 3: Create `.env.local` (NOT committed)**

```
VITE_GOOGLE_CLIENT_ID=<paste the Client ID from Task 0 here>
```

**Step 4: Create `src/lib/config.ts`**

```ts
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;

// Read-only Gmail scope for the de-risking slice. Later phases widen this.
export const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

if (!GOOGLE_CLIENT_ID) {
  console.warn('VITE_GOOGLE_CLIENT_ID is not set — Google sign-in will fail.');
}
```

**Step 5: Verify**

Run: `npm run dev` and confirm no `VITE_GOOGLE_CLIENT_ID` warning appears in the browser console (meaning `.env.local` is loaded). Stop the server.

**Step 6: Commit**

```bash
git add .gitignore .env.example src/lib/config.ts
git commit -m "chore: add env config for Google Client ID"
```

---

## Task 4: TokenStore (TDD)

Holds the OAuth access token and reports whether it is still valid.

**Files:**
- Create: `src/lib/auth/tokenStore.ts`
- Test: `src/lib/auth/tokenStore.test.ts`

**Step 1: Write the failing test**

Create `src/lib/auth/tokenStore.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { TokenStore } from './tokenStore';

describe('TokenStore', () => {
  it('is invalid when empty', () => {
    expect(new TokenStore().isValid(1000)).toBe(false);
  });

  it('stores a token and reports it valid before expiry', () => {
    const store = new TokenStore();
    store.set('abc', 3600, 0); // expires at 3_600_000 ms
    expect(store.get()?.accessToken).toBe('abc');
    expect(store.isValid(1_000_000)).toBe(true);
  });

  it('reports invalid past expiry (with 60s safety margin)', () => {
    const store = new TokenStore();
    store.set('abc', 3600, 0);
    expect(store.isValid(3_550_000)).toBe(false); // inside the 60s margin
  });

  it('clears the token', () => {
    const store = new TokenStore();
    store.set('abc', 3600, 0);
    store.clear();
    expect(store.get()).toBeNull();
  });
});
```

**Step 2: Run the test to verify it fails**

Run: `npm test -- tokenStore`
Expected: FAIL — cannot find module `./tokenStore`.

**Step 3: Write the minimal implementation**

Create `src/lib/auth/tokenStore.ts`:

```ts
export interface StoredToken {
  accessToken: string;
  expiresAt: number; // epoch ms
}

const SAFETY_MARGIN_MS = 60_000;

export class TokenStore {
  private token: StoredToken | null = null;

  set(accessToken: string, expiresInSeconds: number, now: number = Date.now()): void {
    this.token = { accessToken, expiresAt: now + expiresInSeconds * 1000 };
  }

  get(): StoredToken | null {
    return this.token;
  }

  isValid(now: number = Date.now()): boolean {
    if (!this.token) return false;
    return this.token.expiresAt - SAFETY_MARGIN_MS > now;
  }

  clear(): void {
    this.token = null;
  }
}
```

**Step 4: Run the test to verify it passes**

Run: `npm test -- tokenStore`
Expected: PASS (4 tests).

**Step 5: Commit**

```bash
git add src/lib/auth/tokenStore.ts src/lib/auth/tokenStore.test.ts
git commit -m "feat: add TokenStore with expiry tracking"
```

---

## Task 5: Gmail message parser (TDD)

Converts a raw Gmail API message into a typed `EmailSummary`.

**Files:**
- Create: `src/lib/gmail/types.ts`, `src/lib/gmail/parseMessage.ts`
- Test: `src/lib/gmail/parseMessage.test.ts`

**Step 1: Create the type**

Create `src/lib/gmail/types.ts`:

```ts
export interface EmailSummary {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  snippet: string;
  date: string;
  unread: boolean;
}
```

**Step 2: Write the failing test**

Create `src/lib/gmail/parseMessage.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseGmailMessage } from './parseMessage';

const rawMessage = {
  id: 'm1',
  threadId: 't1',
  snippet: 'Hello there, this is a preview',
  labelIds: ['INBOX', 'UNREAD'],
  payload: {
    headers: [
      { name: 'From', value: 'Alice <alice@example.com>' },
      { name: 'Subject', value: 'Lunch?' },
      { name: 'Date', value: 'Fri, 16 May 2026 14:00:00 -0700' },
    ],
  },
};

describe('parseGmailMessage', () => {
  it('extracts fields from headers', () => {
    const result = parseGmailMessage(rawMessage);
    expect(result).toEqual({
      id: 'm1',
      threadId: 't1',
      from: 'Alice <alice@example.com>',
      subject: 'Lunch?',
      snippet: 'Hello there, this is a preview',
      date: 'Fri, 16 May 2026 14:00:00 -0700',
      unread: true,
    });
  });

  it('marks read when UNREAD label is absent', () => {
    const read = { ...rawMessage, labelIds: ['INBOX'] };
    expect(parseGmailMessage(read).unread).toBe(false);
  });

  it('tolerates missing headers and labels', () => {
    const bare = { id: 'm2', threadId: 't2', snippet: '' };
    const result = parseGmailMessage(bare);
    expect(result.from).toBe('');
    expect(result.subject).toBe('');
    expect(result.unread).toBe(false);
  });
});
```

**Step 3: Run the test to verify it fails**

Run: `npm test -- parseMessage`
Expected: FAIL — cannot find module `./parseMessage`.

**Step 4: Write the minimal implementation**

Create `src/lib/gmail/parseMessage.ts`:

```ts
import type { EmailSummary } from './types';

interface GmailHeader {
  name: string;
  value: string;
}

export interface RawGmailMessage {
  id: string;
  threadId: string;
  snippet?: string;
  labelIds?: string[];
  payload?: { headers?: GmailHeader[] };
}

function header(headers: GmailHeader[], name: string): string {
  const found = headers.find((h) => h.name.toLowerCase() === name.toLowerCase());
  return found ? found.value : '';
}

export function parseGmailMessage(msg: RawGmailMessage): EmailSummary {
  const headers = msg.payload?.headers ?? [];
  return {
    id: msg.id,
    threadId: msg.threadId,
    from: header(headers, 'From'),
    subject: header(headers, 'Subject'),
    snippet: msg.snippet ?? '',
    date: header(headers, 'Date'),
    unread: (msg.labelIds ?? []).includes('UNREAD'),
  };
}
```

**Step 5: Run the test to verify it passes**

Run: `npm test -- parseMessage`
Expected: PASS (3 tests).

**Step 6: Commit**

```bash
git add src/lib/gmail/types.ts src/lib/gmail/parseMessage.ts src/lib/gmail/parseMessage.test.ts
git commit -m "feat: add Gmail message parser"
```

---

## Task 6: InboxList component (TDD)

A presentational component that renders a list of `EmailSummary`.

**Files:**
- Create: `src/components/InboxList.tsx`
- Test: `src/components/InboxList.test.tsx`

**Step 1: Write the failing test**

Create `src/components/InboxList.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InboxList } from './InboxList';
import type { EmailSummary } from '../lib/gmail/types';

const emails: EmailSummary[] = [
  { id: 'm1', threadId: 't1', from: 'Alice', subject: 'Lunch?', snippet: 'hey', date: '', unread: true },
  { id: 'm2', threadId: 't2', from: 'Bob', subject: 'Report', snippet: 'done', date: '', unread: false },
];

describe('InboxList', () => {
  it('renders a row per email', () => {
    render(<InboxList emails={emails} />);
    expect(screen.getByText('Lunch?')).toBeInTheDocument();
    expect(screen.getByText('Report')).toBeInTheDocument();
  });

  it('marks unread emails with the unread class', () => {
    render(<InboxList emails={emails} />);
    expect(screen.getByText('Lunch?').closest('li')).toHaveClass('email--unread');
    expect(screen.getByText('Report').closest('li')).not.toHaveClass('email--unread');
  });

  it('shows an inbox-zero message when empty', () => {
    render(<InboxList emails={[]} />);
    expect(screen.getByText(/inbox zero/i)).toBeInTheDocument();
  });
});
```

**Step 2: Run the test to verify it fails**

Run: `npm test -- InboxList`
Expected: FAIL — cannot find module `./InboxList`.

**Step 3: Write the minimal implementation**

Create `src/components/InboxList.tsx`:

```tsx
import type { EmailSummary } from '../lib/gmail/types';

export function InboxList({ emails }: { emails: EmailSummary[] }) {
  if (emails.length === 0) {
    return <p className="inbox-empty">Inbox zero 🎉</p>;
  }
  return (
    <ul className="inbox-list">
      {emails.map((e) => (
        <li key={e.id} className={e.unread ? 'email email--unread' : 'email'}>
          <span className="email__from">{e.from}</span>
          <span className="email__subject">{e.subject}</span>
          <span className="email__snippet">{e.snippet}</span>
        </li>
      ))}
    </ul>
  );
}
```

**Step 4: Run the test to verify it passes**

Run: `npm test -- InboxList`
Expected: PASS (3 tests).

**Step 5: Commit**

```bash
git add src/components/InboxList.tsx src/components/InboxList.test.tsx
git commit -m "feat: add InboxList component"
```

---

## Task 7: Google sign-in via GIS (integration — manual verification)

**Files:**
- Modify: `index.html`
- Create: `src/lib/auth/useGoogleAuth.ts`
- Install: `@types/google.accounts`

**Step 1: Install GIS type definitions**

Run: `npm install -D @types/google.accounts`

**Step 2: Load the GIS script in `index.html`**

Add inside `<head>`:

```html
<script src="https://accounts.google.com/gsi/client" async></script>
```

**Step 3: Create the auth hook**

Create `src/lib/auth/useGoogleAuth.ts`:

```ts
import { useCallback, useRef, useState } from 'react';
import { GOOGLE_CLIENT_ID, GMAIL_SCOPE } from '../config';
import { TokenStore } from './tokenStore';

const tokenStore = new TokenStore();

export function useGoogleAuth() {
  const [signedIn, setSignedIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clientRef = useRef<google.accounts.oauth2.TokenClient | null>(null);

  const signIn = useCallback(() => {
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

  const getToken = useCallback(() => tokenStore.get()?.accessToken ?? null, []);

  return { signedIn, error, signIn, getToken };
}
```

**Step 4: Manual verification**

This step has no automated test — verify it by hand in Task 9 once the UI exists. For now confirm the project still type-checks and builds:

Run: `npm run build`
Expected: build succeeds with no TypeScript errors.

**Step 5: Commit**

```bash
git add index.html src/lib/auth/useGoogleAuth.ts package.json package-lock.json
git commit -m "feat: add Google sign-in hook via GIS"
```

---

## Task 8: fetchInbox — Gmail API orchestration (TDD with mocked fetch)

**Files:**
- Create: `src/lib/gmail/fetchInbox.ts`
- Test: `src/lib/gmail/fetchInbox.test.ts`

**Step 1: Write the failing test**

Create `src/lib/gmail/fetchInbox.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchInbox } from './fetchInbox';

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

describe('fetchInbox', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('lists inbox messages then fetches and parses each', async () => {
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce(jsonResponse({ messages: [{ id: 'm1' }] }));
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        id: 'm1',
        threadId: 't1',
        snippet: 'hi',
        labelIds: ['INBOX', 'UNREAD'],
        payload: { headers: [{ name: 'Subject', value: 'Hello' }] },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchInbox('token123');

    expect(result).toHaveLength(1);
    expect(result[0].subject).toBe('Hello');
    expect(result[0].unread).toBe(true);
    // First call lists, second call fetches the message.
    expect(fetchMock.mock.calls[0][0]).toContain('/messages?q=in:inbox');
    expect(fetchMock.mock.calls[1][0]).toContain('/messages/m1');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer token123');
  });

  it('returns an empty array when the inbox has no messages', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);
    expect(await fetchInbox('token123')).toEqual([]);
  });

  it('throws when the list request fails', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 401 } as Response);
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchInbox('bad')).rejects.toThrow(/401/);
  });
});
```

**Step 2: Run the test to verify it fails**

Run: `npm test -- fetchInbox`
Expected: FAIL — cannot find module `./fetchInbox`.

**Step 3: Write the minimal implementation**

Create `src/lib/gmail/fetchInbox.ts`:

```ts
import { parseGmailMessage, type RawGmailMessage } from './parseMessage';
import type { EmailSummary } from './types';

const BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

function authHeaders(token: string) {
  return { headers: { Authorization: `Bearer ${token}` } };
}

export async function fetchInbox(token: string, maxResults = 25): Promise<EmailSummary[]> {
  const listRes = await fetch(
    `${BASE}/messages?q=in:inbox&maxResults=${maxResults}`,
    authHeaders(token),
  );
  if (!listRes.ok) throw new Error(`Gmail list failed: ${listRes.status}`);

  const listJson = (await listRes.json()) as { messages?: { id: string }[] };
  const ids = listJson.messages ?? [];

  const messages = await Promise.all(
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

  return messages.map(parseGmailMessage);
}
```

**Step 4: Run the test to verify it passes**

Run: `npm test -- fetchInbox`
Expected: PASS (3 tests).

**Step 5: Commit**

```bash
git add src/lib/gmail/fetchInbox.ts src/lib/gmail/fetchInbox.test.ts
git commit -m "feat: add fetchInbox Gmail API orchestration"
```

---

## Task 9: Wire it together in App (integration — manual verification)

**Files:**
- Modify: `src/App.tsx`, `src/index.css`

**Step 1: Replace `src/App.tsx`**

```tsx
import { useState } from 'react';
import { useGoogleAuth } from './lib/auth/useGoogleAuth';
import { fetchInbox } from './lib/gmail/fetchInbox';
import { InboxList } from './components/InboxList';
import type { EmailSummary } from './lib/gmail/types';
import './index.css';

export default function App() {
  const { signedIn, error, signIn, getToken } = useGoogleAuth();
  const [emails, setEmails] = useState<EmailSummary[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');

  async function loadInbox() {
    const token = getToken();
    if (!token) return;
    setStatus('loading');
    try {
      setEmails(await fetchInbox(token));
      setStatus('idle');
    } catch (e) {
      console.error(e);
      setStatus('error');
    }
  }

  return (
    <main className="app">
      <h1>Inbox Zero</h1>
      {!signedIn && <button onClick={signIn}>Sign in with Google</button>}
      {error && <p className="error">Sign-in error: {error}</p>}
      {signedIn && (
        <>
          <button onClick={loadInbox} disabled={status === 'loading'}>
            {status === 'loading' ? 'Loading…' : 'Load inbox'}
          </button>
          {status === 'error' && <p className="error">Failed to load inbox.</p>}
          <InboxList emails={emails} />
        </>
      )}
    </main>
  );
}
```

**Step 2: Add minimal styles to `src/index.css`**

Append:

```css
.app { max-width: 640px; margin: 0 auto; padding: 1rem; font-family: system-ui, sans-serif; }
.inbox-list { list-style: none; padding: 0; }
.email { display: flex; flex-direction: column; gap: 0.15rem; padding: 0.75rem 0.5rem; border-bottom: 1px solid #eee; }
.email--unread { font-weight: 600; background: #f6f9ff; }
.email__from { font-size: 0.85rem; color: #555; }
.email__snippet { font-size: 0.85rem; color: #888; }
.error { color: #c0392b; }
```

**Step 3: Verify the automated suite still passes**

Run: `npm test`
Expected: all test files pass.

**Step 4: Manual end-to-end verification**

Run: `npm run dev`, open `http://localhost:5173`, then:

1. Click **"Sign in with Google."** Expected: Google popup; choose the test-user account; consent screen lists "Read your email." Approve.
2. The "Sign in" button disappears; **"Load inbox"** appears.
3. Click **"Load inbox."** Expected: your real Gmail inbox subjects render; unread items are bold with a tinted background.

If the popup is blocked, allow popups for `localhost`. If you see `403 / access_denied`, confirm the account is in the OAuth consent screen's test-user list (Task 0).

Stop the dev server.

**Step 5: Commit**

```bash
git add src/App.tsx src/index.css
git commit -m "feat: wire sign-in and inbox display together"
```

---

## Task 10: Production build verification

**Step 1: Build**

Run: `npm run build`
Expected: succeeds; `dist/` contains `index.html`, hashed JS/CSS, `sw.js`, `manifest.webmanifest`.

**Step 2: Preview the production build**

Run: `npm run preview`
Expected: serves `dist/`; sign-in + load-inbox still work (popups allowed for the preview origin).

**Step 3: Commit (only if any config changed)**

If nothing changed, skip. Otherwise:

```bash
git add -A
git commit -m "chore: verify production build"
```

**Follow-up (not in this plan):** static hosting (e.g. GitHub Pages) requires adding the deployed origin to the OAuth client's Authorized JavaScript origins — handled in a later deployment task.

---

## Definition of Done

- `npm test` passes (TokenStore, parseGmailMessage, InboxList, fetchInbox).
- `npm run build` produces a PWA bundle with a service worker.
- Running the app, the project owner can sign in with Google and see their real Gmail inbox, read-only, with unread styling.
- Every task is committed; the branch `phase-0-foundation` has a clean history.

## Deferred to later plans (explicitly out of scope)

- Swipe deck, gestures, and undo.
- Gmail writes (archive/trash/snooze).
- The Google Sheet datastore and its bootstrap.
- Behavior logging (Channels A and B) and the Apps Script project.
