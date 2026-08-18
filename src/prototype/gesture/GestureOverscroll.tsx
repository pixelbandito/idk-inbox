import { useEffect, useRef, useState } from 'react';
import { PullBackdrop } from './PullBackdrop';
import { Tuner } from './Tuner';
import { createGestureGate, resist, type PullState } from './pullShared';

// Rig 2 — OVERSCROLL, stepped so momentum can't run the whole thing in one go.
// Reaching the archive takes THREE separate scrolls, each ending at a stop:
//
//   1. scroll to the page bottom — content ends, you stop there.
//   2. rest, then a fresh scroll overscrolls into "activating" (green). The pull
//      clamps at the arm distance — you can't blow past it; you stop, armed.
//   3. rest, then one more fresh scroll confirms and fires.
//
// If you don't take the next step, the pull creeps back to neutral on its own —
// gently at first, then accelerating. The green "activating" window gives you a
// beat to decide before it reverts.

const QUIET_MS = 140; // gap after which the wheel counts as "gone quiet"
const VISUAL_CAP = 180; // px the panel lifts to reveal the backdrop
// Idle ease-back: starts almost still and speeds up, growing its per-frame step
// by this much each frame. Small = a real creep before it gets going.
const REVERT_ACCEL = 0.12;
const DRAIN_FACTOR = 0.08; // gentle decelerating ease for the post-confirm settle
const DRAIN_MIN = 2;
const SEAM_BLEED = 2; // reveal overlap tucked behind the card, kills the hairline
const now = () => Date.now();

