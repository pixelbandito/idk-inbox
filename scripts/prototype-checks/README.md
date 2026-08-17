# Prototype interaction checks

Browser-driven checks for the gesture rigs in `src/prototype/gesture/`. They exist
because these bugs live in territory jsdom cannot reach: DOM hit-testing under a
CSS transform, CSS scroll-snap, native scroll ordering, and platform wheel-event
flags. Vitest can't see any of it, so the app suite doesn't cover these rigs.

## Running

```sh
nvm use                       # Node 22.13+
npm run dev                   # the checks drive http://localhost:5173
npm i --no-save playwright-core   # or install it anywhere and adjust the import
node scripts/prototype-checks/native-scroll.mjs 520   # arg = viewport height
node scripts/prototype-checks/overscroll.mjs 520
node scripts/prototype-checks/drag.mjs
```

Each prints PASS/FAIL per check and exits non-zero on any failure.

`executablePath` points at a Playwright-cached Chromium
(`~/Library/Caches/ms-playwright/chromium-<rev>/...`). If it moves, update the
constant at the top of each file — `ls ~/Library/Caches/ms-playwright/` shows what
you have. **Chromium 151+ is required** for `WheelEvent.momentum`.

## Method notes worth knowing before editing these

- **Run at more than one viewport height.** At 1280x800 the sample article fits
  inside the card, so `maxScroll` is 0 and any check about "scrolling to the end"
  passes vacuously. 520 makes it genuinely scroll.
- **Dispatched wheel events can carry `momentum` but cannot scroll** (untrusted
  events perform no default action). **CDP's real scrolls** (`page.mouse.wheel`)
  **scroll but cannot carry the flag.** Neither can express "a fling arriving at
  the end under momentum", so those checks start from a parked-at-the-end state
  where no scrolling is needed to exercise the decision.
- **Chrome animates a wheel scroll**, so probing straight after `mouse.wheel`
  reads an intermediate position. Use the `settle()` helper, or an extra scroll
  gets sent and changes the state under test.
- **CDP round-trips can exceed the freshness gap**, so a loop of `mouse.wheel`
  calls is *not* a continuous gesture. Drive gesture semantics with dispatched
  momentum-flagged events instead.
- **`reset()` does not reload.** It re-navigates to the same hash URL, which is a
  same-document navigation, so the component is never remounted. A scenario that
  ends mid-animation leaks its state into the next one — and the symptom is
  baffling, because the *next* scenario's very first probe shows a state its own
  actions cannot explain. End any scenario that fires the archive with a settle
  wait long enough to cover `ACTIVATED_MS` plus the return.
- **A drag is 1:1 from where it started.** One that also scrolls the article
  arrives at the footer with hundreds of px of travel banked, and spends all of it
  the instant room appears — so it cannot produce a "short" reveal. Park at the
  article end first when the check needs a partial pull.
- **`toEnd()` alone usually arrives already armed.** Its paced scrolls are, quite
  correctly, separate gestures, so they earn the peek room and travel it on the way
  down. Raise the Gap slider above the harness's own cadence when a check needs to
  observe a stop before it is passed.
- Assert **ancestry, not the immediate element**, for hit-testing: the element
  under the cursor is usually a `<p>` inside the card, not the card.
