import { useCallback, useEffect, useRef, useState } from 'react';

// A clean-room sandbox for JUST the horizontal multi-panel navigation:
// h-scrolling to move between panels, tap/click to activate one, and a clear
// readout of which is active. No app content — 8 numbered skeleton panels.
//
// The rules we're iterating on:
//   • Active = the panel nearest the screen centre after a scroll settles.
//   • The first / last panels can never centre, so they activate once the
//     scroller is pinned at that edge.
//   • Tapping a panel activates it and centres it.

const PANEL_COUNT = 8;
// Varied starting widths so edge cases surface immediately — e.g. panel 4 is
// narrow (can it be centred?), panel 6 is wide. Drag a panel's right edge to
// resize it further.
const INITIAL_WIDTHS = [300, 120, 440, 90, 260, 520, 150, 340];
// Ignore scroll events our own centring emits, so it doesn't fight itself.
const PROGRAMMATIC_MS = 500;
const SETTLE_MS = 90;

export function PanelNavPrototype() {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const activeRef = useRef(0);
  useEffect(() => { activeRef.current = active; }, [active]);
  const programmaticUntil = useRef(0);

  // The custom scrollbar thumb reflects viewport-vs-content: its width is the
  // visible fraction, its offset the scroll position. Updated live (imperative).
  const updateBar = useCallback(() => {
    const sc = scrollerRef.current;
    const thumb = thumbRef.current;
    if (!sc || !thumb) return;
    const total = sc.scrollWidth || 1;
    thumb.style.width = `${(sc.clientWidth / total) * 100}%`;
    thumb.style.left = `${(sc.scrollLeft / total) * 100}%`;
  }, []);

  // Centre a panel in the viewport (used by tap + prev/next).
  const activate = useCallback((index: number) => {
    const clamped = Math.max(0, Math.min(PANEL_COUNT - 1, index));
    const el = scrollerRef.current?.children[clamped];
    if (el instanceof HTMLElement) {
      programmaticUntil.current = Date.now() + PROGRAMMATIC_MS;
      el.scrollIntoView({ inline: 'center', behavior: 'smooth', block: 'nearest' });
    }
    setActive(clamped);
  }, []);

  // Active-panel detection on manual scroll.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onScroll = () => {
      updateBar(); // live, every scroll event
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (Date.now() < programmaticUntil.current) return;
        const rect = scroller.getBoundingClientRect();
        const centre = rect.left + rect.width / 2;
        let best = 0;
        let bestDist = Infinity;
        Array.from(scroller.children).forEach((el, i) => {
          const r = el.getBoundingClientRect();
          const d = Math.abs(r.left + r.width / 2 - centre);
          if (d < bestDist) { bestDist = d; best = i; }
        });
        // Edge panels can't centre — activate them when pinned at the edge.
        if (scroller.scrollLeft <= 1) best = 0;
        else if (scroller.scrollLeft + scroller.clientWidth >= scroller.scrollWidth - 1) {
          best = PANEL_COUNT - 1;
        }
        if (best !== activeRef.current) setActive(best);
      }, SETTLE_MS);
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', updateBar);
    updateBar(); // initial
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', updateBar);
      if (timer) clearTimeout(timer);
    };
  }, [updateBar]);

  // Seed the varied widths imperatively (not via a React style prop) so native
  // `resize` can take over without a re-render resetting it. Keep the bar in
  // sync when a resize changes the content width.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    Array.from(scroller.children).forEach((el, i) => {
      if (el instanceof HTMLElement && INITIAL_WIDTHS[i]) el.style.width = `${INITIAL_WIDTHS[i]}px`;
    });
    updateBar();
    const ro = new ResizeObserver(() => updateBar());
    Array.from(scroller.children).forEach((el) => ro.observe(el));
    return () => ro.disconnect();
  }, [updateBar]);

  // Keyboard arrows for quick testing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') activate(activeRef.current + 1);
      else if (e.key === 'ArrowLeft') activate(activeRef.current - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activate]);

  return (
    <div className="proto">
      <header className="proto__bar">
        <button onClick={() => activate(active - 1)} disabled={active === 0} aria-label="Previous panel">‹</button>
        <span className="proto__status">Active panel: <strong>{active + 1}</strong> / {PANEL_COUNT}</span>
        <button onClick={() => activate(active + 1)} disabled={active === PANEL_COUNT - 1} aria-label="Next panel">›</button>
      </header>

      <div className="proto__scrollbar" aria-hidden="true">
        <div className="proto__scrollbar-thumb" ref={thumbRef} />
      </div>

      <div className="proto__scroller" ref={scrollerRef}>
        {Array.from({ length: PANEL_COUNT }, (_, i) => (
          <section
            key={i}
            className="proto__panel"
            data-active={i === active ? 'true' : undefined}
            style={{ '--hue': (i * 360) / PANEL_COUNT } as React.CSSProperties}
            onClick={() => activate(i)}
          >
            <div className="proto__num">{i + 1}</div>
            <div className="proto__hint">{i === active ? 'active' : 'tap to activate'}</div>
          </section>
        ))}
      </div>
    </div>
  );
}
