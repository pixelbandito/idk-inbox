# Handoff — panel-nav + pull-to-trigger prototypes (2026-08-09)

## TL;DR

All work is **committed and pushed** to branch `functional-triage`; working tree is
clean. Everything lives in an isolated prototype hub at **`/prototype.html`** — no
app code was touched. Latest commit: `4122eba`.

Two interaction problems are being prototyped side-by-side:

1. **Panel navigation** (horizontal multi-panel h-scroll + which panel is "active").
   Verdict so far: the **home-rolled attention-cursor model is best by far.**
2. **Pull-to-trigger** gestures (archive a thread by pulling), two rigs to compare
   feel: a pointer **drag** rig and an **overscroll + timer** rig.

Next intended step (not started): port the home-rolled nav model — and whichever
gesture rig we settle on — into the real `LayoutContainer`.

---

## How to run / verify

```bash
export PATH="$HOME/.nvm/versions/node/v22.13.0/bin:$PATH"   # Node 22.13 required
npm run dev         # then open http://localhost:5173/prototype.html
# or
npm run build && npm run preview   # http://localhost:<port>/prototype.html
```

- The hub (`#/`) lists every prototype; each opens at its own hash URL.
- `npm run build` + `npm run lint` must both be clean. Full suite: `npx vitest run`
  (479 tests; the prototype isn't unit-tested, but keep it green).
- A **pre-push security scan** blocks pushes on stray secrets/identifiers. All
  commits use the trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Visual/interaction checks were done with Playwright driving the cached
  `chromium-1208` (`~/Library/Caches/ms-playwright/chromium-1208/...`), with
  `playwright-core@1.54` installed in the scratchpad. The scratchpad gets cleaned
  periodically — `npm i playwright-core@1.54` there again if the import fails.

---

## Architecture

- `prototype.html` → `src/prototype/main.tsx` → `PrototypeHub.tsx` (a tiny
  hash-router). Routes are a single table in `routes.tsx`; the hub index is
  `ProtoIndex.tsx`. **Adding a prototype = one row in `routes.tsx`.**
- It's a second Vite entry (`vite.config.ts` `build.rollupOptions.input`), so the
  main app bundle is unaffected (Embla etc. only land in the prototype bundle).
- Styles: one shared `src/prototype/prototype.css`.

---

## Panel navigation — 5 variants (`#/nav/*`)

Same contract everywhere (shared in `nav/navShared.ts`): 8 panels, varied widths
`[300,120,440,90,260,520,150,340]`, shared hues, resizable (native `resize`
handle), shared chrome (`nav/NavBar.tsx`), so only the scroll/active mechanic
differs.

| Route | File | Mechanic | Edge panels (1 & 8)? |
|---|---|---|---|
| `#/nav/minimal` | `NavMinimal.tsx` | CSS scroll-snap + `scrollsnapchange` event | **No** — can't centre, honest limitation |
| `#/nav/idiomatic` | `NavIdiomatic.tsx` | IntersectionObserver on a centre line + `scrollIntoView` | **No** — same |
| `#/nav/padded` | `NavPadded.tsx` | Same as minimal + real `padding-inline:50%` | **Yes** — visible empty ends is the trade-off |
| `#/nav/embla` | `NavEmbla.tsx` | Embla Carousel + WheelGestures plugin, `containScroll:'keepSnaps'` | **Yes** — edges sit flush |
| `#/nav/homerolled` | `PanelNavPrototype.tsx` | **Attention-cursor model (the winner)** | **Yes** — via cursor edge-buffer |

**Home-rolled model (the one to carry forward):** scrolling drives an attention
cursor `C` through the whole content `[0, scrollWidth]` with a ½-viewport buffer
past each end; panels follow `scrollLeft` (clamped) while only the notch moves
into the buffer. Active = the panel `C` points at. Has a custom 2px scrollbar +
a "map" bar (segments proportional to panel widths) + a centre notch. This is
d3-zoom's `constrain`/`translateExtent` idea in 1D.

### Decisions already made here
- **Panel snapping was tried and reverted** — "strictly worse for now." Home-rolled
  is back to pure free-scroll. (If revisited: the spec was centre-if-it-fits, else
  snap the nearest edge flush *only if already close*, then allow granular scroll
  within a wider-than-viewport panel.)
- Minimal/Idiomatic are **intentionally left "broken" at the edges** as honest
  baselines — they show *why* Padded/Embla/home-rolled pay for the fix. (An earlier
  `useEdgeSelection` JS patch was added then reverted.)
- Embla is pointer-drag only by default; the WheelGestures plugin makes it scroll
  by wheel. `keepSnaps` removed the odd empty side padding while keeping all 8
  selectable.

---

## Pull-to-trigger gestures (`#/gesture/*`)

Both rigs share a state-coloured backdrop (`gesture/PullBackdrop.tsx`) and state
vocabulary (`gesture/pullShared.ts`): `idle → pulling(amber) → armed(green) →
activated(bright) / reverting(red)`. Both are **vertical** now (apples-to-apples),
both have live-tuning sliders (`gesture/Tuner.tsx`), and on a successful trigger
both **settle back to neutral** (no forward fling).

### `#/gesture/drag` — `GestureDrag.tsx`
Pointer-drag only, 1:1, no timers. One drag scrolls the article, then keeps
pulling past the bottom to arm; release past threshold fires. High-control rig for
feeling out the threshold. Slider: **Threshold** (px).

### `#/gesture/overscroll` — `GestureOverscroll.tsx` (the app's real mechanic)
A faithful port of the app's overscroll-to-close, now a **stepped 3-stop staircase**
so momentum can't run it in one gesture. Reaching archive takes three separate,
deliberate scrolls:

1. scroll to the page bottom (content ends → stop);
2. rest, then a fresh scroll overscrolls into "activating" — the pull **clamps at
   the arm distance** (can't blow past);
3. rest, then one more fresh scroll **confirms and fires**.

If you don't take the next step, the pull **creeps** back to neutral — gently at
first (`REVERT_ACCEL` accelerating ease-in), after a delay. Sliders:
**Distance / Revert delay / Green hold**.

Key constants/defaults (top of `GestureOverscroll.tsx`):
- `armPx` 100 (Distance), `revertDelayMs` 700 (Revert), `greenHoldMs` 1300 (Green hold)
- `REVERT_ACCEL` 0.12 (starts ~1px/frame, accelerates — "really creeps at first")
- `NEW_GESTURE_MS` 150 (the idle gap that defines a "fresh" scroll — see below)
- `QUIET_MS` 140, `VISUAL_CAP` 180

**Most recent fix (commit `4122eba`):** the stop-gate used to *drop scrolls* — the
event that lands you at the bottom is evaluated before its native scroll applies,
so `atBottom` reads false and the "rested" flag set a scroll late; that scroll then
got consumed as the arrival instead of arming (inertia made it worse). Now each
step advances only on a **"fresh" scroll** = one preceded by real wheel idleness
(`NEW_GESTURE_MS`, tracked by a debounce timer over every event). Continuous flicks
/ inertia can't chain steps; arming takes effect on the first deliberate scroll,
with no off-by-one, across repeated cycles. Verified deterministically.

---

## Open questions / things to decide next session

1. **Overscroll confirm timer semantics.** Right now the green "activating" phase's
   timer is a *revert window* (how long it waits for your confirm scroll before
   backing off), not an auto-fire dwell. Open: should holding also auto-fire when
   the timer runs out (hold-to-commit), *in addition to* the confirm scroll?
2. **"Fresh" threshold vs slow mouse wheels.** `NEW_GESTURE_MS = 150ms` means a
   *very slow* mouse-wheel scroll (notches >150ms apart) can read as "fresh" and
   arm as you reach the bottom. Fine for fast/trackpad input. If it feels too eager
   on slow wheeling, bump the threshold or expose it as a slider.
3. **Which gesture rig wins**, and then **port the home-rolled nav + chosen rig into
   the real `LayoutContainer`** (the actual next feature step).
4. Snapping stays shelved unless we want to revisit the centre-if-fits / edge-snap
   spec.

## Related docs
- `docs/2026-07-07-swipe-affordance-design.md` — original swipe/overscroll design.
- `docs/followups.md` — deferred work tracker.
