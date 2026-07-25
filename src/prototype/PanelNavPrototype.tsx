import { useCallback, useEffect, useRef, useState } from 'react';

// A clean-room sandbox for JUST the horizontal multi-panel navigation:
// h-scrolling to move between panels, tap/click to activate one, and a clear
// readout of which is active. No app content — 8 numbered skeleton panels.
//
// The rules we're iterating on:
//   • Scrolling moves an attention cursor C through the whole content, with a
//     ½-viewport buffer past each end where the panels stay put and only the
//     notch moves within the thumb.
//   • Active = the panel C points at — the one whose content range contains C,
//     nearest when C is in a gap or the edge buffer. So an edge panel activates
//     as soon as C enters its buffer, even though it can never be centred.
//   • Tapping a panel points C at its centre and scrolls toward it.

const PANEL_COUNT = 8;
// Varied starting widths so edge cases surface immediately — e.g. panel 4 is
// narrow (can it be centred?), panel 6 is wide. Drag a panel's right edge to
// resize it further.
const INITIAL_WIDTHS = [300, 120, 440, 90, 260, 520, 150, 340];
// How long a driven scroll (tap-to-centre / wheel) suppresses the native-scroll
// cursor re-centring, so our own scroll settling doesn't fight it.
const PROGRAMMATIC_MS = 500;
const DRIVE_MS = 200;

