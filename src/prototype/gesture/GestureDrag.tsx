import { useEffect, useRef, useState } from 'react';
import { PullBackdrop } from './PullBackdrop';
import { Tuner } from './Tuner';
import { clamp, type PullState } from './pullShared';

// Rig 1 — CLICK-AND-DRAG only, for feeling out "pull-to-trigger".
//
// One pointer, 1:1 mapping, no timers, no momentum: drag the card up and it
// tracks your finger exactly, so you can inch right up to the threshold and
// watch the backdrop flip armed ⇄ pulling. Release past the threshold fires;
// either way the card settles back to neutral — it never flings away.
// Vertical, to match the overscroll rig for an apples-to-apples comparison.

const MAX_PULL = 340; // how far up the card can travel

export function GestureDrag() {
  const [threshold, setThreshold] = useState(120);
  const [offset, setOffset] = useState(0); // panel offset; negative = pulled up
  const [phase, setPhase] = useState<PullState>('idle');
  const [dragActive, setDragActive] = useState(false); // drives the 1:1 (no-transition) state
  const dragging = useRef(false);
  const startY = useRef(0);
  const offsetRef = useRef(0);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearReset = () => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = null;
  };
  useEffect(() => clearReset, []);

  const move = (next: number) => {
    offsetRef.current = next;
    setOffset(next);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (phase === 'activated') return;
    clearReset();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragging.current = true;
    setDragActive(true);
    startY.current = e.clientY;
    move(0);
    setPhase('pulling');
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const next = clamp(e.clientY - startY.current, -MAX_PULL, 0);
    move(next);
    const distance = -next;
    setPhase(distance >= threshold ? 'armed' : distance > 0 ? 'pulling' : 'idle');
  };

  const endDrag = () => {
    if (!dragging.current) return;
    dragging.current = false;
    setDragActive(false);
    const distance = -offsetRef.current;
    // Both outcomes settle back to neutral; only the label/colour differs.
    move(0);
    if (distance >= threshold) {
      setPhase('activated');
      resetTimer.current = setTimeout(() => setPhase('idle'), 700);
    } else {
      setPhase('reverting');
      resetTimer.current = setTimeout(() => setPhase('idle'), 350);
    }
  };

  const progress = phase === 'activated' ? 1 : clamp(-offset / threshold, 0, 1);

  return (
    <div className="proto">
      <header className="proto__bar">
        <a className="proto__back" href="#/">‹ hub</a>
        <span className="proto__status">Drag-to-trigger · {phase}</span>
        <span />
      </header>

      <div className="pull">
        <PullBackdrop state={phase} progress={progress} />
        <article
          className="pull__panel"
          data-dragging={dragActive || undefined}
          style={{ transform: `translateY(${offset}px)` }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <h2>Weekly digest</h2>
          <p>Drag this card upward. Past the threshold it arms; let go to archive.</p>
          <p className="pull__panel-hint">↑ drag up</p>
        </article>
      </div>

      <footer className="tuner-bar">
        <Tuner label="Threshold" value={threshold} min={40} max={300} step={5} unit="px" onChange={setThreshold} />
      </footer>
    </div>
  );
}
