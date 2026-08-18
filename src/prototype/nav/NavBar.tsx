import { PANEL_COUNT } from './navShared';

/**
 * The top chrome shared by every nav variant: a link back to the hub, prev/next
 * buttons, and the active-panel readout. Keeping it in one place means all four
 * variants stay visually and behaviourally identical above the panels, so the
 * only thing that differs between them is the scroll/active mechanic itself.
 */
export function NavBar({
  title,
  active,
  onPrev,
  onNext,
}: {
  title: string;
  active: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <header className="proto__bar">
      <a className="proto__back" href="#/">‹ hub</a>
      <button onClick={onPrev} disabled={active === 0} aria-label="Previous panel">‹</button>
      <span className="proto__status">
        {title}: <strong>{active + 1}</strong> / {PANEL_COUNT}
      </span>
      <button onClick={onNext} disabled={active === PANEL_COUNT - 1} aria-label="Next panel">›</button>
    </header>
  );
}

/** The inner content of one skeleton panel — number + active/idle hint. */
export function PanelBody({ index, active }: { index: number; active: boolean }) {
  return (
    <>
      <div className="proto__num">{index + 1}</div>
      <div className="proto__hint">{active ? 'active' : 'tap to activate'}</div>
    </>
  );
}