export function PanelNavPrototype() {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const notchRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const activeRef = useRef(0);
  useEffect(() => { activeRef.current = active; }, [active]);
  // While we're driving the scroll (wheel / tap), a native scroll event must not
  // re-centre the cursor — it's our own scroll settling.
  const drivingUntil = useRef(0);

  // The cursor C, in content px, ranging the WHOLE content [0, scrollWidth] —
  // half a viewport past each clamp point. The panels follow scrollLeft
  // (clamped); only the cursor enters the edge buffer.
  const centreRef = useRef(0);

  // The custom scrollbar thumb reflects viewport-vs-content: its width is the
  // visible fraction, its offset the scroll position. Updated live (imperative).
  const updateBar = useCallback(() => {
    const sc = scrollerRef.current;
    const thumb = thumbRef.current;
    if (!sc || !thumb) return;
    const total = sc.scrollWidth || 1;
    const view = sc.clientWidth;
    thumb.style.width = `${(view / total) * 100}%`;
    thumb.style.left = `${(sc.scrollLeft / total) * 100}%`;

    // The notch sits at C within the thumb: (C − scrollLeft) / viewport. Centre
    // (0.5) in the interior; slides toward an edge (0 or 1) as C enters the
    // buffer while the thumb stays clamped.
    const notch = notchRef.current;
    if (notch && view) {
      const within = Math.max(0, Math.min(1, (centreRef.current - sc.scrollLeft) / view));
      notch.style.left = `${within * 100}%`;
    }

    // Map: each segment grows in proportion to its panel's current width, so
    // the whole line fills the track and reflects the relative panel sizes.
    const map = mapRef.current;
    if (map) {
      Array.from(sc.children).forEach((panel, i) => {
        const seg = map.children[i];
        if (seg instanceof HTMLElement && panel instanceof HTMLElement) {
          seg.style.flexGrow = String(panel.getBoundingClientRect().width);
        }
      });
    }
  }, []);

  // The active panel is the one the cursor C points at — the panel whose content
  // range contains C, or the nearest when C sits in a gap or the edge padding.
  // So an edge panel becomes active once C enters its buffer, even though it can
  // never be centred.
  const pickActive = useCallback(() => {
    const sc = scrollerRef.current;
    if (!sc) return;
    const C = centreRef.current;
    const scLeft = sc.getBoundingClientRect().left;
    let best = 0;
    let bestDist = Infinity;
    Array.from(sc.children).forEach((el, i) => {
      if (!(el instanceof HTMLElement)) return;
      const r = el.getBoundingClientRect();
      const left = r.left - scLeft + sc.scrollLeft;   // content-space left
      const right = left + r.width;
      const dist = C < left ? left - C : C > right ? C - right : 0; // 0 if inside
      if (dist < bestDist) { bestDist = dist; best = i; }
    });
    if (best !== activeRef.current) setActive(best);
  }, []);

  // Point C at a panel's centre and scroll toward it. For an edge panel that
  // can't be centred, the thumb clamps and the notch lands off-centre — the
  // "cannot be centred" case made visible.
  const activate = useCallback((index: number) => {
    const sc = scrollerRef.current;
    const clamped = Math.max(0, Math.min(PANEL_COUNT - 1, index));
    const el = sc?.children[clamped];
    if (sc && el instanceof HTMLElement) {
      const total = sc.scrollWidth;
      const r = el.getBoundingClientRect();
      const centre = r.left - sc.getBoundingClientRect().left + sc.scrollLeft + r.width / 2;
      centreRef.current = Math.max(0, Math.min(total, centre));
      drivingUntil.current = Date.now() + PROGRAMMATIC_MS;
      sc.scrollTo({
        left: Math.max(0, Math.min(sc.scrollWidth - sc.clientWidth, centreRef.current - sc.clientWidth / 2)),
        behavior: 'smooth',
      });
      updateBar();
    }
    setActive(clamped);
  }, [updateBar]);

  // Scroll wiring: drive the cursor, sync the visuals, pick the active panel from
  // the cursor (not from viewport geometry).
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    // Take over the wheel so we can drive C past the native scroll limit into the
    // edge buffer (½ a viewport each side), where the panels stay put and only
    // the notch moves. Interior scrolling behaves normally (notch stays centred).
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      drivingUntil.current = Date.now() + DRIVE_MS;
      const delta = Math.abs(e.deltaX) >= Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      const total = scroller.scrollWidth;
      centreRef.current = Math.max(0, Math.min(total, centreRef.current + delta));
      scroller.scrollLeft = Math.max(
        0,
        Math.min(scroller.scrollWidth - scroller.clientWidth, centreRef.current - scroller.clientWidth / 2),
      );
      updateBar();   // at an edge scrollLeft is clamped (no scroll event) — update here
      pickActive();  // active follows the cursor, live
    };

    const onScroll = () => {
      // A native scroll we didn't drive (touch, dragging the browser scrollbar)
      // re-centres the cursor on the viewport.
      if (Date.now() >= drivingUntil.current) {
        centreRef.current = scroller.scrollLeft + scroller.clientWidth / 2;
      }
      updateBar();
      pickActive();
    };

    const onResize = () => { updateBar(); pickActive(); };

    scroller.addEventListener('scroll', onScroll, { passive: true });
    scroller.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('resize', onResize);
    updateBar();
    pickActive();
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      scroller.removeEventListener('wheel', onWheel);
      window.removeEventListener('resize', onResize);
    };
  }, [updateBar, pickActive]);

  // Seed the varied widths imperatively (not via a React style prop) so native
  // `resize` can take over without a re-render resetting it. Keep the bar in
  // sync when a resize changes the content width.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    Array.from(scroller.children).forEach((el, i) => {
      if (el instanceof HTMLElement && INITIAL_WIDTHS[i]) el.style.width = `${INITIAL_WIDTHS[i]}px`;
    });
    centreRef.current = scroller.clientWidth / 2; // notch centred at the start
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
        <div className="proto__scrollbar-thumb" ref={thumbRef}>
          <div className="proto__scrollbar-notch" ref={notchRef} />
        </div>
      </div>

      {/* Map: colored segments in proportion to each panel's width. */}
      <div className="proto__map" ref={mapRef} aria-hidden="true">
        {Array.from({ length: PANEL_COUNT }, (_, i) => (
          <div key={i} className="proto__map-seg" style={{ '--hue': (i * 360) / PANEL_COUNT } as React.CSSProperties} />
        ))}
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
