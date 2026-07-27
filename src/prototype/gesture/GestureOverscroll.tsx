import { useEffect, useRef, useState } from 'react';
import { PullBackdrop } from './PullBackdrop';
import { Tuner } from './Tuner';
import { resist, type PullState } from './pullShared';

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
// A fresh scroll (after this quiet gap) is what advances each step, so a fast
// continuous flick can't chain them — it just stops at the next boundary.
const NEW_GESTURE_MS = 150;
// Idle ease-back: starts almost still and speeds up, growing its per-frame step
// by this much each frame. Small = a real creep before it gets going.
const REVERT_ACCEL = 0.12;
const DRAIN_FACTOR = 0.08; // gentle decelerating ease for the post-confirm settle
const DRAIN_MIN = 2;
const now = () => Date.now();

export function GestureOverscroll() {
  const [armPx, setArmPx] = useState(100);
  const [revertDelayMs, setRevertDelayMs] = useState(700);
  const [greenHoldMs, setGreenHoldMs] = useState(1300);
  const [view, setView] = useState<{ phase: PullState; pull: number; progress: number }>({
    phase: 'idle',
    pull: 0,
    progress: 0,
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  // Latest slider values, mirrored into a ref so the rAF loop reads them live.
  const params = useRef({ armPx, revertDelayMs, greenHoldMs });
  useEffect(() => {
    params.current = { armPx, revertDelayMs, greenHoldMs };
  }, [armPx, revertDelayMs, greenHoldMs]);

  // Gesture bookkeeping, all in refs so the rAF loop reads live values.
  const pull = useRef(0);
  const lastWheel = useRef(0);
  const quietSince = useRef(0);
  const restedAtBottom = useRef(false); // rested at the page bottom → may start pulling
  const restedInArmed = useRef(false); // rested while armed → a fresh scroll confirms
  const revertVel = useRef(0); // accelerating velocity for the idle ease-back
  const fired = useRef(false);
  const raf = useRef(0);

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;

    const stopLoop = () => {
      if (raf.current) cancelAnimationFrame(raf.current);
      raf.current = 0;
    };

    const reset = () => {
      pull.current = 0;
      quietSince.current = 0;
      restedInArmed.current = false;
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
      if (!armed) restedInArmed.current = false; // dropped out of the green zone

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
      if (fired.current) return;
      const t = now();
      const gap = t - lastWheel.current;
      const arm = params.current.armPx;
      const atBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1;
      if (!atBottom) restedAtBottom.current = false; // left the bottom — must land again

      if (e.deltaY > 0) {
        if (!atBottom) {
          lastWheel.current = t;
          return; // scrolling through the article (stop 1 is the content end)
        }
        // Stop 1 → 2: only a fresh scroll after resting at the bottom starts pulling.
        const canStart = pull.current > 0 || (restedAtBottom.current && gap >= NEW_GESTURE_MS);
        restedAtBottom.current = true;
        if (!canStart) {
          lastWheel.current = t;
          return;
        }
        e.preventDefault();
        if (pull.current < arm) {
          // Pulling toward the arm distance — clamps there (stop 2).
          pull.current = Math.min(arm, pull.current + e.deltaY * resist(pull.current, arm));
        } else {
          // Armed (green). Stop 2 → 3: a fresh scroll after resting confirms.
          const canConfirm = restedInArmed.current && gap >= NEW_GESTURE_MS;
          restedInArmed.current = true;
          if (canConfirm) fired.current = true;
          pull.current = arm; // stay clamped at the arm distance
        }
      } else if (e.deltaY < 0) {
        if (pull.current <= 0) {
          lastWheel.current = t;
          return; // bleed pull first, then hand back to native scroll
        }
        e.preventDefault();
        pull.current = Math.max(0, pull.current + e.deltaY);
        if (pull.current < arm) restedInArmed.current = false;
      }
      lastWheel.current = t;
      quietSince.current = 0;
      revertVel.current = 0;
      ensureLoop();
    };

    scroller.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      scroller.removeEventListener('wheel', onWheel);
      stopLoop();
    };
  }, []);

  const lift = Math.min(view.pull, VISUAL_CAP);
  const armedLabel = view.phase === 'armed' ? 'Scroll again to archive' : undefined;

  return (
    <div className="proto">
      <header className="proto__bar">
        <a className="proto__back" href="#/">‹ hub</a>
        <span className="proto__status">Overscroll-to-trigger · {view.phase}</span>
        <span />
      </header>

      <div className="pull">
        <PullBackdrop state={view.phase} progress={view.progress} label={armedLabel} />
        <div className="pull__panel pull__panel--scroll" ref={scrollRef} style={{ transform: `translateY(${-lift}px)` }}>
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
        <Tuner label="Green hold" value={greenHoldMs} min={500} max={3000} step={50} unit="ms" onChange={setGreenHoldMs} />
      </footer>
    </div>
  );
}
