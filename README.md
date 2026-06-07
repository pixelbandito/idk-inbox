# idk-inbox

A mobile-first, lightweight Gmail PWA wrapper. Sign in with Google and view your inbox in a clean, read-only list.

## Requirements

- Node 22.13+ — run `nvm use` to match the version pinned in `.nvmrc`.

## Setup

See **[docs/SETUP.md](docs/SETUP.md)** for the full walkthrough — creating
the Google Cloud project, enabling the Gmail API, configuring the OAuth
consent screen + scopes, creating the client ID, and populating
`.env.local`. The short version:

1. Install dependencies:

   ```sh
   npm install
   ```

2. Copy the environment template and fill in your credentials:

   ```sh
   cp .env.example .env.local
   ```

   Set `VITE_GOOGLE_CLIENT_ID` to a Google OAuth Web client ID.

## Commands

- `npm run dev` — start the local dev server.
- `npm test` — run the test suite.
- `npm run build` — produce a production build.
