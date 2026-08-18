import { useEffect, useRef, useState } from 'react';
import { NavBar, PanelBody } from './NavBar';
import { PANEL_COUNT, hue, useSeededWidths } from './navShared';

// Variant — PADDED, the pragmatic pure-CSS fix for the un-centrable edges.
//
// The other snap-based variants can't select the first/last panel because there
// is nothing to scroll past them, so they never reach centre. Add real half-a-
// viewport padding on each side of the scroller (`.proto__scroller--padded`) and
// that empty room lets even the edge panels scroll to centre — so plain CSS
// scroll-snap + the `scrollsnapchange` event now handles all eight, no JS hack.
//
// The trade-off is right there on screen: visible empty space at the two ends.

type SnapEvent = Event & { snapTargetInline: Element | null };

export function NavPadded() {
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
      <NavBar title="Padded" active={active} onPrev={() => centre(active - 1)} onNext={() => centre(active + 1)} />
      <div className="proto__scroller proto__scroller--padded" ref={scrollerRef}>
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
