# Inbox Zero — Design

**Date:** 2026-05-16
**Status:** Validated design, ready for implementation planning

## Summary

A mobile-first, lightweight wrapper around Gmail. It does not rebuild mail
fundamentals; it layers a better triage experience on top of Gmail and adds an
invisible automation engine for snoozing, filtering, and inbox upkeep. AI is
used rarely, on demand, and only to translate deterministically-detected
patterns into human-readable suggestions and reviewable rule config.

Built on free, Google-native layers wherever possible. Intended for the author
and a few known people — not a public product.

## Guiding principles

- **Don't rebuild mail.** The medium is email, labels, snooze, junk, and trash.
  The API surface is sending/receiving email, plus one carveout: writing Google
  Calendar events. Everything else is UX streamlining.
- **Observe first, AI translates second.** The signal is the user's own
  behavior over time, not email content. Trends are detected deterministically;
  AI only names them and phrases the offer.
- **AI never runs in the hot path.** It works on small metadata payloads, only
  when the user taps a button, and never sees message bodies unless opted in.
  Its output is always a reviewable, deterministic config artifact.
- **Nothing is silent.** Every automated action is transparent and inspectable
  after the fact, with undo and refine. The quietest setting still surfaces in a
  retrospective review.
- **The human decides.** The app may *offer*; the human creates and refines
  rules. The human can also proactively ask for categorization.

## Decisions locked in

| Topic | Decision |
|---|---|
| Audience | The author + a few known people. Google OAuth test-user mode (≤100). |
| App role | Full daily driver — replaces the Gmail app for everyday use. |
| Datastore | A Google Sheet per user (also the transparency surface). |
| Rule execution | Own rule engine in Apps Script (full audit log, powers simulator). |
| AI provider | Pluggable — abstracted behind one Apps Script function; starts on Gemini free tier. |
| Frontend | React + Vite + `vite-plugin-pwa`, hosted free as static files. |

## Architecture

Four parts, each doing what it is best at:

1. **PWA (React + Vite).** The daily-driver UI: swipe deck, views, rule
   dashboard, simulator. Hosted free as static files (e.g. GitHub Pages). Does
   Google OAuth directly and talks straight to the **Gmail API** and **Sheets
   API** with the user's token for all reads and interactive triage — no backend
   hop, so the inbox stays snappy.

2. **Apps Script — the automation engine.** Time-driven triggers (every few
   minutes) run the rule engine, the snooze/importance engine, and Gmail-side
   behavior polling. Also deployed as a **web-app API** for the few things the
   PWA cannot do client-side: AI calls (provider key stays server-side) and
   Calendar writes.

3. **Google Sheet — the datastore.** One spreadsheet per user, multiple tabs.
   Doubles as the transparency surface — openable directly to inspect rules and
   the processing log.

4. **Pluggable AI.** One Apps Script function wraps the provider; starts on
   Gemini's free tier, swappable later with no rework.

**Per-user isolation:** each person runs their own copy — own Sheet, own Apps
Script deployment, own OAuth. No shared server, no multi-tenancy. The PWA is the
only shared artifact and holds no data.

**Trade-off:** Apps Script triggers run at most every ~1–5 minutes, so
automation is *near*-real-time, not instant — fine for archive/snooze/
unsubscribe.

## The four core primitives

The system has no special-cased "lanes." Four orthogonal primitives compose
into everything, including what used to be called the "event lane" and "capture
lane":

1. **Detectors** — deterministic *per-email* properties, independent of streams
   (`is-event-ish`, `is-receipt-ish`, `has-unsubscribe`, `has-amount`).
2. **Streams** — deterministic *groupings* of similar mail (editable,
   AI-refinable).
3. **Treatments** — the entire action vocabulary, all email-native plus one
   carveout: `add/remove_label, mark_read, archive, snooze(schedule), trash,
   mark_junk, unsubscribe, create_calendar_event`.
4. **Views** — renderings of mail filtered by label/state (the swipe deck, the
   Snoozed view, the Todo checklist).

