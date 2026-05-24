# Phase 0b — Layout Framework & Read-Only Multi-Panel UX — Design

**Date:** 2026-05-23
**Status:** Validated design, ready for implementation planning
**Builds on:** Phase 0a (`docs/plans/2026-05-16-phase-0a-scaffold-oauth-inbox.md`)
**Project design doc:** `docs/plans/2026-05-16-inbox-zero-design.md`

## Summary

Replace the Phase 0a single-screen inbox with a **panel-based layout
framework**: a linear sequence of panels (Settings, label-viewers,
threads) that the user navigates one panel at a time on mobile and side-
by-side on wider screens. Phase 0b lands the framework with **read-only**
behavior — no writes, no row gestures, no snooze picker. Those land in a
separate "actions phase" with its own brainstorm covering a unified
gesture / mouse / keyboard / button model.

Also lands the deferred Phase 0a follow-ups: `TokenStore.isValid` wired
into the auth flow, and an explicit sign-out path.

## Guiding principles

- **Layout is one flat array of panels.** The information architecture is
  tree-shaped (Settings, label-views with threads as children), but the
  layout engine flattens it depth-first into a linear sequence. Less
  code, simpler nav.
- **Two distinct swipe surfaces.** Swipe on a panel's `<header>` moves
  focus between panels. Swipe on a row inside a threadlist is reserved
  for row actions — those land in the next phase, not 0b.
- **Closeability is type-dependent.** Settings and threadlists never
  leave the array; they stash off-screen with a slim restoration edge.
  Threads can be truly closed (removed from the array) by overscrolling
  past the bottom.
- **Minimal, semantic HTML.** `<main>` → `<section>` per panel →
  `<header>` + body. Custom styling layered on later.
- **Read-only.** Phase 0b proves the spatial UX. Writes follow in the
  next phase.

## Scope

**In:**
- The layout primitive: panel sequence, header swipe → panel nav on
  mobile, wide-screen multi-panel with resizable widths.
- Stash column for off-screen panels (slim, sliced, count badge).
- **Settings** panel — sign-in / sign-out, `TokenStore.isValid` wired
  into all Gmail calls.
- **Threadlist** panel — generic label-viewer; reads from one Gmail
  label, shows rows; tap a row to open its thread.
- **Thread** panel — read-only display of the messages in a thread.
- **Label bootstrap** — ensure `InboxZero` and `InboxZero/Snoozed`
  labels exist on first run (idempotent).
- Default sequence: `[Settings, Inbox, InboxZero/Snoozed]`. Snoozed
  will look empty until the actions phase fills it.

**Out (saved for the actions phase that follows 0b):**
- Row swipe gestures (archive / trash / snooze on rows).
- Gmail writes of any kind (label changes, trash, etc.).
- Snooze duration picker, undo toast.
- Reply / compose.
- Multi-select.
- Pull-to-refresh.
- A unified gesture / mouse / keyboard / button mapping model — its own
  brainstorm, then phase.

**Still later (Phase 0c):**
- Sheet datastore, Apps Script project, behavior logging on both channels.

## Decisions locked in

| Topic | Decision |
|---|---|
| Layout shape | Flat array of panels; depth-first flattening of the IA tree. |
| Panel types in 0b | `settings`, `threadlist` (one label per panel), `thread`. |
| Header swipe | Moves focus one panel in the sequence (sticky-scroll). |
| Row interactions in 0b | Tap-only (opens thread). No swipes. |
| Thread close | Overscroll-past-bottom = remove from sequence. Swipe-header-right = stash (still in sequence, just off-screen). |
| Snoozed panel | A normal threadlist with `label = 'InboxZero/Snoozed'`. No special-casing. |
| Label namespace | `InboxZero/<sublabel>` for everything the app creates. |
| Default panel sequence | `[settings, threadlist('INBOX'), threadlist('InboxZero/Snoozed')]`. |
| Routing | None in 0b. State is in-memory; reload returns to default. URL deep-linking is later. |

## Architecture — the layout primitive

### State shape

```ts
type Panel =
  | { kind: 'settings' }
  | { kind: 'threadlist'; label: string }    // 'INBOX' or 'InboxZero/<sublabel>'
  | { kind: 'thread'; threadId: string; sourceLabel: string };

interface LayoutState {
  panels: Panel[];           // depth-first linearization of the IA tree
  focusIndex: number;        // panel currently centered in the viewport (mobile)
                             // — on wide screens this is the "anchor" panel
}
```

`sourceLabel` on `thread` records which threadlist the thread was opened
from. Used for insertion-order rules (a new thread from `INBOX` inserts
immediately after the `INBOX` threadlist, pushing any other `INBOX`-
sourced threads further right).

### IA-tree → flat sequence

The IA is:

