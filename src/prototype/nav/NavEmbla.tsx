import { useEffect, useRef, useState } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import { WheelGesturesPlugin } from 'embla-carousel-wheel-gestures';
import { NavBar, PanelBody } from './NavBar';
import { PANEL_COUNT, hue, useSeededWidths } from './navShared';

// Variant 3 — FOSS, hand the whole mechanic to Embla Carousel (headless, ~5kB).
//
//   • Scrolling, snapping, pointer/touch dragging, momentum: all Embla.
//   • Active panel: `emblaApi.selectedScrollSnap()`, pushed on Embla's 'select'.
//   • Centre a panel: `emblaApi.scrollTo(index)` / `scrollPrev` / `scrollNext`.
//
// We only supply the markup and read back the selected snap.

export function NavEmbla() {
  // WheelGestures lets a trackpad / mouse wheel drive Embla, so it navigates by
  // scroll like the other variants (Embla is pointer-drag only out of the box).
  // containScroll 'keepSnaps' contains the scroll so there's no empty over-scroll
  // room at the ends (the odd side padding), while keeping a snap for every
  // panel — so all eight stay selectable, with the edge ones sitting flush.
  const [emblaRef, emblaApi] = useEmblaCarousel({ axis: 'x', align: 'center', containScroll: 'keepSnaps' }, [
    WheelGesturesPlugin(),
  ]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  useSeededWidths(containerRef);

  // Embla measures slide sizes at init, so re-init once our varied widths land.
  useEffect(() => {
    emblaApi?.reInit();
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => setActive(emblaApi.selectedScrollSnap());
    emblaApi.on('select', onSelect);
    onSelect();
    return () => {
      emblaApi.off('select', onSelect);
    };
  }, [emblaApi]);

  return (
    <div className="proto">
      <NavBar
        title="Embla"
        active={active}
        onPrev={() => emblaApi?.scrollPrev()}
        onNext={() => emblaApi?.scrollNext()}
      />
      <div className="embla" ref={emblaRef}>
        <div className="embla__container" ref={containerRef}>
          {Array.from({ length: PANEL_COUNT }, (_, i) => (
            <section
              key={i}
              className="proto__panel"
              data-active={i === active ? 'true' : undefined}
              style={{ '--hue': hue(i) } as React.CSSProperties}
              onClick={() => emblaApi?.scrollTo(i)}
            >
              <PanelBody index={i} active={i === active} />
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