A *rule* is `(stream OR detector) → treatment`. A "reminder" is just a snooze.
"Event treatment" is a snooze schedule plus the optional calendar carveout,
offered whenever `is-event-ish` fires. The "todo list" is just a view over
`label:todo`, rendered as a checklist where checking off = archive.

## Data model — the Sheet

One spreadsheet per user, tabs in four groups.

**Definitions (user + AI curate):**
- **Streams** — `stream_id, name, definition (JSON: senders/domains/
  subject-template patterns), parent_stream_id (for AI subdivisions), source
  (manual|ai), created`. A stream may exist with no rule.
- **Rules** — `rule_id, name, trigger (stream_id OR detector), treatment (JSON),
  autonomy (suggest|act), trust_score, enabled, match_count`.
- **Taxonomy** — curated tags: `tag_id, gmail_label, parent_tag_id (nesting),
  color`. Maps first-class tags onto real Gmail labels.

**Observation (engine writes, never hand-edited):**
- **BehaviorLog** — raw events: `message_id, thread_id, stream_id, event
  (arrived|opened|archived|archived_unread|deleted|snoozed|replied|marked_read|
  search_retrieved|unsubscribed), timestamp, source (pwa|gmail_poll), dwell_ms`.
- **AuditLog** — what automation *did*: `timestamp, rule_id, message_id,
  treatment, result, undo_token`.

**Engine state:**
- **SnoozeSchedule** — `message_id, snooze_until, backoff_stage,
  escalation_level, stream_id`.
- **ImportanceScores** — `key (sender or stream_id), score, signal_counts,
  last_updated`.
- **StreamStats** — cached verdicts, recomputed by the engine: `stream_id,
  count, open_rate, archive_unread_rate, recency_trend, ever_search_retrieved,
  named signal columns (see below), last_computed`.

**Config:**
- **Settings** — key/value: AI provider, backoff curve, auto-archive-stale
  window, detector thresholds, opportunity-registry overrides.

**Designed-in:**
- **Batched writes.** The PWA buffers behavior events and flushes in batches —
  Sheets allows ~60 writes/min/user, and rapid swiping would exceed a
  per-event approach.
- **Retention/rollup.** BehaviorLog grows forever; a weekly job rolls old raw
  events into StreamStats and trims, so the Sheet never nears its cell limit.

The data model is expected to evolve; tab schemas are append-only.

## The behavior observation layer

Two channels feed the BehaviorLog.

**Channel A — PWA direct logging (high fidelity).** Acting *in the app* logs
intent precisely: `opened` with **dwell time**, `archived` vs `archived_unread`,
`snoozed` with duration, `replied`, `deleted`. Opening an old, already-archived
message is logged as `search_retrieved` — the "keep vs junk" signal for
receipts.

**Channel B — Apps Script via the Gmail History API.** Each trigger calls
`users.history.list` from the last saved `historyId`, returning *incremental*
changes (messages added, labels added/removed, deletions). It translates diffs
into events, covering triage done in the real Gmail app:

| Gmail diff | Inferred event |
|---|---|
| New message in inbox | `arrived` |
| `UNREAD` removed | `opened` (no dwell time) |
| `INBOX` removed, was read | `archived` |
| `INBOX` removed, still unread | `archived_unread` |
| `TRASH` added | `deleted` |

Channel B is lower fidelity (no dwell, weaker `search_retrieved`).

**Fingerprinting on arrival.** A newly seen message is resolved to a stream by
matching every stream definition on sender, domain, or **normalized subject
template** — digits, dates, and order/tracking codes stripped so "Order #12345
shipped" and "Order #98765 shipped" collapse to one template. A message may
belong to several streams; rule precedence resolves conflicts.

**Reconciliation.** An action seen by both channels is deduped by
`message_id + event` within a time window — Channel A wins.

**Privacy.** The log stores sender, normalized subject, and event types — never
message bodies.

## The trend pipeline: stream → verdict → opportunity → rule

**Step 1 — Verdict (deterministic).** The engine recomputes StreamStats on a
schedule. A stream becomes a *candidate* when stats cross configurable Settings
thresholds (e.g. ≥8 messages over ≥21 days, plus a clear pattern). No AI.

**Step 2 — Opportunity (deterministic pattern → suggestion template).** The
starting set, explicitly open for growth:

