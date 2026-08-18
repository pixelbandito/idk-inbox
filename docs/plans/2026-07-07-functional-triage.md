# Functional Triage Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Take the app from "gestures dispatch stubbed actions" to an installable
PWA where swipe-to-archive/trash/tag/snooze actually mutate Gmail, tags appear
as their own lists, snooze can be relative to a recognized event date, and one
behavioral heuristic proactively suggests unsubscribe / auto-archive.

**Architecture:** Keep the existing producer → trigger → action-map → dispatcher
pipeline untouched. Replace the thread-write *handlers* (currently console
stubs) with a small Gmail write client, injected via a factory so handlers stay
pure and testable. New capabilities (snooze wake-up, event dates, sender
heuristic) are pure modules in `src/lib/**` with thin UI hookups. Everything
runs client-side against the Gmail REST API with the user's OAuth token — the
Apps Script engine from the original design stays future work.

**Tech Stack:** React 19, Vite 8, vite-plugin-pwa, Vitest + Testing Library,
Gmail REST API v1, Google Identity Services (already wired, scope
`gmail.modify` already requested).

**Working rules for every slice:**

- TDD: failing test → minimal implementation → green → commit.
- Uncle Bob mindset: small functions, one abstraction level, names over
  comments; doc comments are terse and explain *why* / the use case.
- After each slice: run full suite + lint, then adversarial subagent review
  (DX, UX, security, quality), fix findings, commit.

---

## Context a fresh engineer needs

- **Dispatch flow:** DOM event → producer (`src/triggers/producers/*`) →
  trigger symbol (`src/triggers/triggers.ts`) → `ACTION_MAP` lookup
  (`src/triggers/actionMap.ts`) → `argsFor` builds args → dispatcher
  (`src/state/DispatchProvider.tsx`) runs the registered handler. Handlers
  return `ActionResult` with an optional `inverse` that powers undo.
- **Thread writes are stubs:** `src/actions/threadWrites.ts` logs and returns
  fake success. This plan replaces them.
- **Labels:** Gmail's modify API takes label *IDs* (`Label_123`), not names.
  System labels (`INBOX`, `TRASH`, `SPAM`, `UNREAD`) have id == name. The app
  namespaces its labels under `idk-inbox/` (`src/lib/gmail/labelBootstrap.ts`).
- **Trash is special:** `threads.modify` rejects adding/removing `TRASH`; use
  `threads.trash` / `threads.untrash` endpoints instead. The write client hides
  this so action handlers and undo entries can keep speaking in labels.
- **Refresh gap:** `DispatchProvider` has `bumpRefresh` but discards the
  counters; `ThreadlistPanel` only loads on mount / manual ↻. Slice 1 closes
  this loop or lists will look frozen after a successful write.
- **Snooze model:** snooze = remove `INBOX`, add `idk-inbox/Snoozed` +
  `idk-inbox/Snoozed/<bucket>` where `<bucket>` encodes the wake time. With no
  server, the *client* sweeps due threads back to INBOX on app load/refresh.
- **Token access:** actions get the OAuth token via a `getToken` prop threaded
  into `DispatchProvider` (same accessor `App.tsx` already holds).

---

## Slice 1 — Real thread mutations + refresh-after-write

**Files:**
- Create: `src/lib/gmail/threadWriteClient.ts` (+ test)
- Create: `src/lib/gmail/labelIds.ts` (+ test)
- Rewrite: `src/actions/threadWrites.ts` (+ test) — factory
  `createThreadWriteActions({ getToken })`
- Modify: `src/state/DispatchProvider.tsx` — accept `getToken`, register real
  handlers, bump a threads-refresh counter after successful thread-writes
- Modify: `src/state/dispatchContexts.ts` — expose the refresh counter
- Modify: `src/panels/ThreadlistPanel.tsx` — reload when the counter bumps
- Modify: `src/App.tsx` — pass `getToken`

**Design:**

- `labelIds.ts`: `resolveLabelIds(token, names, { createMissing })` → maps
  names to ids, creating `idk-inbox/*` labels on demand. Session-scoped cache;
  invalidated on label create. System label names pass through unchanged.
- `threadWriteClient.ts`: `modifyThreadLabels(token, threadIds, { add, remove })`
  — resolves names → ids, translates TRASH add/remove into trash/untrash calls,
  fans out per-thread with `Promise.allSettled`, reports per-thread failures.
