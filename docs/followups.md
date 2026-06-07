# Followups

Things noted as needing work later. Add to / re-order freely. When something
ships, drop the bullet rather than checking it off — git history is the record.

## Bugs

- **`DispatchProvider.tsx` hardcodes `focusedPanelIndex: 1`.** Overscroll-close
  and the thread "close" button both rely on this and always target panel 1.
  Needs real focus tracking. (`src/state/DispatchProvider.tsx:140`)
- **`useGesture` fires `onClick` after `onLongPress` on the same release.**
  The primitive doesn't track whether long-press already fired, so a held tap
  enters selection mode AND opens the thread. Fix at the primitive: suppress
  `onClick` when `onLongPress` just fired. (`src/input/useGesture.ts`)

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

- **Max widths + enforced wrapping** on email thread lists and thread details.
- **Rich-text formatting** in thread bodies.
- Owner wants tight control over markup and CSS — use newest elegant patterns,
  keep simple. Defer until there's explicit direction.

## Auth / sign-out

- **Signed-out state shows nothing useful.** Panels render "Sign in to view";
  no sample/demo data path exists, so the signed-out flow can't be exercised
  without re-auth.

## Code cleanup (low priority)

- **`ACTION_CATALOG.requiresAuth` / `.destructive`** are documentation-only
  now — no runtime consults them. Either derive from `CONFIRMATION_REQUIREMENTS`
  or strip. (`src/actions/catalog.ts`)
- **Block-axis swipe triggers** (`swipeBlockEnd`, `swipeBlockStart`) are
  reserved in the registry but unassigned in any surface's action map.
- **Overscroll producer's `OVERSCROLL_PX = 80`** is hard-coded. Parameterise
  if anyone ever wants a per-surface tuning knob. (`src/triggers/producers/fromOverscroll.ts`)

## See also

- `docs/plans/2026-06-07-trigger-system-design.md` — design context for the
  trigger items above.
- Older Phase 0b deferrals (StashColumn wiring, mouse/keyboard nav) live in
  the project memory file, not here — surface them if they re-enter scope.
