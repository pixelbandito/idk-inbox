# Setup Guide

`idk-inbox` is a mobile-first PWA wrapper around Gmail. To run it locally
you need (a) Node 22.13+, (b) a Google Cloud project with the Gmail API
enabled and an OAuth client ID, and (c) a `.env.local` pointing at that
client ID. This document walks you through it.

If you're picking the project up after a scope change, jump to
[Updating scopes later](#updating-scopes-later).

## Prerequisites

- **Node 22.13+** (`.nvmrc` pins the floor). If you use nvm:
  ```
  nvm install
  nvm use
  ```
- **npm**, comes with Node.
- A Google account with the inbox you want the app to read/modify.

## Initial Google Cloud setup (one-time)

This is the part you can't automate — these click-throughs in the Google
Cloud Console. Roughly 5 minutes.

### 1. Create a project

1. Go to <https://console.cloud.google.com/>.
2. Top bar → project dropdown → **New Project**.
3. Name it (e.g. `idk-inbox`) → **Create**.
4. Make sure the new project is selected before continuing.

### 2. Enable the Gmail API

1. Left menu (☰) → **APIs & Services → Library**.
2. Search **Gmail API** → click it → **Enable**.

### 3. Configure the OAuth consent screen ("Audience")

1. Left menu → **APIs & Services → OAuth consent screen**. (In newer
   Consoles this is under **Google Auth Platform**, with tabs
   **Branding / Audience / Clients / Data Access**.)
2. If prompted, choose **User type: External** → **Create**.
3. Under **Branding**: fill **App name**, **User support email**, and a
   **Developer contact email**. Save.
4. Under **Audience**: confirm the app is in **Testing** status. Click
   **Add users** and add your own Gmail address (and anyone else who'll
   use the app). Save.
   - Testing mode means up to 100 test users, no Google verification
     needed. Test users see a one-time "Google hasn't verified this app"
     screen and click through.
5. Under **Data Access** (a.k.a. Scopes): click **Add or remove scopes**,
   search for and check:
   - **`.../auth/gmail.modify`** ("read, send, and modify, but not
     permanently delete" — what we use). The app currently only does
     read + label mutations; `send` will land when reply is implemented.
   - Click **Update** → **Save**.

### 4. Create the OAuth Client ID

1. Left menu → **APIs & Services → Credentials** (or the **Clients** tab
   under Google Auth Platform).
2. **+ Create Credentials → OAuth client ID**.
3. **Application type: Web application**.
4. Name it (e.g. `idk-inbox-web`).
5. **Authorized JavaScript origins** → **Add URI** → enter exactly:
   ```
   http://localhost:5173
   ```
   (No trailing slash. If you deploy somewhere else later, add that
   origin here too.)
6. Leave **Authorized redirect URIs** empty — the GIS token flow doesn't
   need them.
7. **Create**.
8. Copy the **Client ID** (ends in `.apps.googleusercontent.com`). You
   can ignore the client *secret* — a browser app doesn't use one.

## Local setup

### 1. Install dependencies

From the repo root:
```
nvm use
npm install
```

### 2. Create `.env.local`

`.env.example` lives in the repo as a template. Copy it:
```
cp .env.example .env.local
```

Then open `.env.local` and paste in your Client ID:
```
VITE_GOOGLE_CLIENT_ID=123456789-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.apps.googleusercontent.com
```

`.env.local` is git-ignored. Don't commit it.

### 3. Run the dev server

```
npm run dev
```

Open <http://localhost:5173/>.

### 4. Sign in

Click **Sign in with Google**. The Google popup appears — pick the test
user. You'll see *"Google hasn't verified this app"*; click **Advanced →
Go to idk-inbox (unsafe)**. Grant the requested scope. Back in the app
the layout populates.

## Updating scopes later

If you need to change which scopes the app uses (e.g. when reply lands
and the app starts needing `gmail.send`):

1. Update `GMAIL_SCOPE` in `src/lib/config.ts`. Space-separated values
   are allowed if you need multiple scopes.
2. In the Google Cloud Console: **OAuth consent screen → Data Access →
   Add or remove scopes**, check the new scope, **Update → Save**.
3. In the running app: **sign out**, **sign in again**. The new GIS
   token issued will include the new scope.
4. If users see a stale consent screen without the new scope, have them
   revoke the app under
   <https://myaccount.google.com/permissions> and sign in fresh.

## Common gotchas

- **`Insufficient Permission` / 403 from a Gmail call.** Your token has
  too narrow a scope. See [Updating scopes later](#updating-scopes-later).
- **`Google hasn't verified this app` on every sign-in.** Expected in
  Testing mode. Click **Advanced → Continue**. If you want to skip the
  warning, you'd need Google's verification process (security
  assessment for sensitive scopes — paid). Out of scope for a personal
  PWA.
- **`access_denied` when signing in.** The Gmail address you used isn't
  on the OAuth consent screen's Test Users list.
- **PWA service worker serving stale code after a fix lands.** In
  DevTools → **Application → Service Workers**, click *Unregister*.
  Then **Application → Storage → Clear site data**. Hard reload.
- **Mouse swipes don't fire on a row.** Make sure you're on the
  `phase-0c-input-model` branch (or merged main) — Phase 0c added
  `setPointerCapture` to the gesture detector and `touch-action: pan-y`
  to rows.
- **The GIS library (`accounts.google.com/gsi/client`) fails to load.**
  A privacy extension or strict tracking-protection setting may be
  blocking `accounts.google.com`. Allow the host or disable the
  extension for `localhost:5173`.

## Architecture pointers

- Design: `docs/plans/2026-05-16-inbox-zero-design.md`.
- Phase plans (latest first):
  - `docs/plans/2026-05-25-phase-0c-stubbed-input-model.md` —
    current phase (stubbed input model).
  - `docs/plans/2026-05-25-phase-0c-unified-input-model-design.md` —
    Phase 0c design.
  - `docs/plans/2026-05-23-phase-0b-layout-design.md` /
    `…-layout-foundation.md` — Phase 0b layout primitive.
  - `docs/plans/2026-05-16-phase-0a-scaffold-oauth-inbox.md` —
    Phase 0a foundation.
