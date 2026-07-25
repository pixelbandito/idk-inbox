import { useEffect, useRef, useState } from 'react';
import { PullBackdrop } from './PullBackdrop';
import { Tuner } from './Tuner';
import { clamp, resist, type PullState } from './pullShared';

// Rig 2 — OVERSCROLL + DISTANCE + TIMER, a faithful port of the app's
// overscroll-to-close. Scroll the article to the bottom, then keep scrolling:
//
//   • distance — resisted pull must pass `armPx` to arm (momentum can't blow it)
//   • timer    — stay armed for `dwellMs` to fire (reading time before commit)
//   • buffer   — when the wheel goes quiet, the pull is held alive for
//     `bufferMs` before it drains, so a momentary pause doesn't cancel; scroll
//     back up inside the buffer to bleed it off and cancel on purpose.

const QUIET_MS = 140; // gap after which the wheel counts as "gone quiet"
const VISUAL_CAP = 180; // px the panel lifts to reveal the backdrop
const now = () => Date.now();

export function GestureOverscroll() {
  const [armPx, setArmPx] = useState(100);
  const [dwellMs, setDwellMs] = useState(800);
  const [bufferMs, setBufferMs] = useState(1100);
  const [view, setView] = useState<{ phase: PullState; pull: number; progress: number }>({
    phase: 'idle',
    pull: 0,
    progress: 0,
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  // Latest slider values, mirrored into a ref so the rAF loop reads them live
  // without re-subscribing the wheel listener.
  const params = useRef({ armPx, dwellMs, bufferMs });
  useEffect(() => {
    params.current = { armPx, dwellMs, bufferMs };
  }, [armPx, dwellMs, bufferMs]);

  // Gesture bookkeeping, all in refs so the rAF loop reads live values.
  const pull = useRef(0);
  const lastWheel = useRef(0);
  const quietSince = useRef(0);
  const armedSince = useRef(0);
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
      armedSince.current = 0;
      quietSince.current = 0;
      fired.current = false;
      setView({ phase: 'idle', pull: 0, progress: 0 });
    };

    const fire = () => {
      fired.current = true;
      stopLoop();
      setView({ phase: 'activated', pull: pull.current, progress: 1 });
      setTimeout(reset, 900);
    };

    const tick = () => {
      const t = now();
      const { armPx: arm, dwellMs: dwell, bufferMs: buffer } = params.current;

      const quiet = t - lastWheel.current > QUIET_MS;
      if (quiet && quietSince.current === 0) quietSince.current = t;
      if (!quiet) quietSince.current = 0;

      const armed = pull.current >= arm;
      if (armed && armedSince.current === 0) armedSince.current = t;
      if (!armed) armedSince.current = 0;

      if (armed && t - armedSince.current >= dwell) {
        fire();
        return;
      }

      // Buffer: hold the pull alive until the quiet window exceeds bufferMs, then drain.
      const draining = quietSince.current !== 0 && t - quietSince.current >= buffer;
      if (draining) pull.current = Math.max(0, pull.current - Math.max(4, pull.current * 0.12));

      if (pull.current <= 0) {
        reset();
        stopLoop();
        return;
      }

      const phase: PullState = draining ? 'reverting' : armed ? 'armed' : 'pulling';
      const progress = armed ? (t - armedSince.current) / dwell : pull.current / arm;
      setView({ phase, pull: pull.current, progress });
      raf.current = requestAnimationFrame(tick);
    };

    const ensureLoop = () => {
      if (!raf.current) raf.current = requestAnimationFrame(tick);
    };

    const onWheel = (e: WheelEvent) => {
      if (fired.current) return;
      const arm = params.current.armPx;
      const atBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1;

      if (e.deltaY > 0) {
        if (!atBottom && pull.current <= 0) return; // still real scrolling
        e.preventDefault();
        pull.current = clamp(pull.current + e.deltaY * resist(pull.current, arm), 0, arm * 3);
      } else if (e.deltaY < 0) {
        if (pull.current <= 0) return; // bleed pull first, then hand back to native scroll
        e.preventDefault();
        pull.current = Math.max(0, pull.current + e.deltaY);
      }
      lastWheel.current = now();
      quietSince.current = 0;
      ensureLoop();
    };

    scroller.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      scroller.removeEventListener('wheel', onWheel);
      stopLoop();
    };
  }, []);

  const lift = Math.min(view.pull, VISUAL_CAP);

  return (
    <div className="proto">
      <header className="proto__bar">
        <a className="proto__back" href="#/">‹ hub</a>
        <span className="proto__status">Overscroll-to-trigger · {view.phase}</span>
        <span />
      </header>

      <div className="pull">
        <PullBackdrop state={view.phase} progress={view.progress} label={view.phase === 'armed' ? 'Hold to archive…' : undefined} />
        <div className="pull__panel pull__panel--scroll" ref={scrollRef} style={{ transform: `translateY(${-lift}px)` }}>
          <h2>Weekly digest</h2>
          {Array.from({ length: 14 }, (_, i) => (
            <p key={i}>
              Paragraph {i + 1}. Scroll all the way down, then keep scrolling to overscroll past the bottom edge and
              arm the archive action.
            </p>
          ))}
          <p className="pull__panel-hint">↓ keep scrolling past here</p>
        </div>
      </div>

      <footer className="tuner-bar">
        <Tuner label="Distance" value={armPx} min={40} max={260} step={5} unit="px" onChange={setArmPx} />
        <Tuner label="Dwell" value={dwellMs} min={200} max={1600} step={50} unit="ms" onChange={setDwellMs} />
        <Tuner label="Buffer" value={bufferMs} min={300} max={2000} step={50} unit="ms" onChange={setBufferMs} />
      </footer>
    </div>
  );
}
