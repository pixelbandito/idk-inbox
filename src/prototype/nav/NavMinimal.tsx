import { useEffect, useRef, useState } from 'react';
import { NavBar, PanelBody } from './NavBar';
import { PANEL_COUNT, hue, useSeededWidths } from './navShared';

// Variant 1 — MINIMAL, modern platform features do the work.
//
//   • Scrolling + snapping: pure CSS scroll-snap (`.proto__scroller`). Zero JS.
//   • Active panel: the `scrollsnapchange` event (Chrome 129+) hands us the
//     newly snapped element directly — no geometry maths, no observers.
//   • Centre a panel: `Element.scrollIntoView({ inline: 'center' })`.
//
// That's the whole mechanic. Everything else is chrome. The honest trade-off:
// the first/last panels can't reach centre, so this pure approach never selects
// them — see the Padded variant for the CSS fix, or Home-rolled for the JS one.

// `scrollsnapchange` isn't in the DOM lib types yet; this is the shape we read.
type SnapEvent = Event & { snapTargetInline: Element | null };

export function NavMinimal() {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  useSeededWidths(scrollerRef);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const onSnap = (e: Event) => {
      const target = (e as SnapEvent).snapTargetInline;
      if (!target) return;
      const index = Array.from(scroller.children).indexOf(target);
      if (index >= 0) setActive(index);
    };
    scroller.addEventListener('scrollsnapchange', onSnap);
    return () => scroller.removeEventListener('scrollsnapchange', onSnap);
  }, []);

  const centre = (index: number) => {
    const clamped = Math.max(0, Math.min(PANEL_COUNT - 1, index));
    scrollerRef.current?.children[clamped]?.scrollIntoView({
      inline: 'center',
      block: 'nearest',
      behavior: 'smooth',
    });
    setActive(clamped);
  };

  return (
    <div className="proto">
      <NavBar title="Minimal" active={active} onPrev={() => centre(active - 1)} onNext={() => centre(active + 1)} />
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