| Verdict pattern | Suggested template |
|---|---|
| Open rate ≈ 0, consistent archive | Auto-archive / delete / *unsubscribe* (unsubscribe only if `has-unsubscribe`) |
| Opened early, now never (decayed) | Same, framed "you used to read these" |
| Archived, never deleted, occasionally `search_retrieved` | Auto-mark-read + archive + label (the receipt pattern) |
| Fast opens, replies | Importance boost — *not* a filter |

Each opportunity card shows the **evidence** (the actual stats) — never a black
box.

**Extensibility.** The table is a registry, not hardcoded logic. Two layers:
1. **Named signals in StreamStats** — the engine computes named derived signals
   as additive columns (`ignored`, `decayed`, `reference_like`, `escalating`),
   each a boolean or 0–1 score. New nuance = a new signal column; schema is
   append-only.
2. **An OpportunityType registry** — a declarative list, each entry
   `id, predicate (a combination of named signals), suggestion_template,
   ai_framing`. The engine walks the registry and fires the strongest match.
   Adding a verdict = one registry entry (+ maybe one signal). No engine
   rewrite. Some entries may live in the Settings tab for tweaking without a
   deploy.

**Step 3 — Surfacing (non-nagging, bidirectional).** Opportunities reach the
user two ways: a periodic **Tidy digest** (a card stack behind a badge — never
push spam), and **proactively** — select a batch in the swipe deck and tap
"make a rule from these." Either way the user initiates; the app only offers.

**Step 4 — AI concierge (only when a card is opened).** AI receives a small
metadata payload — sample senders/subjects plus the deterministic verdict — and
does three narrow jobs: **name** the stream in plain English, **classify** its
intent into the taxonomy, **draft** the rule (conditions + treatment). The user
can also ask it to **subdivide** the stream into narrower stream definitions.

**Step 5 — Human refinement → approval.** The user edits the stream definition
and the draft rule, by hand or with AI. Nothing is auto-created.

## Rule engine, treatments, transparency

**Treatments, split by reversibility:**
- *Non-destructive:* `add/remove_label, mark_read, archive, snooze,
  create_calendar_event`.
- *Destructive / hard-to-undo:* `trash, mark_junk, unsubscribe`.

**Rule lifecycle.** On approval a **non-destructive rule goes live immediately**
— no cooldown. **Destructive rules** never become fully autonomous: they stay at
"suggest" or "act + confirm each," always with warning-and-guidance. A
**dry-run/shadow** mode exists as an *optional per-rule toggle* if the user
wants to watch a rule first — never forced.

**Rule evaluation.** Each trigger cycle the engine resolves newly-arrived
messages to streams and finds matching enabled rules. **Precedence** when
several match: most-specific trigger wins (explicit sender > domain >
subject-template > detector), ties broken by rule order. Every action writes an
AuditLog row with an `undo_token`. Actions are **idempotent** — keyed by
`message_id + rule_id`, with a current-state check, so trigger re-runs never
double-apply.

**Everyday transparency = the retrospective digest.** The AuditLog, surfaced as
*"I archived 23 things today because of [rules] — Review / Undo / Refine."* This
is the primary day-to-day trust mechanism.

**Trust scoring (rules are behaviorally scored, like emails).** A rule has one
**trust score** — a recent-window ratio of overrides ÷ actions, computed with
the same scoring function used for email importance. This is one number, not a
state machine.
- **Autonomy is a one-time explicit human gate:** the user decides a rule may
  *act* (vs suggest-only). Never auto-granted. Destructive treatments are capped
  here — allowed to act, but never past "confirm each."
- **Notification loudness follows the trust score automatically:** low score →
  per-action notices; high score → consolidated digest. Nothing ever goes fully
  silent — the quietest band still appears in the retrospective review.
- **Overriding a rule lowers its score → it gets louder again on its own.** Drop
  far enough and it reverts to suggest-only and pings the user to refine it.

So: *humans grant autonomy; behavior tunes loudness.*

