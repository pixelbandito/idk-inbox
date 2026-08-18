import { useEffect, useRef, useState } from 'react';
import { PullBackdrop } from './PullBackdrop';
import { Tuner } from './Tuner';
import { createGestureGate, MOMENTUM_API, type PullState } from './pullShared';

// Rig 3 — NATIVE SCROLL. The reveal is ordinary scrolling; nothing is lifted by JS.
//
// Three structural moves, and everything else falls out of them:
//
//   1. The scroller is TRANSPARENT. The card's background, border and radius live
//      on an inner sheet, so the scroller is just a window.
//   2. The affordance is rendered behind, filling the whole card box, always. At
//      rest the sheet covers it completely, so whatever the sheet stops covering
//      is affordance — no gap can ever show through.
//   3. A transparent footer is appended after the sheet, and scrolling it into
//      view is the entire reveal.
//
// The footer only EXISTS once you've reached the end of the article, and it goes
// away again if you scroll back up past that point. It grows in TWO stages, and
// every stop in the staircase is the same move — earn some room, then travel it:
//
//   scroll to the end of the message  → stop (there is nothing below yet)
//   rest, then scroll again           → peek room appears; travelling it reveals
//                                       the panel, and full travel is armed
//   rest, then scroll again           → commit room appears; travelling THAT
//                                       archives, and it fires on arrival
//
// Both stages are gated identically (`readyToOpen`) and both gate an APPEND, never
// a visible action. That is the whole trick. An append is invisible, so a refused
// event costs nothing — you just keep scrolling until one lands, and the gesture
// that lands it travels straight into the room it opened. Gating something visible
// instead (as the old `confirm()`-from-the-wheel-handler did) turns every refusal
// into a dead scroll, which is what made this step feel stalled while the first
// one felt fine — same test, opposite feel, purely because of what it guarded.
//
// Growing and shrinking the footer is jump-free by construction: it happens only
// at a stop, where scrollTop is at the old maximum, so adding room below or
// removing unused room below never moves the content.
//
// What this buys over translating the card ourselves:
//
//   - The card's box NEVER MOVES, so the wheel always lands on it. The bug where
//     a lifted card slid out from under the cursor is gone by construction — no
//     listener gymnastics, no owning the scroll.
//   - We never preventDefault, so the browser keeps its momentum AND its
//     rubber-band. Overscroll inside the card is real again.
//   - Reveal distance is exact: it's scrollTop, not an accumulator we maintain
//     and hope matches what the eye sees.
//   - CSS scroll-snap gives gravity toward the card-bottom position for free.
//
// What it can't do: the native rubber-band past the true bottom is invisible to
// JS (scrollTop clamps, and the bounce is a compositor effect outside layout), so
// it can't drive a distance threshold. Arming is positional instead. The readout
// in the footer measures whether any elastic offset is observable on your
// hardware; if it turns out to be non-zero, a distance commit becomes possible.

const ACTIVATED_MS = 900; // how long "Archived ✓" holds before filing away
// A released drag springs home briskly: it's a direct answer to something you
// just did. The timed withdrawal (`returnMs`) is slow on purpose — that one is
// ambient, and shouldn't feel like the app grabbing the page off you.
const SPRING_MS = 280;

// Set to `false` to lop off step 3 entirely: the rig then stops at armed and cannot
// archive by any route (no commit room, no drag path to one, `confirm()`
// unreachable). Kept because isolating 1 → 2 is what finally showed that its good
// behaviour came from layout rather than from any of the machinery bolted onto 2 → 3.
const COMMIT_STAGE_ENABLED = true;

// Snapping is live only while the footer is ABSENT, where its one snap point is
// the article's end — so it does exactly the job asked of it (gravity toward the
// card-bottom position) and nothing else.
//
// It cannot also cover the reveal, and that is measured rather than assumed:
// Chrome's proximity snap pulls back from a 40%-revealed panel within a single
// wheel notch, so in discrete scrolls the panel can never accumulate past any
// commit threshold. A continuous trackpad gesture would blow through in one
// motion; a mouse wheel would never get there. Once the footer exists, the
// pull-back is ours instead — the hold timer, or a drag's release — which is
// tunable and doesn't fight the reveal.

