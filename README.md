# idk-inbox

A mobile-first Gmail triage app that runs entirely in your browser. Swipe
mail away, snooze it until Thursday, or file it — and let the app notice
the senders you never read and offer to silence them.

There's no server and no account: you sign in with Google, the browser
talks straight to the Gmail API, and what the app remembers it stores as
ordinary labels in your own Gmail. Built for its author and a few known
people (Google OAuth test-user mode), not as a product.

## Requirements

- **Node 22.13+** — `nvm use` matches the version pinned in `.nvmrc`.
  Node 20 breaks Vitest at startup, so this is a hard floor.
- A Google Cloud project with the Gmail API enabled and an OAuth Web
  client ID.

## Quick start

```sh
nvm use
npm install
cp .env.example .env.local     # then set VITE_GOOGLE_CLIENT_ID
npm run dev                    # http://localhost:5173
```

Getting that client ID is a one-time, ~5-minute click-through in the
Google Cloud Console — **[docs/SETUP.md](docs/SETUP.md)** walks through
every screen.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm test` | Run the test suite once |
| `npm run test:watch` | Tests in watch mode |
| `npm run lint` | ESLint over the repo |
| `npm run build` | Production build (type-check, bundle, service worker) |
| `npm run preview` | Serve the production build — the real installable PWA |

## Documentation

| Doc | Read it for |
|---|---|
| **[docs/USING.md](docs/USING.md)** | Using the app: panels, every swipe and shortcut, what the automation does and how to switch it off |
| **[docs/SETUP.md](docs/SETUP.md)** | Google Cloud + OAuth setup, `.env.local`, LAN HTTPS and installing on a phone, common gotchas |
| **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** | How it's built — plain-language overview and the five big decisions up top, mechanism detail folded in below |
| **[docs/followups.md](docs/followups.md)** | Known limitations and deferred work |
| **[docs/plans/](docs/plans/)** | Design and implementation plans, chronological |

There's also an isolated interaction playground at `/prototype.html`
(panel-nav and gesture experiments, no app code involved) — see
[docs/2026-08-09-panel-nav-and-pull-gesture-handoff.md](docs/2026-08-09-panel-nav-and-pull-gesture-handoff.md).