**The Simulator (first-class, on-demand tool — never a gate).** Inputs: a
selected batch of real emails, or a typed hypothetical email. Output, per
email: streams matched → detectors fired → rules matched → treatment that would
apply, with the reasoning chain. It runs against a **triage-strategy
abstraction** — today's strategy is the deterministic rule set; a future
*AI-triage* strategy plugs into the exact same simulator. That is where the
simulator becomes essential: nondeterministic AI triage needs a sandbox to
build trust before being relied upon.

## The snooze & importance engine

The *second engine* fed by the behavior log (the first being filtering rules —
same observation, two outputs).

**The importance score is the master dial.** Per sender/stream, from behavior:
fast opens and replies push it up; archive-unread, long snoozes, and deletes
push it down; an explicit "make important" pins it high.

- **Exponential-backoff snooze.** Snoozing applies a `Snoozed` label and removes
  `INBOX`; the engine restores it at `snooze_until`. Re-snoozing the same item
  increments `backoff_stage` — each interval longer than the last. After enough
  rounds the item hits a **grace state**, then auto-archives. Low importance
  backs off faster; high importance resists.
- **Escalation (the inverse).** A high-importance item left unhandled raises its
  `escalation_level` over time — pinning higher in the deck, stronger visual
  treatment, a "resurfaced 3×" badge, possibly an earlier un-snooze and
  re-notification. It keeps getting louder until the user replies, archives, or
  explicitly dismisses.
- **Auto-archive stale inbox.** Items untouched past a threshold enter the grace
  state → warned → auto-archived. Importance scales the threshold: junk goes
  quickly, important mail escalates instead.
- **Auto-unsubscribe.** A stream with `has-unsubscribe` plus sustained zero
  engagement enters the unsubscribe path — but unsubscribe is destructive-
  capped, so this is an **assertive *suggestion***, never silent.

**Grace + guidance, always.** Before any auto-archive or unsubscribe, items
appear in the digest: *"These 5 will auto-archive in 2 days — Keep / Archive
now / Make a rule."* All windows and the backoff curve live in Settings.

## UX & views

**The swipe deck is home.** Mobile-first, one email per card. Gesture vocabulary
(remappable in Settings):

| Gesture | Action |
|---|---|
| Swipe right (partial) | Archive |
| Swipe right → screen edge | Trash |
| Swipe left | Snooze (quick-pick durations) |
| Tap | Open thread |
| Long-press | Multi-select (batch → rule, or the Simulator) |

A graduated right-swipe avoids burning the vertical axis; the card's color and
icon flip at the archive→trash threshold so the user sees which will fire before
releasing. Undo on everything. Swipe-up is unassigned (room to grow). The less
frequent actions — tag, mark-important, reply, unsubscribe — live as a
**quick-action row** on each card.

**Detector affordances appear inline.** An `is-event-ish` card shows a 📅 chip;
detectors decorate cards without cluttering the deck.

**Views (each just a rendering over labels/state):**
- **Inbox-zero deck** — the above.
- **Snoozed** — what is returning, when, at which backoff stage.
- **Todo** — `label:todo` as a checklist; checking an item = archive.
- **Stream / tag browse** — drill into any stream or tag.

**Other surfaces:**
- **Tidy digest** — the Opportunity card stack, behind a badge.
- **Rules dashboard** — every rule: what it does, trust score → current
  loudness, match count, "why it fired," enable/disable/refine. Includes the
  **AuditLog feed** ("what I did") with one-tap undo.
- **Simulator** — pick emails (long-press) or type a hypothetical; see the
  per-email reasoning chain.
- **Tag manager** — curate the nested taxonomy, mapped onto Gmail labels.
- **Refinement screen** — where the AI concierge and hand-editing of
  streams/rules happen.

**Compose stays minimal** — reply and basic new-message only. Deep search,
attachments, and rich composing intentionally fall back to the Gmail app.

## Detectors & the calendar carveout

**Detectors** are deterministic per-email property checks, run at fingerprint
time and stored. They are **orthogonal to streams**. Starting catalog:

- `has-unsubscribe` — `List-Unsubscribe` header present.
- `is-receipt-ish` — commerce-style sender + subject keywords (receipt/order/
  invoice/confirmation) + an amount.
