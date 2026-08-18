# Architecture

How `idk-inbox` is put together, from "what is this thing" down to "which
file do I open".

Read the top of each section for the plain-language version. The
collapsible **Details** blocks under each one hold the mechanism, the
constants, and the reasons a naive implementation would have been wrong —
open them when you need to change that piece.

- New to the project? Read [Overview](#overview) and
  [The big rocks](#the-big-rocks), then stop.
- Trying to use the app? See [USING.md](USING.md).
- Trying to get it running? See [SETUP.md](SETUP.md).
- Looking for what's known-broken or deferred? See
  [followups.md](followups.md).

---

## Overview

`idk-inbox` is a phone-first app for getting through your email. It does
not try to replace Gmail — it sits on top of a real Gmail account and
gives you a faster way to triage it: swipe a message away, put it off
until Thursday, file it, or leave it alone.

It runs **entirely in your web browser**. There is no `idk-inbox` server,
no database, and no account to sign up for. You sign in with Google, the
browser talks straight to Gmail, and everything the app remembers is kept
either as ordinary labels inside your own Gmail or in your browser's local
storage on that one device. If you cleared your browser and deleted the
app's labels, nothing of it would be left anywhere.

The second thing it does is quieter. As you triage, the app keeps a small
private tally of *your own behaviour* — "you've archived nine of the last
ten emails from this sender without opening any of them". When a tally
crosses a threshold, the app offers a deal: want me to unsubscribe you
from that, or just archive it automatically from now on? It never acts on
that on its own. You say yes, and only then does a rule exist. Every rule
is listed in Settings in plain English, with an off switch.

It's built for its author and a handful of known people — Google OAuth
test-user mode, capped at 100 users — not as a product.

---

## The big rocks

Five decisions shape everything else. If you only remember five things
about this codebase, remember these.

| # | Rock | Why it matters |
|---|------|----------------|
| 1 | **No server. The browser is the whole app.** | No backend to deploy or secure, but also nowhere to run a cron job — so anything that "happens later" has to happen when you next open the app. |
| 2 | **Gmail is the database.** | State lives as labels in your account, not in a store we own. Snooze is a label. That makes the app disposable and the data portable — and it means every write is subject to Gmail's API quirks. |
| 3 | **One input algebra: action / trigger / surface.** | A swipe, a keypress, and a command-palette entry are three *triggers* pointing at the same *action*. Adding a gesture is a table entry, not a new code path. |
| 4 | **Observation suggests; the human decides.** | Deterministic counters detect patterns. Nothing acts automatically until the user accepts a specific offer, which creates a specific rule. |
| 5 | **Nothing is silent.** | Every automatic behaviour is listed in plain language in Settings, individually switch-off-able, and undoable where the plumbing allows. |

---

## 1. No server: auth and the request path

You sign in with Google in a popup. The browser gets an access token,
holds it in memory (and in local storage so a refresh doesn't sign you
out), and attaches it to every Gmail request. Nothing passes through a
machine belonging to this project, because there isn't one.

The cost of that choice shows up as a recurring shape in the code:
anything that would normally be a scheduled server job is instead a
**sweep that runs when the app opens**.

<details>
<summary><strong>Details</strong> — token flow, scope, sweeps on open</summary>

**Sign-in.** `lib/auth/loadGis.ts` injects Google Identity Services;
`useGoogleAuth.ts` owns the token lifecycle and exposes
`{ signedIn, error, signIn, signOut, getToken }`. `tokenStore.ts` holds
the live token, `tokenPersistence.ts` mirrors it (plus expiry) to
`localStorage` under `idk-inbox.token.v1` so a page refresh survives.

**Scope.** A single scope, `gmail.modify`, declared in `lib/config.ts`.
Not `gmail.readonly` (we write labels), not full mail access (we never
permanently delete — `#` moves to Trash). Changing it means changing the
Cloud Console consent screen too; see
[SETUP.md § Updating scopes later](SETUP.md#updating-scopes-later).

**Requests.** `lib/gmail/http.ts` is the only place that knows the base
URL (`https://gmail.googleapis.com/gmail/v1/users/me`), the
`Authorization` header, and the non-2xx throw. Error messages name the
operation for humans and never include the token.

> `lib/gmail/fetchThread.ts` still hand-rolls its own base URL and auth
> header instead of using `http.ts`. Fold it in on the next touch
> (tracked in [followups.md](followups.md)).

**Sign-out is a data boundary.** Account A's cached labels and behaviour
history must not leak into account B, so `useGoogleAuth.signOut` clears
the label-id resolver, the thread-summary cache, and every
account-scoped `localStorage` key. The full inventory of what the app
persists — and what survives sign-out — is
`lib/storageKeys.ts`, deliberately one file so the question has one
answer.

**Sweeps instead of cron.** On sign-in, `App.tsx` runs a bootstrap:
ensure the app's labels exist, wake any snoozed threads that came due
while the app was closed, then apply the user's auto-archive rules. Both
sweeps dispatch `silent: true` and their descriptions are composed into
one message, because the feedback surface has a single slot and two
back-to-back announcements would clobber each other.

> Known gap: this runs **once per page load**, guarded by a
> `bootstrapped` ref. An installed PWA tab left open for days never
> re-sweeps, so threads coming due mid-session wake on next reload. A
> `visibilitychange` re-sweep is the fix.

</details>

---

## 2. Gmail is the database

The app owns no store. What it needs to remember about your mail, it
writes into your mail as labels: `idk-inbox` and beneath it
`idk-inbox/Snoozed`.

Snooze is the clearest example. "Remind me Thursday at 9" becomes a label
named `idk-inbox/Snoozed/2026-08-20-0900` applied to the thread, with
`INBOX` removed. There's no timer and no scheduled job anywhere — the
wake time *is* the label's name, so the next time the app opens it can
read the label list, see which buckets are in the past, and put those
threads back.

Only per-user, per-device preferences live in browser storage: your
accepted rules, your behaviour tallies, your on/off toggles.

<details>
<summary><strong>Details</strong> — buckets, the <code>labelIds</code> rule, write client</summary>

**Bucket labels.** `lib/snooze/bucket.ts` encodes minute-precision UTC as
`idk-inbox/Snoozed/YYYY-MM-DD-HHMM`. UTC because a label name has no
timezone; no colons because Gmail label names dislike them.
`wakeTimeOf()` parses it back and range-checks the result, so a
hand-created label like `.../2026-13-45-9999` is ignored rather than
producing an invalid `Date`.

**The `labelIds=` rule — the most important gotcha in the data layer.**
List reads go through `labelIds=` (exact label membership), never `q=`
(search). Gmail's search index is *eventually consistent*: right after a
write, a `q=` search can still report the old state. Three separate
reviewers found the same bug from this — the wake sweep would see a
bucket as empty from a stale index, delete the bucket label, and strand
its threads in snoozed-forever. `lib/snooze/wakeSweep.ts` now lists by
label ID and only deletes a bucket that emptied cleanly; a bucket at the
`MAX_THREADS_PER_BUCKET = 100` listing cap is treated as partially swept
so its label survives for the next pass.

The auto-archive sweep (`lib/rules/autoArchive.ts`) *does* use `q=`, on
purpose and with a comment saying so: archiving is additive and
idempotent, so mail a stale index misses is simply caught next time.
Nothing there deletes anything on the strength of an empty result. The
distinction is the rule: **`q=` is fine when you only add; never when you
delete based on absence.**

**Writes.** `lib/gmail/threadWriteClient.ts` is the single write surface.
It takes label *names* so callers and undo entries never handle raw ids,
resolving them via `lib/gmail/labelIds.ts`. It hides two API quirks:
modify endpoints want ids, not names; and `TRASH` can't go through
`threads.modify` at all, needing `threads.trash` / `threads.untrash`
instead. Writes fan out per thread and report per-thread success/failure,
so one bad thread doesn't abort a batch.

**Label plumbing.** `labelBootstrap.ts` creates the app labels if absent.
`labelTree.ts` / `labelDirectory.ts` / `labelDisplay.ts` turn Gmail's
flat `a/b/c` names into a tree, per-thread pills, and human display
names. `appLabelResolver.ts` maps app-level names to account label ids.

</details>

---

## 3. One input algebra: action / trigger / surface

The vocabulary is deliberate and worth learning, because the whole input
layer is three words:

- An **action** is a thing the app can do — `archive-thread`, `undo`,
  `open-panel`. Identity only.
- A **trigger** is something the user did — a click, a long press, a
  swipe toward the inline end, `⌘K`, an overscroll past the bottom.
- A **surface** is where they did it — `row`, `panel-header`,
  `panel-body`, `document`.

Bindings are then just a lookup: *surface → trigger → action*. Swiping a
row and pressing `E` both resolve to `archive-thread`, through the same
table, into the same dispatcher. Remapping a gesture is editing a table
entry; there is no per-gesture handler to rewrite.

<details>
<summary><strong>Details</strong> — registry, resolution, producers, the two swipe input models</summary>

Terminology note: the words **binding** and **predicate** were removed in
the trigger-system redesign. Don't reintroduce them in new code or commit
messages — it's *action*, *trigger*, *surface*.

**Identity.** Actions and triggers are `Symbol()`s (`actions/types.ts`,
`triggers/triggers.ts`), plain and unregistered — they're in-memory ids
that never need serialising. The `Action` shape is identity-only; all
metadata lives in side-maps (`actions/catalog.ts` for labels and
categories, `actions/confirmations.ts` for auth/destructive policy). This
keeps "what an action *is*" separate from "how it's presented" and "what
it takes to confirm it".

**The map.** `triggers/actionMap.ts` is the whole binding table:

| Surface | Trigger | Action |
|---|---|---|
| `row` | click | open-panel |
| `row` | long press | enter-selection |
| `panel-header` | swipe inline-end / -start | nav-panel-next / -prev |
| `panel-body` | overscroll block-end | close-panel |
| `document` | `J`/`E`, `#`, `!`, `B` | archive / delete / spam / snooze |
| `document` | `⌘K`, `Esc`, `⌘Z`, `⇧⌘Z` | palette / exit-mode / undo / redo |

`overlay` is *intentionally absent*: an open picker captures pointer
events and decides for itself, with no fall-through.

**Resolution.** `triggers/resolve.ts` (`resolveAndFire`) is the single
pure entry point: filter triggers by `match(event)`, drop the ones with
no action assigned on that surface, sort by priority descending, warn on
a top-two tie, dispatch the winner with args from `triggers/argsFor.ts`.
Auth gating is *not* here — it lives in the dispatcher, via the
confirmation side-map.

**Producers** translate DOM reality into abstract events:
`producers/fromKeyboard.ts`, `producers/fromGesture.ts`,
`producers/fromOverscroll.ts`, `producers/combo.ts`.
`useTriggerHandler.ts` wires a component to the pipeline with a
per-surface allowlist of triggers.

**Row swipes** run their own resolver, because they need to render a live
preview of what *would* fire. `input/swipeIntents.ts` holds two tables:
`ACTION_PRESENTATION` (colour, icon, label — keyed by action, so a
remapped action carries its appearance wherever it lands) and
`ROW_SWIPE_BINDINGS` (which action sits in which direction+distance
slot):

| Direction | Short swipe (15%) | Full swipe (50%) |
|---|---|---|
| inline-end | Archive | Delete |
| inline-start | Snooze | Label |

One resolver drives both the live reveal and the commit, so the picture
on screen and the action that fires can't disagree. Actions in
`ELICITING_ACTIONS` (snooze, add/remove label) spring the tile back and
hand off to a picker instead of flying the row away, since the write
happens later.

**Two input models, on purpose** (`input/useRowSwipe.ts`): a pointer
drag commits **on release** past a tier. A trackpad wheel stream has no
"fingers lifted" event, so it can't — instead a horizontal scroll
*reveals* and snaps the tile open, and the exposed buttons commit on
click. Pure geometry lives in `input/swipeGeometry.ts`; the hook does
only DOM mutation and dispatch.

**Overscroll** (`input/useOverscroll.ts`) fires on *release* — finger
lift, or a wheel stream going quiet for `WHEEL_SETTLE_MS = 180` — and
only if accumulated past-edge distance reached `minPx`, so a quick flick
that overshoots the bottom doesn't trigger. It reports `onProgress` 0..1
for an affordance. Threshold is 80px, and is currently considered too
sensitive; a stepped, staircase-style replacement is prototyped (see
[§10](#10-the-prototype-sandbox)).

</details>

---

## 4. Dispatch, undo, and feedback

Everything the app does to your mail goes through one funnel: a
dispatcher. Ask it to archive some threads and it checks you're signed in,
finds the handler, runs it, records what happened so it can be undone,
logs the behaviour for the suggestion engine, and tells the UI to refresh.

Because every write passes through the same place, undo and "why did the
list just change" are features of the funnel rather than something each
button reimplements.

<details>
<summary><strong>Details</strong> — registry, elicitation, undo inverses, refresh</summary>

`state/DispatchProvider.tsx` composes the action registry from four
factories — `actions/threadWrites.ts`, `actions/selection.ts`,
`actions/layout.ts`, `actions/app.ts` — and hands it to
`input/dispatch.ts`'s `createDispatcher`. Consumers use hooks from
`state/useDispatch.ts`; the several React contexts are split in
`state/dispatchContexts.ts` so a feedback change doesn't re-render the
layout.

**Auth gating** happens inside the dispatcher: action → confirmation
policy → `requiresAuth`, from `actions/confirmations.ts`. One policy can
cover many actions.

**Elicitation.** An action can declare `elicitVia: 'picker-snooze' |
'picker-label'`. If the required arg (`until`, `label`) is missing,
dispatch opens that picker instead of failing, and the picker completes
the original request. That's how a swipe with no target time still ends
up as a snooze.

**Undo.** Each thread write returns an `inverse` alongside its result,
expressed in label names — `{ add: ['INBOX'], remove: [] }` — and pushed
onto a stack (`state/undoStack.test.tsx` documents the semantics; a new
undo clears redo). `⌘Z` / `⇧⌘Z` and `UndoToast` both dispatch it.

> Known limitation: inverses **assume INBOX provenance**. Undoing a
> delete performed from a tag list restores `INBOX`, which that thread may
> never have had. The proper fix is capturing prior `labelIds` per thread
> at write time.

**Result flags.** `ActionResult` carries `ok`, `description`, plus
`announce` and `mutated`, which let sweeps say "I did nothing" and
suppress a pointless toast.

**Refresh after write.** The inner dispatcher bumps a `threadsVersion`
counter that list panels watch, so a successful write refetches the
affected lists without any panel knowing what happened.

> Known limitation: `labelVersions` is keyed by `focusedLabel`, so
> `refresh-panel` on a non-label panel bumps an `idx:N` key nothing
> watches — refresh is a no-op there.

**Behaviour logging** is wired here too: `BEHAVIOUR_BY_ACTION` maps a
dispatched action to the outcome recorded in the behaviour log (see
[§7](#7-observation--suggestion--rule)). It's a known layering wart that
`DispatchProvider` imports a heuristic directly; the cleaner seam is a
generic `onThreadWriteSuccess` observer wired from `App`.

</details>

---

## 5. The panel workspace

Instead of one screen that pushes and pops, the app is a horizontally
scrolling row of panels: Settings, Inbox, Snoozed, Labels, and a thread
opens as another panel to the right. On a phone you see roughly one at a
time and scroll sideways; on a wide screen you see several at once.

Whichever panel is nearest the centre of the screen is the "active" one,
which is what document-level keyboard shortcuts apply to.

<details>
<summary><strong>Details</strong> — panel model, activation, the focus hardcode</summary>

`layout/types.ts` defines the panel union: `settings`, `threadlist`
(carries a Gmail label; `closable` marks one opened on demand),
`thread`, `labels`, `automations`. `layout/operations.ts` holds the pure
open/close/reorder logic; `layout/LayoutContainer.tsx` renders the strip,
observes scroll to pick the active panel, and animates exits
(`PANEL_EXIT_MS = 260`, matched to the CSS keyframe, so the close is
dispatched only after the collapse is visible). `PROGRAMMATIC_SCROLL_MS =
500` suppresses the scroll listener during the app's own scrolls so they
aren't mistaken for user intent. Edge slivers reveal after the mouse
rests near a screen edge (`EDGE_ZONE_PX = 48`, `LINGER_MS = 1000`).

`App.tsx` supplies `renderPanel`, so `LayoutContainer` stays ignorant of
what a panel contains.

> **The live wart:** `DispatchProvider` hardcodes `focusedPanelIndex: 1`.
> Overscroll-to-close therefore always targets panel index 1 regardless of
> what you're looking at. Real focus tracking is the next layout task, and
> the prototype in [§10](#10-the-prototype-sandbox) exists to decide the
> model it should use. Related: nothing renders selection mode or the
> focused panel, though the state carries both.

`layout/StashColumn.tsx` is built and tested but not yet rendered by
`LayoutContainer` — dead code at the integration level, awaiting the same
work.

</details>

---

## 6. Reading mail without getting owned

Email is hostile input: arbitrary HTML from strangers, laced with
tracking pixels. Message bodies are scrubbed and then rendered inside an
isolated shadow root, with remote images blocked until you ask for them
per message.

<details>
<summary><strong>Details</strong> — sanitizer, isolation, the residual hole</summary>

`lib/mail/sanitizeEmailHtml.ts` runs DOMPurify; `mail/SanitizedEmailBody.tsx`
attaches the result to a shadow root so the email's CSS can't reach the
app's styles and vice versa. Remote `<img>` sources are stripped by
default, with a per-message "Show images" reveal — the classic
read-receipt beacon is off unless you opt in.

> Residual hole, deliberately recorded rather than half-fixed: only
> `<img>` `src`/`srcset` are blocked. A CSS `background-image: url()` in
> an inline `style` attribute can still fetch a remote asset. Stripping
> `url()` from style attributes is the fuller block.

</details>

---

## 7. Observation → suggestion → rule

This is the part that makes the app more than a swipe deck, and its
three-stage shape is the point:

1. **Observe.** Every message you see and every triage action you take
   updates small counters, keyed by who sent it. Addresses and counts —
   never subjects or bodies.
2. **Suggest.** A catalogue of thresholds reads those counters. Cross
   one and the app offers a specific deal, phrased with the evidence:
   "You've archived 9 of the last 10 without opening them. Auto-archive
   mail from them?"
3. **Act.** Only if you accept does a rule come into existence. Rules run
   at app open and are listed, individually, in Settings.

The signal is *your behaviour*, not the content of your mail. That's a
privacy stance and a design one — behaviour is a better predictor, and it
keeps the app out of your message bodies.

<details>
<summary><strong>Details</strong> — fingerprints, the catalogue, honest previews</summary>

**Fingerprints.** `lib/signals/behaviourLog.ts` keeps per-fingerprint
rolling counts with `RETENTION_DAYS = 60`. A fingerprint key is
`addr:<address>` or `list:<list-id>`, and every message contributes to
both dimensions, so a rule can survive a newsletter rotating its
from-address. Observable actions: `open`, `archive`, `delete`, `spam`,
`snooze`, `label`, `unsubscribe`. Crucially, dismissals are conditioned
on whether you opened the thread first —
**archived-without-opening** is a far stronger fatigue signal than plain
archived. Reply/forward wait on a compose feature.

**The catalogue.** `lib/heuristics/catalog.ts` is one entry per rule of
the "measurement algebra": a condition over stats + signals, and the
suggestion it proposes. In priority order:

| Heuristic | Fires when | Offers |
|---|---|---|
| `dead-newsletter-unsubscribe` | has a `List-Unsubscribe` header, ≥4 seen, <10% opened | Unsubscribe |
| `fatigue-auto-archive` | ≥5 seen in 14 days, ≥80% archived unopened | Auto-archive |
| `role-noise-auto-archive` | automated sender (`noreply`-shaped), ≥5 seen, ≥60% archived unopened | Auto-archive |

`lib/heuristics/evaluate.ts` runs them all: at most one suggestion per
fingerprint (first match wins), resolved fingerprints skipped, and a
newsletter's *sender* suggestions folded into its *list* suggestion —
then ranked by score. Adding a heuristic is adding a catalogue entry.
**Nothing in here acts.**

**The offer.** `feedback/SuggestionCard.tsx` renders the top suggestion
with a forward-looking, honest preview from
`lib/heuristics/preview.ts` — "matches N currently in your inbox", or
plainly "nothing from them is in your inbox right now; this only affects
future mail". It is deliberately *not* a backtest: the behaviour log is a
sample of what the app happened to see while open, not a true history of
received mail, so "would have archived N in the last 30 days" could not
be stated honestly.

**Unsubscribing** parses `List-Unsubscribe` (RFC 2369) in
`lib/gmail/unsubscribe.ts`, preferring `https:` over `mailto:`. RFC 8058
one-click POST is *not* attempted — a cross-origin POST from the browser
dies on CORS — so the flow opens the sender's page and lets you finish
there.

**Acting.** Accepting an auto-archive offer appends a rule to
`lib/rules/autoArchive.ts`'s local store (`sender`, `createdAt`,
`enabled`), applied by the sweep on each app open, capped at
`MAX_THREADS_PER_RULE = 100`.
`lib/heuristics/resolvedSuggestions.ts` remembers what you've settled so
you're not asked twice.

**Event-date snooze**, same philosophy: `lib/events/detectEventDate.ts`
recognises explicit calendar dates in subject + snippet only — no NLP, no
bare weekday names, day resolution — and `pickers/eventSnoozeOptions.ts`
turns a hit into "Evening before Thu, Aug 20" / "Morning of Thu, Aug 20".
The resolved date is always shown next to the matched text, which defuses
locale ambiguity (`7/8`), makes a year rollover obvious, and lets you spot
a false positive like "1/2 off".

</details>

---

## 8. Transparency and control

Settings is not a dumping ground for switches; it's the app explaining
itself. Five sections: your account, **what this app automates** (every
processor in plain language with an off switch, and every rule you've
accepted, removable), **what I've noticed** (the trends behind the
suggestions), the gesture and keyboard reference, and **under the hood** —
links that open the app's actual labels in Gmail, plus a link to revoke
its access entirely.

<details>
<summary><strong>Details</strong> — the registries, and the honest caveats</summary>

`lib/automation/processors.ts` is the human-facing registry: each
processor's name, one-sentence summary, and the specifics spelled out
without jargon — with the thresholds interpolated from the actual
constants so the description can't drift from the code. It also fixes the
vocabulary: a **heuristic** watches and suggests; a **rule-engine**
acts on its own. Turning off a heuristic stops future suggestions;
a rule keeps running until removed.

`lib/transparency/externalSources.ts` answers "what powers this app?" It
currently reports the Gmail labels and states plainly that there are no
external servers, Apps Scripts, or spreadsheets — and it's the single
place those entries would slot in the moment that changes.
`panels/settings/ShortcutsReference.tsx` derives the gesture list
straight from `ROW_SWIPE_BINDINGS` so it can't drift, with a test
asserting the hand-authored keyboard list stays in sync with
`ACTION_MAP`.

Caveats worth knowing before extending this area — all recorded, none
papered over:

- **Rules and their enabled-state live in `localStorage`, but archived
  mail is permanent in Gmail.** Clear your browser and the control
  evaporates while its effects persist. Account-travelling storage (a
  Gmail label, or Drive appData) is the fix.
- **Turning an assistant "off" doesn't stop rules it already spawned** —
  a kill-switch trap. Closing it is the cheapest trust fix left.
- **`sweepAutoArchive` returns only `{archived: number}` and discards
  the thread IDs**, so a per-thread audit-log undo is real plumbing, not
  a veneer over the existing undo stack.
- **Mailing-list fingerprints need `List-Id` logged first.**

The forward design is
[`plans/2026-07-12-automation-transparency-design.md`](plans/2026-07-12-automation-transparency-design.md),
which carries the roadmap in shipping order.

</details>

---

## 9. Installable, but never cached

The app installs to a phone home screen as a PWA. The service worker
precaches the app shell only — markup, code, icons, manifest. **No Gmail
request and no auth request is ever cached**, deliberately: mail and
tokens should not sit in a cache, and a stale inbox is worse than no
inbox.

<details>
<summary><strong>Details</strong> — the empty runtimeCaching, and the LAN HTTPS knot</summary>

`vite.config.ts` configures `vite-plugin-pwa` with `registerType:
'autoUpdate'` and — the load-bearing line — `runtimeCaching: []`. Every
Google request is left to the network with no entry at all. The SPA
navigation fallback is same-origin only, with `/api/` and `/oauth`
denylisted so a future same-origin auth path can't be swallowed by it.
Precache is currently 11 entries, ~374 KiB.

Installing on a phone runs into a two-sided constraint: PWA install
requires a secure origin, and Google OAuth **rejects LAN IP origins**. So
testing on a real device needs a *hostname* (e.g. `inbox.home.arpa`), a
cert from your own CA trusted on the device, and that origin registered
on the OAuth client. Point `DEV_TLS_CERT` / `DEV_TLS_KEY` at the cert and
the dev server serves HTTPS and binds to the LAN; without them it stays
plain-http localhost. Full walkthrough in
[SETUP.md § LAN HTTPS](SETUP.md#lan-https--installing-the-pwa-on-a-phone).

</details>

---

## 10. The prototype sandbox

Two interaction problems — how panel navigation should feel, and how a
pull-to-trigger gesture should feel — are being worked out in a separate
playground at `/prototype.html`, not in the app. It's a second Vite entry,
so nothing it pulls in reaches the app's bundle, and no app code changes
while the question is open.

<details>
<summary><strong>Details</strong> — routes, the winning nav model, the gesture rigs</summary>

`prototype.html` → `src/prototype/main.tsx` → `PrototypeHub.tsx`, a tiny
hash router whose routes are one table in `routes.tsx`. **Adding a
prototype is one row.** Shared styles in `prototype/prototype.css`.

**Panel nav**, five variants over an identical 8-panel rig so only the
mechanic differs (`nav/navShared.ts`):

| Route | Mechanic | Can edge panels become active? |
|---|---|---|
| `#/nav/minimal` | CSS scroll-snap + `scrollsnapchange` | No — honest baseline |
| `#/nav/idiomatic` | IntersectionObserver on a centre line | No — honest baseline |
| `#/nav/padded` | scroll-snap + `padding-inline: 50%` | Yes, at the cost of visible empty ends |
| `#/nav/embla` | Embla + WheelGestures, `containScroll: 'keepSnaps'` | Yes, edges flush |
| `#/nav/homerolled` | **Attention cursor — the winner** | Yes, via a cursor edge-buffer |

The winning model: scrolling drives an attention cursor through the whole
content extent with a ½-viewport buffer past each end; panels follow
clamped `scrollLeft` while only the cursor moves into the buffer; active
= the panel the cursor points at. It's d3-zoom's
`constrain`/`translateExtent` idea in one dimension. Snapping was tried
and reverted as strictly worse.

**Pull-to-trigger**, two rigs sharing a state vocabulary and backdrop
(`gesture/pullShared.ts`, `gesture/PullBackdrop.tsx`: idle → pulling →
armed → activated / reverting), both vertical, both with live tuning
sliders, both settling back to neutral on success:

- `#/gesture/drag` — 1:1 pointer drag, no timers. High-control rig for
  feeling out the threshold.
- `#/gesture/overscroll` — the app's real mechanic, rebuilt as a stepped
  three-stop staircase so momentum can't fire it in one flick: reach the
  bottom, rest, overscroll to arm (clamped, can't blow past), rest, one
  more scroll confirms. Undertaken steps creep back to neutral.

The fix worth remembering: each step now advances only on a **"fresh"**
scroll, one preceded by real wheel idleness (`NEW_GESTURE_MS = 150`).
The earlier stop-gate *dropped* scrolls, because the event that lands you
at the bottom is evaluated before its own scroll applies — so `atBottom`
read false, the "rested" flag set a scroll late, and inertia consumed the
arming scroll as the arrival.

Handoff notes, including what's still undecided:
[`2026-08-09-panel-nav-and-pull-gesture-handoff.md`](2026-08-09-panel-nav-and-pull-gesture-handoff.md).

</details>

---

## 11. Designed but not built

The original design was four parts: this PWA, an Apps Script automation
engine, a Google Sheet as datastore-and-transparency-surface, and a
pluggable AI provider. **Only the PWA exists.** The app is client-only,
and every piece that would have been server-side has a deliberate
client-side stand-in.

<details>
<summary><strong>Details</strong> — the gap, and where each piece would land</summary>

| Designed | Today |
|---|---|
| Apps Script time-driven triggers running the rule engine | Client-side sweeps at app open (`wakeSweep`, `sweepAutoArchive`) |
| Sheet as datastore + audit log | `localStorage`, inventoried in `lib/storageKeys.ts` |
| Sheet as transparency surface | Settings panel + `externalSources.ts` |
| Pluggable AI behind one Apps Script function (key server-side) | Not built. Heuristics are deterministic |
| Streams / Rules / Taxonomy / BehaviorLog / AuditLog tabs | Partial: `behaviourLog` and `autoArchiveRules` only |
| `create_calendar_event` carveout | Not built. Event dates only drive snooze options |

The design's trade-off note still holds in reverse: Apps Script triggers
would have made automation *near*-real-time (1–5 min); the client-only
version is "next time you open the app", which is why the missing
`visibilitychange` re-sweep matters more than it looks.

Full design: [`plans/2026-05-16-inbox-zero-design.md`](plans/2026-05-16-inbox-zero-design.md).
It also defines the four primitives the system was meant to compose from —
**detectors, streams, treatments, views** — which remain the intended
vocabulary if this grows.

</details>

---

## Where things live

| Path | What's in it |
|---|---|
| `src/actions/` | Action identities, catalogue, confirmation policy, handler factories |
| `src/triggers/` | Trigger registry, `surface → trigger → action` map, resolver, producers |
| `src/input/` | Dispatcher, gesture/overscroll/row-swipe hooks, swipe geometry + intents |
| `src/state/` | `DispatchProvider`, contexts, undo stack, thread-summary cache |
| `src/layout/` | Panel model, `LayoutContainer`, panel header, stash column |
| `src/panels/` | Threadlist, thread, labels, snoozed agenda, settings (+ `settings/` sections) |
| `src/pickers/` | Snooze and label pickers, event-relative snooze options |
| `src/palette/` | `⌘K` command palette |
| `src/feedback/` | Undo toast, feedback toast, suggestion card |
| `src/mail/` | Sanitised email body rendering |
| `src/ui/` | Icons |
| `src/lib/auth/` | GIS loading, token store + persistence, `useGoogleAuth` |
| `src/lib/gmail/` | HTTP plumbing, fetchers, parsers, label machinery, write client |
| `src/lib/snooze/` | Bucket encoding, wake sweep, agenda grouping |
| `src/lib/signals/` | Behaviour log (fingerprints, counters), message signals |
| `src/lib/heuristics/` | Catalogue, evaluator, preview, resolved suggestions |
| `src/lib/rules/` | Auto-archive rule store + sweep |
| `src/lib/automation/` | Human-facing processor registry, per-processor on/off |
| `src/lib/transparency/` | External-source registry, Google deep links |
| `src/lib/mail/`, `src/lib/events/` | HTML sanitisation; event-date detection |
| `src/prototype/` | Isolated interaction playground (second Vite entry) |
| `src/test/` | Setup, local-state reset, write-client spy |

## Testing

Unit and component tests sit next to the code as `*.test.ts(x)` —
currently **479 tests across 75 files**, run with `npm test` (Vitest +
jsdom + Testing Library). Pure decision logic (`swipeGeometry`,
`swipeIntents`, `bucket`, `evaluate`, `detectEventDate`, `operations`,
`resolve`) is tested directly, which is why those modules are pure. Thread
writes are tested through `src/test/spyThreadWriteClient.ts` rather than
by mocking `fetch`. `src/test/resetLocalState.ts` keeps `localStorage`
from leaking between tests. The prototype is not unit-tested; keep the
suite green anyway.

## Related docs

- [USING.md](USING.md) — using the app: gestures, shortcuts, what the
  automation does
- [SETUP.md](SETUP.md) — Google Cloud + local setup, LAN HTTPS, gotchas
- [followups.md](followups.md) — deferred work and known limitations
- [`plans/`](plans/) — design and implementation plans, chronological
- [`2026-08-09-panel-nav-and-pull-gesture-handoff.md`](2026-08-09-panel-nav-and-pull-gesture-handoff.md)
  — current prototype state