export function GestureOverscroll() {
  const [armPx, setArmPx] = useState(100);
  const [revertDelayMs, setRevertDelayMs] = useState(700);
  // The armed window has to cover READ → UNDERSTAND → ACT. 1300ms was far too
  // short — it expired while the user was still reading the offer — and 5s too
  // long; 3s matches the native rig.
  const [greenHoldMs, setGreenHoldMs] = useState(3000);
  const [view, setView] = useState<{ phase: PullState; pull: number; progress: number }>({
    phase: 'idle',
    pull: 0,
    progress: 0,
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  // The whole rig area. The wheel listener lives HERE, not on the card: the card
  // slides up out from under the cursor as it lifts, hit-testing follows the
  // transform, and a listener on the card silently loses the gesture mid-pull.
  const zoneRef = useRef<HTMLDivElement>(null);
  // Latest slider values, mirrored into a ref so the rAF loop reads them live.
  const params = useRef({ armPx, revertDelayMs, greenHoldMs });
  useEffect(() => {
    params.current = { armPx, revertDelayMs, greenHoldMs };
  }, [armPx, revertDelayMs, greenHoldMs]);

  // Gesture bookkeeping, all in refs so the rAF loop reads live values.
  const gate = useRef(createGestureGate());
  const pull = useRef(0);
  const lastWheel = useRef(0);
  const quietSince = useRef(0);
  const revertVel = useRef(0); // accelerating velocity for the idle ease-back
  const fired = useRef(false);
  const raf = useRef(0);

  useEffect(() => {
    const scroller = scrollRef.current;
    const zone = zoneRef.current;
    if (!scroller || !zone) return;

    const wheelGate = gate.current;

    const stopLoop = () => {
      if (raf.current) cancelAnimationFrame(raf.current);
      raf.current = 0;
    };

    const reset = () => {
      pull.current = 0;
      quietSince.current = 0;
      revertVel.current = 0;
      fired.current = false;
      setView({ phase: 'idle', pull: 0, progress: 0 });
    };

    const ease = (v: number) => Math.max(0, v - Math.max(DRAIN_MIN, v * DRAIN_FACTOR));

    const tick = () => {
      const t = now();
      const { armPx: arm, revertDelayMs: revertDelay, greenHoldMs: greenHold } = params.current;

      // After a confirm, settle back to neutral to confirm — no forward fling.
      if (fired.current) {
        pull.current = ease(pull.current);
        if (pull.current <= 0) {
          reset();
          stopLoop();
          return;
        }
        setView({ phase: 'activated', pull: pull.current, progress: 1 });
        raf.current = requestAnimationFrame(tick);
        return;
      }

      const quiet = t - lastWheel.current > QUIET_MS;
      if (quiet && quietSince.current === 0) quietSince.current = t;
      if (!quiet) quietSince.current = 0;

      const armed = pull.current >= arm;

      // Ease back once quiet: armed (green) waits the longer green-hold window;
      // a plain pull waits revertDelay. The motion is an accelerating creep.
      const holdWindow = armed ? greenHold : revertDelay;
      const quietElapsed = quietSince.current === 0 ? 0 : t - quietSince.current;
      const reverting = quietElapsed >= holdWindow;
      if (reverting) {
        revertVel.current += REVERT_ACCEL;
        pull.current = Math.max(0, pull.current - revertVel.current);
      } else {
        revertVel.current = 0;
      }

      if (pull.current <= 0) {
        reset();
        stopLoop();
        return;
      }

      const phase: PullState = reverting ? 'reverting' : armed ? 'armed' : 'pulling';
      // Pulling: fill toward the arm distance. Armed: the green window draining.
      const progress = armed ? 1 - Math.min(1, quietElapsed / greenHold) : pull.current / arm;
      setView({ phase, pull: pull.current, progress });
      raf.current = requestAnimationFrame(tick);
    };

    const ensureLoop = () => {
      if (!raf.current) raf.current = requestAnimationFrame(tick);
    };

    const onWheel = (e: WheelEvent) => {
      const t = now();
      // Each stop advances only on a NEW physical gesture, so inertia can't chain
      // steps. The gate reads Chrome's `WheelEvent.momentum` where available, so a
      // fling tail is recognised rather than waited out — which is what let a
      // quick second flick get swallowed by the first one's momentum.
      const fresh = wheelGate.isNewGesture(e);
      lastWheel.current = t; // feeds the revert quiet-detection in tick

      if (fired.current) return;

      const arm = params.current.armPx;
      // Lines → px, for wheels that report deltaMode 1 (Firefox).
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      const maxScroll = scroller.scrollHeight - scroller.clientHeight;
      const atBottom = scroller.scrollTop >= maxScroll - 1;

      // We drive the article's scroll ourselves rather than letting the browser
      // do it. Two reasons, both load-bearing:
      //   - "at the bottom" becomes an exact, immediate fact. Left to the
      //     browser, this handler runs BEFORE the scroll it triggers, and macOS
      //     momentum/elastic keeps animating for hundreds of ms afterwards — so
      //     atBottom read false until the scroll visibly "settled", and the pull
      //     refused to start until then. That wait was not intentional.
      //   - the surface stops depending on what the cursor happens to be over,
      //     so a wheel on the revealed affordance behaves like one on the card.
      if (delta > 0 && !atBottom) {
        // Take as much as the article can absorb. The leftover is deliberately
        // DROPPED rather than spilled into the pull: stopping dead at the bottom
        // is the whole point of the staircase.
        e.preventDefault();
        scroller.scrollTop = Math.min(maxScroll, scroller.scrollTop + delta);
        return;
      }

      let engaged = false;
      if (delta > 0 && atBottom) {
        if (pull.current >= arm) {
          // Armed (green). Stop 2 → 3: a fresh scroll confirms and fires.
          e.preventDefault();
          if (fresh) fired.current = true;
          pull.current = arm; // otherwise hold, clamped at the arm distance
          engaged = true;
        } else if (pull.current > 0) {
          // Mid-pull: keep pulling toward the arm distance (clamps there).
          e.preventDefault();
          pull.current = Math.min(arm, pull.current + delta * resist(pull.current, arm));
          engaged = true;
        } else if (fresh) {
          // Stop 1 → 2: rested at the bottom, a fresh scroll starts the pull.
          e.preventDefault();
          pull.current = Math.min(arm, delta * resist(0, arm));
          engaged = true;
        }
        // else: at rest, not fresh — absorbed. This is the stop at the bottom.
      } else if (delta < 0) {
        e.preventDefault();
        if (pull.current > 0) {
          // Scroll up bleeds the pull off before the article resumes moving.
          pull.current = Math.max(0, pull.current + delta);
          engaged = true;
        } else {
          scroller.scrollTop = Math.max(0, scroller.scrollTop + delta);
        }
      }

      if (engaged) {
        quietSince.current = 0;
        revertVel.current = 0;
        ensureLoop();
      }
    };

    zone.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      zone.removeEventListener('wheel', onWheel);
      wheelGate.dispose();
      stopLoop();
    };
  }, []);

  const lift = Math.min(view.pull, VISUAL_CAP);
  // A couple of px of overlap, hidden behind the docked card, so no subpixel
  // hairline of page background can show through the seam.
  const revealH = lift > 0 ? lift + SEAM_BLEED : 0;
  const armedLabel = view.phase === 'armed' ? 'Scroll again to archive' : undefined;

  return (
    <div className="proto">
      <header className="proto__bar">
        <a className="proto__back" href="#/">‹ hub</a>
        <span className="proto__status">Overscroll-to-trigger · {view.phase}</span>
        <span />
      </header>

      <div className="pull" ref={zoneRef}>
        {/* The affordance lives BEHIND the card, bottom-aligned to the card's
            resting edge, inside a window exactly as tall as the card has lifted.
            So it shows nothing at rest and peeks out only as the card moves. */}
        <div className="pull__reveal" style={{ height: revealH }}>
          <PullBackdrop state={view.phase} progress={view.progress} label={armedLabel} variant="peek" />
        </div>
        <div
          className="pull__panel pull__panel--scroll"
          ref={scrollRef}
          data-lifted={lift > 0 || undefined}
          style={{ transform: `translateY(${-lift}px)` }}
        >
          <h2>Weekly digest</h2>
          {Array.from({ length: 14 }, (_, i) => (
            <p key={i}>
              Paragraph {i + 1}. Scroll to the bottom, rest, then scroll again to arm, rest, and scroll once more to
              confirm. Three deliberate steps.
            </p>
          ))}
          <p className="pull__panel-hint">↓ bottom · scroll to arm · scroll again to confirm</p>
        </div>
      </div>

      <footer className="tuner-bar">
        <Tuner label="Distance" value={armPx} min={40} max={260} step={5} unit="px" onChange={setArmPx} />
        <Tuner label="Revert" value={revertDelayMs} min={200} max={2000} step={50} unit="ms" onChange={setRevertDelayMs} />
        <Tuner label="Green hold" value={greenHoldMs} min={1000} max={12000} step={250} unit="ms" onChange={setGreenHoldMs} />
      </footer>
    </div>
  );
}