- `threadWrites.ts`: handlers keep exactly the current shapes/inverses (tests
  largely carry over) but call the client. `ok:false` with a readable error on
  any failure; partial failure reports counts.
- Refresh: the dispatcher wrapper bumps `threadsRefreshCount` after a
  successful `thread-write` action; `ThreadlistPanel` effect depends on it.
  (Undo/redo of thread-writes also route through actions, so they bump too.)

**Steps (repeat per module):** write failing test → run → minimal impl → green
→ commit. Verify manually with `npm run dev` against the real inbox at the end
of the slice: swipe archives/deletes/labels/snoozes and the row disappears.

## Slice 2 — Snooze that actually snoozes

**Files:**
- Create: `src/lib/snooze/bucket.ts` (+ test) — encode/decode wake time to a
  label-safe bucket name (`idk-inbox/Snoozed/2026-07-09T09`)
- Create: `src/lib/snooze/wakeSweep.ts` (+ test) — find due snoozed threads,
  return them to INBOX, drop snooze labels
- Modify: `src/pickers/SnoozePicker.tsx` (+ test) — real `datetime-local`
  input replacing the "Custom (placeholder)" button
- Modify: `src/App.tsx` — run wake sweep after sign-in bootstrap, then bump
  refresh

## Slice 3 — Tags as their own lists

**Files:**
- Create: `src/lib/gmail/fetchLabels.ts` (+ test) — user labels, sorted, with
  message counts where cheap
- Create: `src/panels/LabelsPanel.tsx` (+ test) — lists labels; tapping
  dispatches `open-panel` with `{ kind: 'threadlist', label }`
- Modify: `src/layout/types.ts` — add `{ kind: 'labels' }` panel
- Modify: `src/actions/layout.ts` — `openPanel` accepts threadlist/labels kinds
- Modify: `src/App.tsx` — render LabelsPanel; add it to initial panels
- Modify: `src/pickers/LabelPicker.tsx` — suggestions from real labels

## Slice 4 — Event-date recognition → relative snooze

**Files:**
- Create: `src/lib/events/detectEventDate.ts` (+ test) — deterministic parse
  of future dates from subject + snippet (ISO dates, `Jul 12`, `7/12`,
  weekday + time forms). Returns the most confident future date or null.
- Create: `src/state/threadSummaryCache.ts` (+ test) — plain Map cache
  populated by list fetches so overlays can look up summaries by threadId
- Modify: `src/pickers/SnoozePicker.tsx` (+ test) — when the (single) target
  has a detected future event date, prepend options: "Evening before <date>",
  "Morning of <date>"

## Slice 5 — Sender heuristic → proactive suggestion

**Files:**
- Create: `src/lib/heuristics/triageLog.ts` (+ test) — localStorage-backed
  log: sightings (sender, messageId, receivedAt) from list fetches; triage
  events (sender, action, wasUnread, at) from successful writes
- Create: `src/lib/heuristics/senderFatigue.ts` (+ test) — pure evaluator:
  sender with ≥5 messages in 14 days where ≥80% were archived/deleted unread
  → `Suggestion { sender, stats }`
- Create: `src/feedback/SuggestionCard.tsx` (+ test) — card above the inbox
  list: "You've dismissed 9 of 10 emails from X unread" with actions
  Unsubscribe / Auto-archive future / Dismiss
- Create: `src/lib/rules/autoArchive.ts` (+ test) — locally stored rules
  (`from:` matcher), swept client-side on load/refresh
- Modify: `fetchByLabel.ts` — also request `List-Unsubscribe` header
- Modify: unsubscribe handler — one-click POST when advertised, else open URL
  / mailto

## Slice 6 — Install from LAN over HTTPS

**Files:**
- Modify: `vite.config.ts` — `server.host = true`; https cert/key read from
  `DEV_TLS_CERT` / `DEV_TLS_KEY` (paths) when set; same for `preview`
- Modify: `docs/SETUP.md` + `.env.example` — cert generation with a custom CA,
  trusting it on devices, adding `https://<lan-host>` to the OAuth client's
  authorized JavaScript origins
- Verify: `npm run build && npm run preview` serves installable PWA

## Review checkpoints

After slices 1–2, 3–4, and 5–6: dispatch four adversarial subagents (DX, UX,
security, quality) over the new code, triage findings, fix what's real, commit.