```
Settings
Inbox (threadlist)
  ├─ Thread A
  └─ Thread B
InboxZero/Snoozed (threadlist)
  └─ Thread C
…
```

The flat layout array is the depth-first walk:

```
[Settings, Inbox, ThreadA, ThreadB, InboxZero/Snoozed, ThreadC, …]
```

### Insert / remove rules

- **Open thread from threadlist L:** insert the new `thread` panel
  immediately after the threadlist `L` in the array. Any existing
  thread panels with `sourceLabel = L` get pushed further right —
  newest sits adjacent to its source.
- **Close thread (overscroll-bottom):** remove the panel from the
  array. Layout reflows; neighbors come together. Focus jumps to the
  source threadlist (or the panel immediately to the closed thread's
  left).
- **Stash thread (header swipe right):** no array change. The viewer
  just navigates one panel left; the thread remains in the array,
  off-screen-right.
- **Settings / threadlists never leave the array** in 0b.

## HTML — minimal and semantic

```html
<main class="panels" role="region" aria-label="Workspace">
  <section class="panel" data-kind="settings" aria-label="Settings">
    <header class="panel__header">Settings</header>
    <div class="panel__body">…</div>
  </section>

  <section class="panel" data-kind="threadlist" data-label="INBOX"
           aria-label="Inbox">
    <header class="panel__header">Inbox</header>
    <ul class="threadlist">
      <li class="email">…</li>
      …
    </ul>
  </section>

  <!-- thread panels are inserted here when opened from INBOX -->

  <section class="panel" data-kind="threadlist"
           data-label="InboxZero/Snoozed" aria-label="Snoozed">
    <header class="panel__header">Snoozed</header>
    <ul class="threadlist">…</ul>
  </section>
</main>
```

Every panel has the same outer shape (`<section>` → `<header>` +
`<div class="panel__body">` or `<ul>`). The styling is owned by the
user later; the markup just establishes the semantic structure.

## Layout engine — CSS-first

```css
.panels {
  display: flex;
  flex-direction: row;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  scroll-behavior: smooth;
}

.panel {
  flex: 0 0 var(--w, 100dvw);    /* mobile default: full viewport width */
  scroll-snap-align: start;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.panel__body {
  flex: 1;
  overflow-y: auto;
  overscroll-behavior-y: contain;  /* see "Overscroll close" below */
  min-height: 0;
}

@media (min-width: 768px) {
  .panel { --w: 420px; }
  .panel[data-kind="thread"] { --w: 560px; }
}
```

The browser handles snap-scrolling. JS only does:

1. Sets `--w` per panel for resize.
2. Calls `el.scrollIntoView({ inline: 'start', behavior: 'smooth' })`
   when changing `focusIndex` programmatically.
3. Detects swipe gestures on `<header>` and translates them to
   `focusIndex ± 1`.

## Panel navigation

### Mobile (one panel visible)

The `<header>` is the swipe surface. A horizontal swipe on a header
shifts `focusIndex` by ±1, and the engine smooth-scrolls the next
panel into view. Implementation:

- Pointer events on `<header>` track horizontal drag distance.
- Past a threshold (~25% of viewport width), commit to a focus shift.
- Below the threshold, snap back to current focus.

### Wide screens (multiple panels visible)

Multiple panels are simultaneously visible (default panel width
`420px`; viewport `1200px` shows roughly 2–3 panels). Header swipe
still shifts focus by 1 panel; the viewport scrolls so the new anchor
panel is at the same screen position the old one occupied.

Mouse: panels are resizable by dragging their right edge — a thin
1px-wide grabber sits at `right: 0` of each panel. Drag updates the
panel's `--w` CSS variable. Resize is layout-local; it does not move
focus.

**Mouse nav buttons** are deferred to the gesture-model phase, where
the unification of input modalities (gesture / mouse / keyboard /
button) is the explicit topic. For 0b the mouse can drive nav via:

- Click anywhere on a non-focused panel's header to focus it.
- Click a header chevron (▸ / ◂) for explicit ±1 nav.

That's the minimum to make wide-screen mouse navigation work without
pre-committing to the unified model.

## Stash column (collapsed panels)

When the layout array contains more panels than fit on-screen, the
extras are "stashed" off-screen left or right. The stash is **not**
an empty area — it's a slim, dense visualization.

**One click-target-width column per side** (e.g. `44px`), reserved
when at least one panel is stashed on that side. The column contains:

- *n* vertical slices, each `1/n` of the column's width, in array
  order (left-to-right inside the column mirrors the panel's position
  in the sequence).
- A count badge overlay (e.g. *"3"*) showing how many panels are
  stashed on that side.

Interactions on the stash column (target for 0b):

- **Click anywhere on the column → scroll the *nearest stashed
  panel* into view.** Simple, works on touch and mouse.