- `is-event-ish` — `.ics` attachment, or a date/time plus RSVP/register/
  webinar/event language.
- `has-amount` — currency pattern.

Like the OpportunityType registry, detectors are a **declarative registry** —
each entry `id, predicate, confidence`. Adding a detector = one entry.

**Event treatment.** When `is-event-ish` fires, the card shows a 📅 chip. It is
always an **offer** — not every email with a date is a calendar event. Tapping
it:
1. **Parses the event.** A `.ics` is structured. Otherwise deterministic regex
   catches obvious dates; messy cases fall to **on-demand AI extraction** (only
   on this tap, small payload).
2. **Proposes a reminder ladder** — implemented as snoozes. Virtual → 24h +
   15min. Distant/IRL → weeks ahead. The default ladder is picked by event type;
   a stream may carry its own default; the user confirms or edits.
3. **Offers "add to Google Calendar."**

**The calendar carveout** — the system's only non-email external write — goes
through an Apps Script web-app endpoint holding the `calendar.events` scope. It
creates the event (optionally with reminders) and links back to the source
email in the description.

## Auth, scopes, quotas, error handling

**OAuth scopes (all per-user):**
- `gmail.modify` (read, label, archive, trash, mark-read) + `gmail.send`
  (reply, and `mailto:` unsubscribe).
- `spreadsheets` + `drive.file` — `drive.file` confines the app to only the
  Sheet it created.
- `calendar.events` — create events only.

**Verification.** Gmail scopes are restricted, but with a few known users the
project stays in Google's **test-user mode** (≤100 users, no security
assessment). Each user is added to the consent screen's test-user list and
clicks past one "unverified app" warning.

**Two authorizations per user** (mild friction): the **PWA** does browser-side
OAuth (Google Identity Services) for Gmail + Sheets; the **Apps Script copy**
each person installs authorizes its own scopes (Gmail, Sheets, Calendar,
external fetch for AI) and runs its triggers as that user.

**Quotas — all comfortable:** Gmail API per-user limits are generous; Apps
Script triggers (~90 min/day runtime, 1-min min interval, 20k URL fetches/day)
are ample; Sheets' 60 writes/min/user is handled by batched writes.

**Error handling:**
- **Behavior log:** the PWA buffers events in IndexedDB; if Sheets is
  unavailable, queue and flush later (the PWA is offline-capable regardless).
- **History API:** `historyId` can expire (~1 week) → fall back to a full
  re-sync.
- **Rule engine idempotency:** actions keyed by `message_id + rule_id` with a
  current-state check, so trigger re-runs never double-apply.
- **AI failures degrade gracefully** — deterministic paths keep working; AI is
  never in the hot path.
- **Undo:** each AuditLog row stores an `undo_token` describing the inverse
  action.

## Phased MVP roadmap

Each phase is independently useful; intelligence is added progressively over a
foundation that already works.

- **Phase 0 — Foundation.** OAuth, PWA shell, Gmail read, swipe deck
  (archive/snooze/trash + undo), the Sheet, behavior logging (both channels).
  *This alone is a usable lightweight Gmail client — ship it first.*
- **Phase 1 — Snooze engine.** Exponential backoff, Snoozed view, importance
  score, auto-archive-stale with grace/guidance. Event detector + 📅 chip +
  calendar carveout.
- **Phase 2 — Streams & verdicts.** Fingerprinting, StreamStats, the
  named-signals layer, the Tidy digest of opportunities (deterministic only, no
  AI yet). Tag manager.
- **Phase 3 — Rules engine.** Rule creation from opportunities/batches,
  treatments, trust scoring, AuditLog digest, the Simulator.
- **Phase 4 — AI concierge.** The pluggable AI layer: name/classify/subdivide
  streams, draft rules, messy event extraction.
- **Phase 5 — Polish.** Auto-unsubscribe path, escalation, Todo view, registry
  expansion.

## Open questions / things expected to evolve

- The data model tab schemas will likely gain columns as functionality deepens
  (schemas are append-only).
- The OpportunityType and Detector registries start small and grow.
- The Simulator's value rises sharply if/when an AI-triage strategy is added.
