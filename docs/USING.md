# Using idk-inbox

A guide to actually using the app: getting it running, what's on screen,
every way to triage a message, and what the app does on its own (plus how
to stop it).

If you haven't set up a Google OAuth client yet, do
[SETUP.md](SETUP.md) first — it's a one-time, ~5-minute click-through in
the Google Cloud Console. If you want to know how the thing is built, see
[ARCHITECTURE.md](ARCHITECTURE.md).

---

## Running it

**Node 22.13 or newer is required.** Node 20 breaks Vitest/Rolldown at
startup, so this isn't a soft floor.

```sh
nvm use          # matches .nvmrc
npm install
npm run dev      # http://localhost:5173
```

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm test` | Full test suite, once |
| `npm run test:watch` | Tests in watch mode |
| `npm run lint` | ESLint over the repo |
| `npm run build` | Production build (type-check + bundle + service worker) |
| `npm run preview` | Serve the production build — the real installable PWA |

Two things only exist in the built version: the service worker and the
install prompt. Use `npm run build && npm run preview` when you're testing
PWA behaviour, not `npm run dev`.

There's also an interaction playground at
[`/prototype.html`](../prototype.html) — nav and gesture experiments, no
app code involved. See
[ARCHITECTURE.md § The prototype sandbox](ARCHITECTURE.md#10-the-prototype-sandbox).

### Signing in

Click **Sign in with Google** in the Settings panel and pick your test
user. Google will say *"Google hasn't verified this app"* — that's
expected in OAuth Testing mode; click **Advanced → Continue**. The app
asks for one scope, `gmail.modify`: it can read your mail and change
labels, and it cannot permanently delete anything or send as you.

You can review or revoke that access any time at
[myaccount.google.com/permissions](https://myaccount.google.com/permissions),
which is also linked from Settings → *Under the hood*.

Signing in stays sticky across page refreshes. Signing out clears the
token and every cache tied to that account.

### Installing on your phone

Worth doing — it's the intended form factor. It needs a bit of setup
because PWA install requires HTTPS and Google OAuth refuses LAN IP
addresses as origins, so you need a real hostname and a trusted cert.
Walkthrough:
[SETUP.md § LAN HTTPS + installing the PWA on a phone](SETUP.md#lan-https--installing-the-pwa-on-a-phone).

---

## What's on screen

The app is a horizontal strip of panels rather than a stack of screens.
Scroll sideways to move between them. On a phone you'll see about one at a
time; on a desktop, several. Whichever panel is nearest the centre of the
screen is the active one, and that's what keyboard shortcuts act on.

You start with four:

| Panel | What it's for |
|---|---|
| **Settings** | Sign in/out, and everything the app will tell you about itself |
| **Inbox** | Your actual inbox — the main triage surface |
| **Snoozed** | Everything you've put off, grouped by the day it comes back |
| **Labels** | Your Gmail labels; tap one to open it as its own list |

Opening a message adds a **thread** panel to the right. Opening a label
adds a list panel, closable with its **×**. Each list panel header has a
refresh button.

---

## Triaging mail

Four things you can do to a message: **archive** it, **delete** it (to
Trash — never permanently), **snooze** it until later, or **label** it.
There are four ways to ask, and they all end up in the same place.

### Swipe a row

Drag a row sideways. The row shows you what it's about to do — icon,
colour, label — as you go, and the further you pull, the heavier the
action:

| Drag direction | Short pull (~15%) | Long pull (~50%) |
|---|---|---|
| **→** toward the end | Archive | Delete |
| **←** toward the start | Snooze | Label |

Release past a tier to commit. Release short of the first tier and nothing
happens. Snooze and Label spring the row back and open a picker instead of
firing immediately, since they need to know *when* or *which*.

**On a Mac trackpad**, a two-finger horizontal scroll works differently by
necessity — a scroll has no "fingers lifted" moment to commit on. Instead
the row slides open and stays open, revealing the action buttons; tap one
to commit. Scroll far enough to reveal both the light and heavy actions.
Tap the row or scroll back to close it.

### Tap the "⋯" menu

Every row has one. It lists the same four actions as buttons — always
available, no gesture required, and the honest answer to "I can't get the
swipe to work".

### From an open message

A thread panel's header has archive, snooze, and delete buttons.
Overscrolling past the bottom of a thread closes the panel.

> This one is currently too easy to trigger by accident — a fast scroll to
> the bottom can close the thread. A deliberate-pull affordance is in
> progress; see [followups.md](followups.md).

### Keyboard

| Keys | Action |
|---|---|
| `J` or `E` | Archive |
| `#` | Delete |
| `!` | Report spam |
| `B` | Snooze |
| `⌘K` | Command palette |
| `Esc` | Cancel / exit selection mode |
| `⌘Z` | Undo |
| `⇧⌘Z` | Redo |

`⌘K` opens a searchable list of every action, which is the most reliable
way to reach anything that doesn't have a gesture.

