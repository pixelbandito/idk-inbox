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
  // A wheel event is a "fresh" gesture only if the wheel was idle (no event for
  // NEW_GESTURE_MS) just before it. Each stop advances only on a fresh scroll,
  // so inertia or a continuous flick can't chain steps — and, unlike per-event
  // gaps or an at-bottom flag, this doesn't drop a scroll when you land at the
  // bottom (that landing event is evaluated before the scroll applies).
  const idle = useRef(true);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
      // Freshness: this event is "fresh" only if the wheel was idle before it.
      // Track it for every event (even ones we ignore) so inertia keeps the
      // wheel "not idle" until a real pause opens up.
      const fresh = idle.current;
      idle.current = false;
      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(() => {
        idle.current = true;
      }, NEW_GESTURE_MS);
      lastWheel.current = t; // feeds the revert quiet-detection in tick

      if (fired.current) return;

      const arm = params.current.armPx;
      const atBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1;

      let engaged = false;
      if (e.deltaY > 0 && atBottom) {
        if (pull.current >= arm) {
          // Armed (green). Stop 2 → 3: a fresh scroll confirms and fires.
          e.preventDefault();
          if (fresh) fired.current = true;
          pull.current = arm; // otherwise hold, clamped at the arm distance
          engaged = true;
        } else if (pull.current > 0) {
          // Mid-pull: keep pulling toward the arm distance (clamps there).
          e.preventDefault();
          pull.current = Math.min(arm, pull.current + e.deltaY * resist(pull.current, arm));
          engaged = true;
        } else if (fresh) {
          // Stop 1 → 2: rested at the bottom, a fresh scroll starts the pull.
          e.preventDefault();
          pull.current = Math.min(arm, e.deltaY * resist(0, arm));
          engaged = true;
        }
        // else: at rest, not fresh — absorbed. This is the stop at the bottom.
      } else if (e.deltaY < 0 && pull.current > 0) {
        // Scroll up bleeds the pull off before native scroll resumes.
        e.preventDefault();
        pull.current = Math.max(0, pull.current + e.deltaY);
        engaged = true;
      }

      if (engaged) {
        quietSince.current = 0;
        revertVel.current = 0;
        ensureLoop();
      }
    };

    scroller.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      scroller.removeEventListener('wheel', onWheel);
      if (idleTimer.current) clearTimeout(idleTimer.current);
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
