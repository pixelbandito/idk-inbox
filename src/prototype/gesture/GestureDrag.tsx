import { useEffect, useRef, useState } from 'react';
import { PullBackdrop } from './PullBackdrop';
import { Tuner } from './Tuner';
import { clamp, type PullState } from './pullShared';

// Rig 1 — CLICK-AND-DRAG only, for feeling out "pull-to-trigger".
//
// A single drag does everything: it scrolls the article, and once you reach the
// bottom, the same continued drag pulls past the edge to arm. 1:1, no timers, no
// momentum — you can inch right up to the threshold and watch armed ⇄ pulling.
// Release past the threshold fires; either way the panel settles back to neutral,
// it never flings away. Same scrollable content and same "reach the bottom then
// pull further" flow as the overscroll rig — only the trigger gate differs.

const MAX_PULL = 340; // how far past the bottom the drag can pull
const VISUAL_CAP = 180; // px the panel lifts to reveal the backdrop
const SEAM_BLEED = 2; // reveal overlap tucked behind the card, kills the hairline

export function GestureDrag() {
  const [threshold, setThreshold] = useState(120);
  const [pull, setPull] = useState(0); // distance dragged past the bottom
  const [phase, setPhase] = useState<PullState>('idle');
  const [dragActive, setDragActive] = useState(false); // drives the 1:1 (no-transition) state
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const startY = useRef(0);
  const startScrollTop = useRef(0);
  const pullRef = useRef(0);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearReset = () => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = null;
  };
  useEffect(() => clearReset, []);

  const setPullValue = (next: number) => {
    pullRef.current = next;
    setPull(next);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (phase === 'activated') return;
    clearReset();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragging.current = true;
    setDragActive(true);
    startY.current = e.clientY;
    startScrollTop.current = scrollRef.current?.scrollTop ?? 0;
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const el = scrollRef.current;
    if (!el) return;
    // Drag up first scrolls toward the bottom; only travel past the bottom pulls.
    const up = startY.current - e.clientY;
    const maxScroll = el.scrollHeight - el.clientHeight;
    const desired = startScrollTop.current + up;
    el.scrollTop = clamp(desired, 0, maxScroll);
    const next = clamp(desired - maxScroll, 0, MAX_PULL);
    setPullValue(next);
    setPhase(next >= threshold ? 'armed' : next > 0 ? 'pulling' : 'idle');
  };

  const endDrag = () => {
    if (!dragging.current) return;
    dragging.current = false;
    setDragActive(false);
    const distance = pullRef.current;
    setPullValue(0); // settle back to neutral (CSS transition eases the lift home)
    if (distance >= threshold) {
      setPhase('activated');
      resetTimer.current = setTimeout(() => setPhase('idle'), 700);
    } else if (distance > 0) {
      setPhase('reverting');
      resetTimer.current = setTimeout(() => setPhase('idle'), 350);
    } else {
      setPhase('idle');
    }
  };

  const lift = Math.min(pull, VISUAL_CAP);
  const progress = phase === 'activated' ? 1 : clamp(pull / threshold, 0, 1);

  return (
    <div className="proto">
      <header className="proto__bar">
        <a className="proto__back" href="#/">‹ hub</a>
        <span className="proto__status">Drag-to-trigger · {phase}</span>
        <span />
      </header>

      <div className="pull">
        {/* Same reveal as the overscroll rig: the affordance sits behind the card
            and only the card's own displacement uncovers it. `data-eased` matches
            the card's release transition so the two travel home together. */}
        <div
          className="pull__reveal"
          data-eased={!dragActive || undefined}
          style={{ height: lift > 0 ? lift + SEAM_BLEED : 0 }}
        >
          <PullBackdrop state={phase} progress={progress} variant="peek" />
        </div>
        <div
          className="pull__panel pull__panel--dragscroll"
          ref={scrollRef}
          data-dragging={dragActive || undefined}
          data-lifted={lift > 0 || undefined}
          style={{ transform: `translateY(${-lift}px)` }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <h2>Weekly digest</h2>
          {Array.from({ length: 14 }, (_, i) => (
            <p key={i}>
              Paragraph {i + 1}. Drag to scroll through the article; once you hit the bottom, keep dragging past the
              edge to arm the archive action.
            </p>
          ))}
          <p className="pull__panel-hint">↑ drag past the bottom to archive</p>
        </div>
      </div>

      <footer className="tuner-bar">
        <Tuner label="Threshold" value={threshold} min={40} max={300} step={5} unit="px" onChange={setThreshold} />
      </footer>
    </div>
  );
}