**Selection mode:** long-press a row to start selecting, then triage
several at once. Note that nothing on screen currently indicates you're in
selection mode — a known gap, tracked in
[followups.md](followups.md). `Esc` gets you out.

**Undo:** every write can be undone from the toast that appears, or with
`⌘Z`. One caveat worth knowing: undoing something you did from a *label*
list currently returns the thread to your Inbox, even if it was never
there. Fix is queued.

### Snoozing

Presets are **Later today** (+4 hours), **Tomorrow** (9am), **This
weekend** (Saturday 9am), and **Next week** (Monday 9am), plus a
date-and-time picker. Times in the past are rejected.

If the message mentions a date — "the deadline is Aug 20", "3/15" — you
also get **Evening before** and **Morning of** that date. The app shows
the date it resolved alongside the text it matched, so you can catch a
misread (`7/8` is genuinely ambiguous, and "1/2 off" is not a date). It
only recognises explicit calendar dates; it won't guess from "next
Tuesday".

Snoozed mail leaves your inbox with a label like
`idk-inbox/Snoozed/2026-08-20-0900`, and comes back the next time you open
the app after that time has passed. Which means: **if you never open the
app, nothing wakes up.** There's no server doing it for you.

> Also: waking happens once per page load. If you leave the installed app
> open for days, reload it to catch up.

### Reading mail safely

HTML messages are sanitised and rendered in isolation, and remote images
are blocked until you tap **Show images** on that message. That's what
defeats read-receipt tracking pixels, so leaving it off by default is the
point.

---

## What the app does on its own

Two things, both listed in **Settings → What this app automates**, each
with its own on/off switch.

### It notices senders you ignore

As you triage, the app keeps a private tally per sender: how many of their
messages it has seen, and how many you archived *without opening*. That
second number is the signal — archiving unread is a much stronger "I don't
want this" than archiving after reading.

Once a sender crosses a threshold, a card appears above the inbox with the
evidence and an offer:

- **Unsubscribe** — if the message carries a proper unsubscribe header and
  you're clearly not reading it (4+ seen, under 10% opened). Preferred,
  because it stops the mail at the source. Tapping it opens the sender's
  own unsubscribe page for you to finish; the app can't complete it for you
  (browsers block that request).
- **Auto-archive** — if you've archived 5+ of the last 14 days' messages
  unopened, at an 80%+ rate. Also offered for automated `noreply`-style
  senders at a 60% rate.

Before you accept, the card tells you what it will actually do — "matches
3 currently in your inbox", or "nothing from them is in your inbox right
now; this only affects future mail". Dismiss an offer and you won't be
asked about that sender again.

What it stores: email addresses, list IDs, thread IDs, action types, and
timestamps — for 60 days, on this device only. **Never subjects or message
bodies.**

### It applies the rules you accepted

Accepting an auto-archive offer creates a rule, and rules run every time
you open the app: new mail from that sender is archived before you see it.
Every rule is listed in Settings, with the sender it covers and a remove
button.

Two honest caveats:

- **Rules live in this browser's storage; archived mail is permanent in
  Gmail.** Clear your browser data or switch devices and the rules are
  gone, but the mail they already archived stays archived. Fix (moving
  rules into your Google account) is on the roadmap.
- **Switching a suggester off doesn't retract rules it already made.**
  Remove those individually. Also on the roadmap.

### Seeing what it's up to

Settings has three read-only sections for this:

- **What I've noticed** — the trends behind current and past suggestions.
- **Gestures & shortcuts** — the tables above, generated from the actual
  bindings, so they can't drift out of date.
- **Under the hood** — links that open the app's own labels directly in
  Gmail, a statement of what powers the app (today: nothing but your
  browser and your Gmail — no servers, no scripts, no spreadsheets), and
  the link to revoke access.

---

## When something's wrong

| Symptom | Cause / fix |
|---|---|
| `Insufficient Permission` / 403 from Gmail | Token scope is too narrow — [SETUP.md § Updating scopes later](SETUP.md#updating-scopes-later) |
| `access_denied` at sign-in | That Gmail address isn't on the OAuth consent screen's test-user list |
| "Google hasn't verified this app" every time | Expected in Testing mode. **Advanced → Continue** |
| Sign-in button does nothing | A privacy extension is blocking `accounts.google.com`. Allow the host for this origin |
| App serving old code after a fix | Service worker. DevTools → Application → Service Workers → *Unregister*, then Clear site data, then hard reload |
| Snoozed mail didn't come back | Sweeps run on app open. Reload the page |
| Tests fail immediately on startup | You're on Node 20. `nvm use` |

Longer list of known-broken and deferred behaviour:
[followups.md](followups.md).

---

## Related docs

- [SETUP.md](SETUP.md) — Google Cloud setup, `.env.local`, LAN HTTPS
- [ARCHITECTURE.md](ARCHITECTURE.md) — how it's built
- [followups.md](followups.md) — known limitations and deferred work
