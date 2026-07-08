# Followups

Things noted as needing work later. Add to / re-order freely. When something
ships, drop the bullet rather than checking it off — git history is the record.

## UX / affordances (need design input — don't YOLO)

- **Selection-mode indicator.** Dispatch state has `mode`, nothing renders it.
  Without it, selection-mode-scoped actions (delete, batch label, etc.) are
  effectively untestable.
- **Focused-panel indicator.** Same situation as selection mode; `ctx
  .focusedPanelIndex` exists, nothing surfaces it.
- **Overscroll-to-close feels sensitive.** Threshold is 80px (matches legacy).
  Likely wants some combination of: longer pull distance, brief delay before
  commit, and a visual "about to close" affordance.
- **Snooze + label picker positioning.** Pickers render in awkward locations;
  styling debt from Phase 0c.

## Styling / markup

- **Max widths + enforced wrapping** — done for inbox rows + thread bodies
  (2026-07-07).
- **HTML mail rendering with sanitization** — thread bodies are still plain
  text. Rendering real HTML safely needs a sanitizer (DOMPurify or similar) +
  CSS containment; it's a dependency/security decision, tracked as its own
  slice.
- Owner wants tight control over markup and CSS — use newest elegant patterns,
  keep simple.

## Swipe affordance (landed 2026-07-07)

Live distance-tiered row drag shipped (`docs/plans/2026-07-07-swipe-affordance*`).
Deferred / tunable:

- **Thresholds** (25% arm, 70% heavy) live in `ROW_SWIPE_BINDINGS`
  (`src/input/swipeIntents.ts`) — tune freely.
- **Trackpad wheel sign**: `useRowSwipe`'s wheel session uses natural-scroll
  mapping (`wheelDx = -accX`); flip the sign there if a two-finger swipe feels
  inverted on your hardware.
- **User-configurable swipe slots**: the bindings table is the seam — a
  settings screen persists an override and passes it to `resolveSwipeIntent`.
  No engine change needed.

## Auth / sign-out

- **Signed-out state shows nothing useful.** Panels render "Sign in to view";
  no sample/demo data path exists, so the signed-out flow can't be exercised
  without re-auth.

## Deferred from the functional-triage review (2026-07-07)

- **No optimistic row removal / swipe visual.** Between finger-lift and the
  refetch completing, the UI is inert. List reads are consistent now
  (`labelIds=`), so the row does vanish on refetch — but a brief optimistic
  hide would feel snappier on cellular. Also: the suggestion card pops in
  after the list settles and shifts rows down (tap-misdirection risk) — reserve
  its space or compute synchronously.
- **Sweeps run once per page load.** A long-lived PWA tab never re-sweeps
  (wake-snoozed + apply-auto-archive); threads coming due mid-session wake on
  next reload. Consider a `visibilitychange` re-sweep.
- **Thread-write inverses assume INBOX provenance.** Undoing a delete made
  from a tag list restores INBOX, which the thread may never have had.
  Proper fix: capture prior labelIds per thread at write time.
- **`fetchThread.ts` still hand-rolls BASE/auth** — fold into
  `lib/gmail/http.ts` on next touch.
- **SnoozePicker "This weekend" on a Saturday means next Saturday**
  (`nextWeekday`'s `|| 7`). Unspecified; decide and test.
- **`labelVersions` is keyed by focusedLabel.** refresh-panel on a non-label
  panel bumps an `idx:N` key no panel watches — refresh is a no-op there.
- **Resolved suggestions & auto-archive rules are permanent with no UI to
  revoke.** `removeAutoArchiveRule` exists but nothing calls it; no
  un-dismiss surface. Wants a settings view (and maybe re-suggest-after-N-days).
- **LabelsPanel has no filter** for large label sets, and refetches the full
  label list on every thread write (chatty, invisible).
- **DispatchProvider imports a heuristic** (`recordTriageForThreads` +
  `TRIAGE_BY_ACTION`). Cleaner: a generic `onThreadWriteSuccess` observer
  seam wired from App, with the triage mapping living in `lib/heuristics`.
- **ThreadWriteDeps is accreting seams** (`sweep`, `autoArchive`,
  `openExternal`) while unsubscribe reaches the summary cache singleton
  directly. Consider splitting maintenance/unsubscribe into their own factory.

## Code cleanup (low priority)

- **Block-axis swipe triggers** (`swipeBlockEnd`, `swipeBlockStart`) are
  reserved in the registry but unassigned in any surface's action map.
- **Overscroll producer's `OVERSCROLL_PX = 80`** is hard-coded. Parameterise
  if anyone ever wants a per-surface tuning knob. (`src/triggers/producers/fromOverscroll.ts`)
- **`ACTION_CATALOG` is hand-maintained alongside `ACTIONS` + the side maps.**
  Reasonable next step is to derive the catalog from those rather than keep
  two parallel lists. Out of scope until the palette grows a real consumer
  that needs more fields than today's `label` / `category` / `previewFor` /
  `keyboardCue`.

## See also

- `docs/plans/2026-06-07-trigger-system-design.md` — design context for the
  trigger items above.
- Older Phase 0b deferrals (StashColumn wiring, mouse/keyboard nav) live in
  the project memory file, not here — surface them if they re-enter scope.