- **Click a specific slice → scroll *that* panel into view.** Slices
  are tiny when n is large, so this is a mouse-friendly affordance;
  on touch the bulk click handles it.

If on-disk implementation cost of slicing is high, the v1 may ship with
the count badge and bulk-click behavior, slices arriving as a
refinement. The state model already supports both — no rework needed.

## Panel types

### Settings panel

`<header>` shows *Settings*. Body contains, in 0b:

- **Signed-in status** — email of the authenticated account (read from
  the Google token's profile if available, or just a generic "Signed
  in" if not). Otherwise a "Sign in with Google" button.
- **Sign out** button — calls `tokenStore.clear()`, resets the app's
  in-memory state, and pushes the user back to the signed-out view.

`TokenStore.isValid` is consumed app-wide here (see "Auth wiring"
below). The Settings panel is the natural home for the visible
auth UI; the validity check itself runs before every Gmail call.

### Threadlist panel

`<header>` shows the label's display name (`INBOX` → "Inbox";
`InboxZero/Snoozed` → "Snoozed"; arbitrary `InboxZero/Foo` → "Foo").
Display-name derivation: strip the `InboxZero/` prefix and humanize
the remainder.

Body is a scrollable `<ul class="threadlist">` of `<li>` rows. Each
row reuses the 0a structure (from / subject / snippet, the
`email--unread` class for unread). Rows are **tap-only in 0b**:

- Tap → open the thread (panel inserted per "Insert / remove rules").

A small **Refresh** button lives in the header (manual refresh on
both mobile and wide). No auto-polling; no pull-to-refresh.

**Data:** generalize the 0a `fetchInbox` →
`fetchByLabel(token, label, maxResults = 25)`. The query changes from
`q=in:inbox` to `q=label:"${label}"` (with quotes for nested labels
that contain `/`). Everything else from 0a — `parseGmailMessage`,
`Promise.allSettled` per-message gets, the `{ emails, failed }`
return shape, the failed-count surfacing — carries over unchanged.