/** Ease in and out, so the retreat neither jumps off the mark nor slams home. */
const easeInOutCubic = (p: number) =>
  p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;

export function GestureNative() {
  const [peekPx, setPeekPx] = useState(100);
  // The window for the confirming scroll has to cover READ → UNDERSTAND → ACT,
  // and its clock starts when the MESSAGE changes — not on scroll activity — so
  // it's three seconds of looking at "Scroll again to archive", not three seconds
  // from some earlier scroll. (2s was too short, 5s too long.)
  const [holdMs, setHoldMs] = useState(3000);
  const [returnMs, setReturnMs] = useState(800);
  // Quiet time after your last input before the next room is prepared. This is now
  // the ONLY timing knob in the rig: too short and a fling's tail finds the room
  // already open and spends it for you; too long and the stop feels like a lockout.
  const [settleMs, setSettleMs] = useState(30);
  // Deliberately SMALLER than `peekPx`, and that asymmetry is the whole point.
  //
  // You arrive at the two stops with completely different amounts of help. At the
  // first you are mid-flick, so a momentum tail overshoots 100px without you doing
  // anything. At the second you have stopped to read the offer, so all you have is
  // one deliberate push with no tail behind it. Sizing both stops the same was the
  // wavering: 90px sat right at the length of a single deliberate scroll, so whether
  // it completed was a coin flip.
  //
  // The rule to tune against: this must be comfortably clearable by ONE unhurried
  // scroll, because that is the only input this stop ever gets.
  const [commitPx, setCommitPx] = useState(60);
  // 0 = no footer · 1 = peek room · 2 = peek + commit room.
  const [stageOn, setStageOn] = useState(0);
  const [revealed, setRevealed] = useState(0);
  const [commitTravel, setCommitTravel] = useState(0);
  const [phase, setPhase] = useState<PullState>('idle');
  const [elasticSeen, setElasticSeen] = useState(0);
  // What the confirm test actually saw on the last downward wheel event with the
  // panel out. Without this, a threshold that's too high and a platform that never
  // reports momentum look identical from the outside — both just "it ignored me".
  const [gateSeen, setGateSeen] = useState<{ gapMs: number; tail: boolean } | null>(null);

  const zoneRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const spacerRef = useRef<HTMLDivElement>(null);

  const params = useRef({ peekPx, holdMs, returnMs, settleMs, commitPx });
  useEffect(() => {
    params.current = { peekPx, holdMs, returnMs, settleMs, commitPx };
  }, [peekPx, holdMs, returnMs, settleMs, commitPx]);

  const [dragActive, setDragActive] = useState(false);
  const stage = useRef(0); // mirrors stageOn for the event handlers
  const dragging = useRef(false);
  const dragStartY = useRef(0);
  const dragStartTop = useRef(0);
  // Did THIS drag haul into the commit room? Only then does releasing archive —
  // otherwise a plain click on an already-open panel would fire it.
  const dragEnteredCommit = useRef(false);
  const phaseRef = useRef<PullState>('idle'); // mirrors phase, read by handlers
  const gate = useRef(createGestureGate());
  const armed = useRef(false);
  const exposed = useRef(false); // any part of the panel showing
  const fired = useRef(false);
  const lastTop = useRef(0);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retreatRaf = useRef(0);
  const retreating = useRef(false);

  /** Room below the sheet at each stage. Stage 2 keeps stage 1's room and adds to it. */
  const roomFor = (s: number, p: { peekPx: number; commitPx: number } = params.current) =>
    s <= 0 ? 0 : s === 1 ? p.peekPx : p.peekPx + p.commitPx;

  const setStage = (next: number) => {
    stage.current = next;
    setStageOn(next);
    // The room is applied to the DOM HERE, not through the render, so it exists the
    // moment it is earned. Waiting a frame for React meant the gesture that opened a
    // stage had already been clamped against the old maximum and could no longer
    // reach into what it just unlocked — which is precisely what turned "scroll
    // again to archive" into two scrolls: one that opened the room and did nothing
    // visible, and another to actually travel it.
    if (spacerRef.current) spacerRef.current.style.height = `${roomFor(next)}px`;
    // Set here as well as in onScroll: appending room adds it below without moving
    // anything, so it fires no scroll event — and until snapping is off, the first
    // scroll into the new room can be snapped straight back.
    if (scrollRef.current) scrollRef.current.style.scrollSnapType = next > 0 ? 'none' : '';
  };

  // The sliders can move while a stage is open, so the applied height has to follow
  // them. This is the only other writer of that style.
  useEffect(() => {
    if (spacerRef.current) {
      spacerRef.current.style.height = `${roomFor(stageOn, { peekPx, commitPx })}px`;
    }
  }, [stageOn, peekPx, commitPx]);

  const goTo = (next: PullState) => {
    phaseRef.current = next;
    setPhase(next);
  };

  useEffect(() => {
    const zone = zoneRef.current;
    const scroller = scrollRef.current;
    const spacer = spacerRef.current;
    if (!zone || !scroller || !spacer) return;

    let raf = 0;
    const wheelGate = gate.current;

    // Instrumentation only: at the true bottom the footer's bottom edge and the
    // scroller's bottom edge coincide. If the browser's rubber-band were visible
    // to layout, overscrolling would lift the footer and open a gap here.
    const sampleElastic = () => {
      const gap = scroller.getBoundingClientRect().bottom - spacer.getBoundingClientRect().bottom;
      if (gap > 0.5) setElasticSeen((seen) => Math.max(seen, gap));
      raf = requestAnimationFrame(sampleElastic);
    };

    const clearHold = () => {
      if (holdTimer.current) clearTimeout(holdTimer.current);
      holdTimer.current = null;
    };

    const stopRetreat = () => {
      if (retreatRaf.current) cancelAnimationFrame(retreatRaf.current);
      retreatRaf.current = 0;
      retreating.current = false;
      // Restore snapping to whatever the current state wants — NOT unconditionally
      // on: grabbing the panel back mid-withdrawal leaves the footer in place, and
      // a live snap point would then yank the reveal shut again.
      scroller.style.scrollSnapType = stage.current > 0 ? 'none' : '';
    };

    /**
     * Animate back to the card-bottom position — the snap point — over returnMs.
     * `during` is the phase shown while it travels: 'reverting' when the offer
     * timed out, 'activated' when it's the post-archive file-away.
     */
    const retreat = (during: PullState, ms?: number) => {
      clearHold();
      const from = scroller.scrollTop;
      const to = Math.max(0, scroller.scrollHeight - scroller.clientHeight - spacer.offsetHeight);
      if (from <= to + 0.5) {
        fired.current = false;
        goTo('idle');
        return;
      }
      const dur = Math.max(120, ms ?? params.current.returnMs);
      const started = performance.now();
      retreating.current = true;
      // Snapping applies to programmatic scrolls too, so a live snap point would
      // teleport this animation to its destination on the very first frame.
      scroller.style.scrollSnapType = 'none';
      goTo(during);
      const step = (t: number) => {
        const p = Math.min(1, (t - started) / dur);
        scroller.scrollTop = from + (to - from) * easeInOutCubic(p);
        if (p < 1) {
          retreatRaf.current = requestAnimationFrame(step);
          return;
        }
        stopRetreat();
        fired.current = false;
        goTo('idle');
        setStage(0); // back to needing the whole staircase again
      };
      retreatRaf.current = requestAnimationFrame(step);
    };

    // Sitting on the offer without acting on it withdraws it, on ONE window for
    // every message. A partly-open panel got a much shorter fuse at first, which
    // was drag/snap thinking imported into a model that doesn't want it: here
    // "Keep scrolling…" is just as much something you have to read and act on as
    // "Scroll again to archive", so it gets the same time.
    //
    // The clock is restarted by the MESSAGE CHANGING, not by scrolling: what the
    // window has to cover is reading the words currently on screen, so it starts
    // when those words appear.
    const restartHold = () => {
      clearHold();
      if (!exposed.current || fired.current || retreating.current) return;
      holdTimer.current = setTimeout(() => retreat('reverting'), params.current.holdMs);
    };

    const confirm = () => {
      fired.current = true;
      clearHold();
      goTo('activated');
      resetTimer.current = setTimeout(() => retreat('activated'), ACTIVATED_MS);
    };

    /**
     * Prepare the room for the NEXT step, as soon as the current one has come to
     * rest at its stop. Both stops, one rule.
     *
     * The point of preparing it in advance rather than on the scroll that uses it:
     * the next gesture is then pure travel from its very first pixel. Nothing has to
     * be spent asking for the room, so there is no dead scroll and no need to carry
     * a delta across the append — the step just moves, the way the first one does.
     *
     * Safe because the clock is fed by INPUT (see onWheel). You arrive at a stop
     * with momentum still running, so room that exists too early is room the tail
     * spends for you — that is exactly the fling-through we had. Waiting for input
     * to go quiet means the gesture is genuinely over before there is anywhere to go.
     *
     * The stop still stops: it is layout that halts the fling, not this timer.
     */
    const openNextRoom = () => {
      if (fired.current || retreating.current || dragging.current) return;
      // Only ever at a boundary — the position the previous travel ends at.
      const max = scroller.scrollHeight - scroller.clientHeight;
      if (scroller.scrollTop < max - 1) return;
      if (stage.current === 0) setStage(1);
      else if (COMMIT_STAGE_ENABLED && stage.current === 1 && armed.current) setStage(2);
    };

    const restartSettle = () => {
      if (settleTimer.current) clearTimeout(settleTimer.current);
      settleTimer.current = setTimeout(openNextRoom, params.current.settleMs);
    };

    const onScroll = () => {
      const top = scroller.scrollTop;
      const movingUp = top < lastTop.current - 0.5;
      lastTop.current = top;

      // React commits the spacer AFTER the wheel handler that asked for it, so for
      // one scroll event the DOM can still be a stage behind. That gap has to be
      // patched in BOTH places or not at all: patching the height alone makes
      // `shown` compute as fully-travelled and arms (or fires) on the spot, while
      // patching neither lets the snap logic below re-enable gravity and yank the
      // reveal shut. Both, and the pending frame reads as "open, nothing shown".
      const want = roomFor(stage.current);
      const pending = want - spacer.offsetHeight;
      const footerH = spacer.offsetHeight + pending;
      const max = scroller.scrollHeight - scroller.clientHeight + pending;
      const shown = footerH === 0 ? 0 : Math.max(0, Math.min(footerH, footerH - (max - top)));

      // Two travels, measured off the same scrollTop. The first reveals the panel
      // and ends at `armed`; the second is the commit, and only exists once stage 2
      // has appended room for it — so before that, `commitTravel` is structurally 0
      // and no amount of momentum can manufacture any.
      const peek = params.current.peekPx;
      const reveal = Math.min(shown, peek);
      const commit = Math.max(0, shown - peek);
      setRevealed(reveal);
      setCommitTravel(commit);

      armed.current = footerH > 0 && reveal >= peek - 1;
      exposed.current = shown > 0;

      // THE COMMIT. Not an event — a position. Arriving at the end of the commit
      // room is the archive, which is why this step can no longer be "stalled" by
      // a gate: there is nothing to refuse, only distance you have or haven't run.
      if (COMMIT_STAGE_ENABLED && stage.current === 2 && !fired.current && !retreating.current && commit >= params.current.commitPx - 1) {
        confirm();
        return;
      }

      // Snapping is live only while there's no footer, where its one snap point is
      // the article's end — the gravity toward the card-bottom position. It cannot
      // also cover the reveal: measured, Chrome's proximity snap pulls back from a
      // 40%-open panel within a single wheel notch, so in discrete scrolls the
      // panel could never accumulate. Past that point the pull-back is ours.
      if (!retreating.current) {
        scroller.style.scrollSnapType = stage.current > 0 ? 'none' : '';
      }

      if (!fired.current && !retreating.current) {
        const next: PullState = shown <= 0 ? 'idle' : armed.current ? 'armed' : 'pulling';
        if (next !== phaseRef.current) {
          goTo(next);
          // The message just changed, so the reading clock starts now.
          restartHold();
        }
      }


      // Scrolled back up, so give the room back one stage at a time. Each stage is
      // surrendered when the travel that EARNED it is undone — not when the travel it
      // opened hits zero. That distinction matters: "commit travel is 0" is true the
      // instant stage 2 is appended and stays true while the scroll settles, so any
      // elastic bounce would snatch the commit room straight back off you. Un-arming
      // is a real reversal, and can't be triggered by a settle.
      //
      // Skipped while `pending` is non-zero: that frame is reading a spacer React
      // hasn't committed yet, and acting on it would undo the append that caused it.
      if (!fired.current && movingUp && pending === 0) {
        if (stage.current === 2 && !armed.current) setStage(1);
        else if (stage.current === 1 && shown <= 0) setStage(0);
      }

      if (!exposed.current) clearHold();

      // Feeds the clock too, but is NOT the authority — see onWheel for why scroll
      // events alone are the wrong signal at a boundary.
      restartSettle();

      if (armed.current && !raf) raf = requestAnimationFrame(sampleElastic);
      if (!armed.current && raf) { cancelAnimationFrame(raf); raf = 0; }
    };

    const onWheel = (e: WheelEvent) => {
      // Observed once. ONE test now, used at both stops — the asymmetry that used
      // to live here was never about the gate, it was about what the gate guarded.
      //
      // The `afterMomentum` shortcut is deliberately NOT accepted: if the platform
      // emits any finger-flagged event as a fling settles at a boundary, it would
      // open the next room on the fling's behalf. It is also worth nothing where
      // `WheelEvent.momentum` is missing — see the gate readout in the footer.
      // This handler no longer decides anything. Its whole job is to keep the settle
      // clock alive, and it must be the wheel — not scroll — that does so: pinned at
      // a boundary, scrollTop stops changing and scroll events stop with it while the
      // platform is still delivering momentum. Keyed on scrolling, the clock expires
      // mid-fling and the room opens under a live gesture, which is how a fast
      // double-flick once ran straight through to "Archived".
      const s = wheelGate.observe(e);
      restartSettle();
      setGateSeen({ gapMs: s.gapMs, tail: s.afterMomentum });

      // Grabbing the panel back mid-withdrawal cancels the retreat rather than
      // fighting it. A fling tail isn't a grab, so it doesn't count.
      if (retreating.current && !fired.current && !s.momentum) stopRetreat();
    };

    // ---- Drag: a second, alternative path to the same state machine ---------
    // Everything above is a function of scrollTop, so a drag doesn't need its own
    // model — it just moves scrollTop, and the phases, footer, hold timer and
    // withdrawal all follow exactly as they do for the wheel.
    //
    // Touch is deliberately excluded: `touch-action: pan-y` means the browser is
    // already scrolling for a finger, and handling pointer events too would fight
    // it. Finger and trackpad get the native path; a mouse gets to drag.
    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'touch' || fired.current) return;
      scroller.setPointerCapture(e.pointerId);
      e.preventDefault(); // don't start a text selection
      if (retreating.current) stopRetreat();
      dragging.current = true;
      dragStartY.current = e.clientY;
      dragStartTop.current = scroller.scrollTop;
      dragEnteredCommit.current = false;
      setDragActive(true);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!dragging.current) return;
      const up = dragStartY.current - e.clientY;
      const desired = dragStartTop.current + up;
      let max = scroller.scrollHeight - scroller.clientHeight;

      // Hauling past the end opens the next room mid-drag, either stage. A drag has
      // an explicit start, so unlike the wheel it doesn't need a separate gesture to
      // earn a stop — which is what keeps the drag path feeling 1:1 and continuous.
      // It still can't skip: stage 2 needs the panel already fully out.
      const topStage = COMMIT_STAGE_ENABLED ? 2 : 1;
      if (desired > max && stage.current < topStage && (stage.current === 0 || armed.current)) {
        setStage(stage.current + 1);
        // React commits the spacer after this event, so the room this drag can
        // use appears on the next move — a frame away at drag speed.
      }

      max = scroller.scrollHeight - scroller.clientHeight;
      scroller.scrollTop = Math.max(0, Math.min(max, desired));

      // Hauling into the commit room during THIS drag is what earns a release
      // commit — a plain click on an already-open panel must not archive.
      //
      // Measured against the SPACER, not `stage`, and only once the spacer actually
      // carries the commit room. On the frame stage 2 is set, React hasn't grown it
      // yet, so `max` is still the armed position — and "past max - commitPx" would
      // read true while merely sitting at armed, arming a release-archive you never
      // asked for.
      const room = spacer.offsetHeight;
      if (room >= params.current.peekPx + params.current.commitPx && scroller.scrollTop > max - params.current.commitPx) {
        dragEnteredCommit.current = true;
      }
    };

    // Release is the commit, and it always springs home — the drag path behaves
    // like a drag, not like a scroll that happens to be driven by a mouse.
    //
    // This is the ONE place the two paths differ, and deliberately: a drag has a
    // release, so entering the commit room and letting go is the classic pull-past-
    // the-threshold idiom and shouldn't demand you also run out the last few px. A
    // wheel has no release, so it commits on arrival (in onScroll) instead. Both
    // still require hauling past both stops.
    const endDrag = () => {
      if (!dragging.current) return;
      dragging.current = false;
      setDragActive(false);
      if (COMMIT_STAGE_ENABLED && dragEnteredCommit.current) {
        confirm(); // its own settle-back follows
        return;
      }
      if (exposed.current) retreat('reverting', SPRING_MS);
    };

    scroller.addEventListener('scroll', onScroll, { passive: true });
    scroller.addEventListener('pointerdown', onPointerDown);
    scroller.addEventListener('pointermove', onPointerMove);
    scroller.addEventListener('pointerup', endDrag);
    scroller.addEventListener('pointercancel', endDrag);
    // Passive: this rig never preventDefaults. That is the whole point — the
    // browser keeps momentum and the rubber-band, and we only observe.
    zone.addEventListener('wheel', onWheel, { passive: true });
    onScroll();
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      scroller.removeEventListener('pointerdown', onPointerDown);
      scroller.removeEventListener('pointermove', onPointerMove);
      scroller.removeEventListener('pointerup', endDrag);
      scroller.removeEventListener('pointercancel', endDrag);
      zone.removeEventListener('wheel', onWheel);
      wheelGate.dispose();
      if (resetTimer.current) clearTimeout(resetTimer.current);
      if (settleTimer.current) clearTimeout(settleTimer.current);
      clearHold();
      stopRetreat();
      if (raf) cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const inCommit = stageOn === 2;
  // Having the room and having ENTERED it are different states, and the copy has
  // to tell them apart: `endDrag` commits on a drag that entered the commit room,
  // so promising "Release to archive" the moment the room appears offers something
  // a release would not actually do. Only travel earns that sentence.
  const enteredCommit = inCommit && commitTravel > 0;
  // ONE meter, one meaning, monotonic: how far the panel has come out. It fills
  // during the reveal and then STAYS full — it must never re-scale itself when the
  // commit room appears. Re-pointing it at the commit travel emptied a full bar at
  // the exact moment the label stayed put, so the step read as undoing progress
  // rather than making it. The commit's own feedback is the panel still rising.
  const progress = phase === 'activated' ? 1 : Math.min(1, revealed / Math.max(1, peekPx));
  const label =
    phase === 'activated' || phase === 'reverting' ? undefined
    : enteredCommit ? (dragActive ? 'Release to archive' : 'Keep scrolling to archive')
    // With the commit stage off, armed is the end of the road. Naming the
    // affordance beats instructing a scroll that would do nothing — a promise the
    // build can't keep would be the very thing under test.
    : phase === 'armed' ? (COMMIT_STAGE_ENABLED
        ? (dragActive ? 'Pull further to archive' : 'Scroll or drag again to archive')
        : 'Archive')
    : phase === 'pulling' ? (dragActive ? 'Keep pulling…' : 'Keep going…')
    : undefined;

  return (
    <div className="proto">
      <header className="proto__bar">
        <a className="proto__back" href="#/">‹ hub</a>
        <span className="proto__status">Native-scroll · {phase}</span>
        <span />
      </header>

      <div className="pull pull--native" ref={zoneRef}>
        {/* Always rendered, filling the card box. Whatever the sheet stops
            covering is affordance — so no gap can ever show through. */}
        <div className="pull__behind">
          <PullBackdrop
            state={phase}
            progress={progress}
            label={label}
            variant="peek"
            commit={inCommit ? commitTravel / Math.max(1, commitPx) : undefined}
          />
        </div>
        <div
          className="pull__panel pull__panel--nativescroll"
          ref={scrollRef}
          data-dragging={dragActive || undefined}
        >
          {/* min-height keeps the sheet covering the whole window even when the
              article is short, so the footer is the only way to reveal. */}
          <div className="pull__sheet" data-docked={revealed > 0 || undefined}>
            <h2>Weekly digest</h2>
            {Array.from({ length: 14 }, (_, i) => (
              <p key={i}>
                Paragraph {i + 1}. Scroll or drag. Reach the end of the message, then go again — the archive panel is
                underneath — and once it's out, one more deliberate move confirms.
              </p>
            ))}
            <p className="pull__panel-hint">↓ end of message · scroll or drag again for the panel</p>
          </div>
          {/* The staircase, as layout: stage 1 adds the peek room, stage 2 keeps it
              and adds the commit room below. Travel is the only thing that acts.
              Height is applied imperatively by `setStage` — deliberately NOT from
              render — so a stage exists on the same event that earns it. */}
          <div className="pull__spacer" ref={spacerRef} aria-hidden="true" />
        </div>
      </div>

      <footer className="tuner-bar">
        <Tuner label="Peek" value={peekPx} min={40} max={260} step={5} unit="px" onChange={setPeekPx} />
        <Tuner label="Settle" value={settleMs} min={0} max={400} step={10} unit="ms" onChange={setSettleMs} />
        <Tuner label="Commit" value={commitPx} min={10} max={260} step={5} unit="px" onChange={setCommitPx} />
        <Tuner label="Hold" value={holdMs} min={1000} max={12000} step={250} unit="ms" onChange={setHoldMs} />
        <Tuner label="Return" value={returnMs} min={200} max={2000} step={50} unit="ms" onChange={setReturnMs} />
        <span className="tuner__readout" title="Which stage of room has been appended, and how far each of the two travels has been run.">
          stage {stageOn} · reveal {Math.round(revealed)}/{peekPx}px · commit{' '}
          {stageOn === 2 ? `${Math.round(commitTravel)}/${commitPx}px` : '—'}
        </span>
        <span
          className="tuner__readout"
          title="Whether this browser reports WheelEvent.momentum (Chromium 151+), then what the open gate last saw: the quiet gap before that event, and whether it arrived straight after a fling tail. 'api no' means momentum can't be recognised and the Gap threshold is the entire test."
        >
          gate: api {MOMENTUM_API ? 'yes' : 'no'}
          {gateSeen &&
            ` · gap ${Number.isFinite(gateSeen.gapMs) ? `${Math.round(gateSeen.gapMs)}ms` : 'first'}${
              gateSeen.tail ? ' · after tail' : ''
            }`}
        </span>
        <span
          className="tuner__readout"
          title="Largest gap seen between the footer and the scroller's bottom edge while pinned at the bottom. Non-zero means the browser's rubber-band IS visible to JS on this hardware, which would allow a distance-based commit."
        >
          elastic {elasticSeen.toFixed(1)}px
        </span>
      </footer>
    </div>
  );
}
