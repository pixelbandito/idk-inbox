import { useEffect, useRef, useState } from 'react';
import { NavBar, PanelBody } from './NavBar';
import { PANEL_COUNT, hue, useEdgeSelection, useSeededWidths } from './navShared';

// Variant 2 — IDIOMATIC, the pattern you'll find in most React carousels.
//
//   • Scrolling + snapping: CSS scroll-snap (`.proto__scroller`).
//   • Active panel: an IntersectionObserver whose root is shrunk to a single
//     vertical line down the centre (rootMargin '0 -50% 0 -50%'); whichever
//     panel is currently crossing that line is the active one.
//   • Centre a panel: `scrollIntoView({ inline: 'center' })`.
//
// No custom scroll maths — the observer reports visibility, React holds state.

export function NavIdiomatic() {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  useSeededWidths(scrollerRef);
  useEdgeSelection(scrollerRef, setActive); // the centre-line observer can't reach the un-centrable edges

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const panels = Array.from(scroller.children);
    const observer = new IntersectionObserver(
      (entries) => {
        // At an extreme the un-centrable edge panel is owned by useEdgeSelection.
        if (scroller.scrollLeft <= 1 || scroller.scrollLeft + scroller.clientWidth >= scroller.scrollWidth - 1) return;
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(panels.indexOf(entry.target));
        }
      },
      { root: scroller, rootMargin: '0px -50% 0px -50%', threshold: 0 },
    );
    panels.forEach((panel) => observer.observe(panel));
    return () => observer.disconnect();
  }, []);

  const centre = (index: number) => {
    const clamped = Math.max(0, Math.min(PANEL_COUNT - 1, index));
    scrollerRef.current?.children[clamped]?.scrollIntoView({
      inline: 'center',
      block: 'nearest',
      behavior: 'smooth',
    });
  };

  return (
    <div className="proto">
      <NavBar title="Idiomatic" active={active} onPrev={() => centre(active - 1)} onNext={() => centre(active + 1)} />
      <div className="proto__scroller" ref={scrollerRef}>
        {Array.from({ length: PANEL_COUNT }, (_, i) => (
          <section
            key={i}
            className="proto__panel"
            data-active={i === active ? 'true' : undefined}
            style={{ '--hue': hue(i) } as React.CSSProperties}
            onClick={() => centre(i)}
          >
            <PanelBody index={i} active={i === active} />
          </section>
        ))}
      </div>
    </div>
  );
}