**Empty state:** show a small message ("No messages" / "Inbox zero
🎉" for `INBOX`). The Snoozed panel will look empty in 0b.

### Thread panel

`<header>` shows the thread's subject. Body is a vertical list of the
messages in the thread, each rendered as:

- A small sub-header: `From`, `To` (if present), date.
- The plain-text body of the message.

**Data:** a new `fetchThread(token, threadId)` calling
`users.threads.get?id=<threadId>&format=full`. The full thread
returns all messages with payloads.

**Body extraction (0b uses plain text only):** walk `payload.parts`
recursively, find the first part whose `mimeType === 'text/plain'`,
base64url-decode `body.data` and use that. If there's no text/plain
part, fall back to stripping tags from `text/html` (rare but
defensive). Rich HTML rendering is deferred to a later polish phase.

**Close affordances (no row gestures, but the panel itself has two):**

- **Overscroll the panel body past the bottom** → close the thread.
  The `panel__body` has `overscroll-behavior-y: contain` so that
  overscroll events don't propagate to the page; we listen for a
  `wheel` / `touchmove` past `scrollHeight + threshold` and treat it
  as a close gesture.
- **Swipe `<header>` right** → stash (Section 1's stash, not a
  remove). Routes through the standard panel-nav handler with a
  direction-aware destination.

A small `×` button in the header is available for mouse users (per
the "minimum to make wide-screen mouse work" carveout above). The
unified model phase will reconcile that with the gesture vocabulary.

## Label bootstrap

On first sign-in (and every subsequent app start, idempotently):

1. Call `users.labels.list`.
2. Check that two label names exist:
   - `InboxZero`
   - `InboxZero/Snoozed`
3. For each missing label, call `users.labels.create` with the
   missing `name`. Gmail does **not** auto-create parents — both
   labels are created independently if missing. Creating
   `InboxZero` first is cleaner but not required (the `/` in the
   child name renders nested in the Gmail UI either way).

The list ID returned by either `list` or `create` is cached in-memory
for the session — no Sheet/IndexedDB persistence in 0b.

This bootstrap runs once after sign-in; failures show in the Settings
panel as a non-blocking warning. The Snoozed threadlist will still
render (it just queries the label name; if missing, results are
empty).

## Auth wiring — Phase 0a follow-ups

The deferred items from the 0a final review land in 0b:

- **`tokenStore.isValid()` wired into every Gmail call.** Before
  `fetchByLabel` / `fetchThread` / label bootstrap, the caller checks
  `tokenStore.isValid()`. If invalid, the call short-circuits and
  triggers a re-auth (`useGoogleAuth.signIn()` again). Once the
  callback re-populates `tokenStore`, the original call retries.
- **`tokenStore.clear()`** wired to the Sign-out button in Settings.
  After clear, `signedIn` flips false (the hook listens for
  `tokenStore` invalidation) and the layout returns to the signed-out
  UI (which is just the Settings panel with a "Sign in" button).
- **Module-level `tokenStore` singleton** stays, but `useGoogleAuth`
  now exports a `signOut()` callback alongside `signIn` /
  `getToken` / `signedIn` / `error`.

These are small and orthogonal to the layout work; they ship in the
same phase for tidiness.

## Data flow per panel

| Panel | On mount | On refresh button | On user action |
|---|---|---|---|
| `settings` | (nothing) | — | sign in / sign out |
| `threadlist` | `fetchByLabel(token, label)` | refetch | tap row → insert `thread` panel |
| `thread` | `fetchThread(token, threadId)` | refetch | overscroll bottom → close; swipe header right → stash |

Each panel owns its own data, loading, and error state. The container
holds only the panel array and the focus index. No global cache; no
optimistic UI in 0b (no writes to be optimistic about).

## Component shape

A sketch of the file structure 0b will produce:

```
src/
  layout/
    LayoutContainer.tsx     // owns `panels` + `focusIndex`, renders <main>
    LayoutContainer.test.tsx
    PanelHeader.tsx         // header + swipe gesture detection
    PanelHeader.test.tsx
    StashColumn.tsx         // left/right stash visualization
    useFocusController.ts   // smooth-scrolls to focusIndex on change
  panels/
    SettingsPanel.tsx
    ThreadlistPanel.tsx
    ThreadPanel.tsx
  lib/
    gmail/
      fetchByLabel.ts       // generalized fetchInbox
      fetchByLabel.test.ts
      fetchThread.ts
      fetchThread.test.ts
      labelBootstrap.ts     // ensure InboxZero + InboxZero/Snoozed
      labelBootstrap.test.ts
      threadParse.ts        // walk parts → plain text
      threadParse.test.ts
    auth/
      useGoogleAuth.ts      // updated: + signOut, + isValid checks
```

Existing 0a files that move or change:

- `src/lib/gmail/fetchInbox.ts` → renamed/refactored to
  `fetchByLabel.ts` (the original `fetchInbox` becomes a one-liner
  `(token) => fetchByLabel(token, 'INBOX')` for backwards
  compatibility, or just deleted if no consumer remains).
- `src/components/InboxList.tsx` → moves to `panels/ThreadlistPanel.tsx`
  internals (it's now a sub-component of the threadlist panel).
- `src/App.tsx` → becomes a thin shell that renders
  `<LayoutContainer />`.

## Testing approach

Same shape as 0a — TDD pure logic and components; integration of the
gesture/scroll behavior verified manually.

**TDD'd:**
- `fetchByLabel` (the renamed/refactored 0a logic + new label-quoting
  behavior).
- `fetchThread` (mocked fetch, structural assertions).
- `labelBootstrap` (idempotency: existing labels skip create; missing
  labels create).
- `threadParse` (extract plain text from a Gmail payload tree).
- `LayoutContainer` array operations (insert / remove rules).
- `PanelHeader` swipe-to-focus-change with simulated pointer events
  (jsdom).

**Manual verification:**
- Mobile feel of snap-scrolling and header-swipe nav.
- Wide-screen multi-panel resize.
- Stash column appearance and click-to-focus.
- Overscroll-bottom thread close.
- Re-auth flow when `tokenStore.isValid()` returns false.

## Open questions / deferred / phasing

**Saved for the unified-input-model phase (next, after 0b):**

- Gestures vs mouse vs keyboard vs buttons as one model. Row swipes
  (archive / trash / snooze). Snooze duration picker. Undo toast.
  Reply / compose. Multi-select. Wide-screen mouse nav buttons.

**Saved for Phase 0c:**

- Sheet datastore, Apps Script project, behavior logging on both
  channels.

**Open within 0b (decide during implementation):**

- Mobile pointer threshold for header-swipe vs vertical-scroll
  intent. Calibrate during manual testing.
- Whether stash slices ship in v1 or as a follow-up (the count-badge
  + bulk-click subset is the v1 floor).

## Definition of Done

- A mobile user can sign in, see their Inbox, tap a row to read a
  thread, overscroll to close it, swipe between Inbox / Snoozed /
  Settings via the header.
- A wide-screen user can see Settings + Inbox + Snoozed side by
  side, resize panel widths by dragging edges, click to open a
  thread (it slots between Inbox and Snoozed), and stash threads
  off-screen with a slim column indicator.
- Sign-out clears the session and returns to the signed-out view.
- `InboxZero` and `InboxZero/Snoozed` labels exist in Gmail after
  first sign-in.
- All TDD units pass; build, lint, and a manual end-to-end pass.
