# Handoff — scroll/drag-to-act edge actions (2026-09-01)

## TL;DR

All work is **committed, pushed, and merged to `main`** (`e8a7f8c`); working tree is
clean and `functional-triage` is level with `main`. The prototypes are published:

**https://pixelbandito.github.io/idk-inbox/prototype.html**

The interaction mechanic is finished and generalised. What is left is (a) two design
decisions that need a real device in hand, and (b) porting it into the app.

---

## How to run / verify

```bash
export PATH="$HOME/.nvm/versions/node/v22.13.0/bin:$PATH"   # Node 22.13 required
npm run dev                  # http://localhost:5173/prototype.html
npm i --no-save playwright-core
node scripts/prototype-checks/scroll-actions.mjs    # 29 checks
node scripts/prototype-checks/touch-actions.mjs     #  5 checks, real touch gestures
node scripts/prototype-checks/native-scroll.mjs 520 # 44 checks
node scripts/prototype-checks/overscroll.mjs 520    # 10
node scripts/prototype-checks/drag.mjs              #  7
```

All green as of this handoff. `npm run lint` and `npm run build` clean.

**Known pre-existing flake:** `src/panels/ThreadlistPanel.test.tsx` fails roughly 1
run in 3 in the full vitest suite and passes 3/3 in isolation (~6s for that file —
reads as a timeout under parallel load). Unrelated to any of this work; the
prototype has no unit tests. Don't be fooled into thinking a change caused it.

---

## The mechanic, in one paragraph

**A stop is a scroll boundary, and a step is a pad you travel through.** Rest at an
edge and the room for the next step is appended there — invisibly, moving nothing.
Travel it and the actions on that side are revealed. Rest again and a second pad is
appended. Travel that, and arriving at its far end *is* the action. Nothing refuses
input and nothing measures gestures: you cannot flick past a stop because there is
nowhere to flick to. Layout, not policy.

Two properties fall out of that and are worth defending:

- **Preparing a pad in advance** is what makes each step read as motion — the next
  scroll is travel from its first pixel, with nothing spent asking for room.
- **Preparing it only once INPUT has gone quiet** is the whole safety property. A pad
  that appears under a live gesture is a pad that gesture spends for you.

---

## Where the code is

```
src/prototype/gesture/edgeActions/
  types.ts            shared vocabulary + the `Surface` handle (the seam)
  useEdgeSurface.ts   geometry ONLY: pads, stages, "shown", hold timer, withdrawal
  useScrollCommit.ts  scroll input model — always commits to the EDGEMOST action
  useDragCommit.ts    drag input model — DISTANCE SELECTS; release runs it
  index.ts            `useEdgeActions` composes all three (the house convention)

src/prototype/gesture/ScrollActionSurface.tsx   the visible half
src/prototype/gesture/GestureSides.tsx          rig 4 — #/gesture/sides
src/prototype/gesture/GestureApp.tsx            rig 5 — #/gesture/app (combined)
```

The three hooks share **only** the `Surface` handle, so either input model can be
lifted out on its own — that was deliberate, for publishing them separately later.

---

## Decisions already made (don't re-litigate these)

- **Scroll always means the edgemost action.** A scroll has no release, so it needs
  exactly one meaning. Choosing among several is the drag's job.
- **Drag selects by distance.** One action-width in picks the edgemost, two picks the
  next inward. Releasing short of the first width runs nothing.
- **Any revealed action can be tapped**, which is what lets a side carry more than one
  without the full-travel gesture becoming ambiguous.
- **Pads are sized imperatively, never from render** — a pad must exist on the same
  frame it is earned.
- **Growing a pad waits for input to go quiet; shrinking one is immediate.** Shrinking
  carries no risk and gating it behind a timer just makes the surface feel like it is
  thinking.
- **The scroll path stands down while a drag is live** (`Surface.isDragging`). A drag
  runs past the commit distance on purpose, to select with it.
- **Panel nav will not be behind a flag** — nobody is using this yet.

## Traps that cost real time (all now checked; see the checks README)

- **`setStage` must read the scroll position BEFORE resizing a pad.** Shrinking one
  reduces the scroll range and the browser silently clamps as part of that, so a read
  afterwards is already compensated and applying the delta subtracts it twice. The
  symptom was reported as "a snap that hides Delete" and the amount lost was always
  exactly the leading pad's width.
- **`touch-action` is invisible to every non-touch check.** `pan-y` on the horizontal
  rows forbade horizontal swipes outright on a phone while all desktop checks stayed
  green. `pan-x` fixes that and breaks vertical chaining, because the value is
  intersected down the ancestor chain. `manipulation` on both is correct.
- **Axis CSS must be child-scoped (`>`).** These surfaces nest, so `.sa--y .sa__pad`
  reaches into horizontal rows and sizes their pads on the wrong axis.
- **`overscroll-behavior` must be per-axis**, or a row swallows vertical wheels it
  cannot use and the list stops scrolling wherever a tile is under the cursor.
- **Anything holding an absolute scroll position across frames must follow
  `Surface.onShift`.** Surrendering a leading pad shifts the coordinate space by its
  whole width, and the drag ran that far ahead of the finger.

---

## OPEN: two decisions that need a real device

### 1. On touch, scroll and drag are the same gesture

A finger pan *is* a native scroll, so a surface cannot offer both to the same finger
the way it offers wheel-vs-button-drag to a mouse. The pointer-drag path currently
ignores `pointerType === 'touch'` outright, so **distance-selection is mouse-only**
and touch gets the staircase plus tapping.

`PointerEvent.pointerType` is reliable per interaction (the Chrome mobile emulator
genuinely reports `touch`, so it matched the real Android device). So running
*different models per input* is viable — staircase on touch, distance-selection on
mouse. The cost is that the gesture means something different depending on what you
are holding, which cuts against the "always in tandem" rule.

**Needs:** a verdict after trying the published page on a real phone.

### 2. Panel nav versus tiles, on the same axis

In the combined rig every tile claims horizontal gestures over itself, and
`overscroll-behavior-x: contain` stops chaining — so panels can only be navigated by
swiping the title area, not over the list. On mobile the list fills the panel, which
makes that a real problem. Options: drop `contain` so a fully-revealed tile chains to
the strip; keep nav to the nav bar/edges; or give the attention-cursor nav a
different input.

Measured behaviour today (mouse and touch agree):

```
h-gesture over a tile   → tile reveals;      strip does not move
h-gesture over a title  → strip navigates;   tile untouched
v-gesture over a tile   → list scrolls;      tile untouched
```

---

## NEXT, as agreed

1. **Requested and not yet done:** add the progress meters from the native-scroll rig
   to the All-sides rig's action strips.
2. Move `edgeActions/` out of `src/prototype/gesture/` (probably `src/lib/`) so the
   app does not import from a prototype directory, and extracting a package later is
   a copy rather than an untangle.
3. Port into the app: thread list tiles (horizontal), thread detail panel (vertical).
4. Port the home-rolled attention-cursor panel navigation into `LayoutContainer`,
   replacing what is there. No flag.
5. Aim for clean publishable hooks: scroll-to-act, drag-to-act, and panel nav.

## Publishing

`.github/workflows/pages.yml` deploys on push to `main` or `functional-triage`. The
deployed app **cannot sign in** by design — `VITE_GOOGLE_CLIENT_ID` is never given to
that build and the workflow hard-fails if one appears, so the github.io origin never
needs allowlisting. The prototypes are static and authless, so they work fully.

**Gotcha seen once:** a push-triggered Pages run sat `queued` indefinitely without
ever starting (GitHub-side, not the workflow). `gh workflow run pages.yml --ref main`
re-dispatched it and it completed immediately. The ghost run may still show as queued.

## Related docs

- `docs/2026-08-09-panel-nav-and-pull-gesture-handoff.md` — the earlier rigs
- `scripts/prototype-checks/README.md` — the method traps, worth reading before
  editing any check
- `docs/ARCHITECTURE.md`, `docs/followups.md`
