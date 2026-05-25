import { useRef, type PointerEvent, type ReactNode } from 'react';

const SWIPE_THRESHOLD_PX = 60;

export interface PanelHeaderProps {
  title: string;
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  actions?: ReactNode;
}

export function PanelHeader({ title, onSwipeLeft, onSwipeRight, actions }: PanelHeaderProps) {
  const startX = useRef<number | null>(null);

  function handleDown(e: PointerEvent<HTMLElement>) {
    startX.current = e.clientX;
  }

  function handleUp(e: PointerEvent<HTMLElement>) {
    if (startX.current === null) return;
    const dx = e.clientX - startX.current;
    startX.current = null;
    if (Math.abs(dx) < SWIPE_THRESHOLD_PX) return;
    if (dx < 0) onSwipeLeft();
    else onSwipeRight();
  }

  return (
    <header
      className="panel__header"
      role="banner"
      onPointerDown={handleDown}
      onPointerUp={handleUp}
      onPointerCancel={() => { startX.current = null; }}
    >
      <h2 className="panel__title">{title}</h2>
      {actions && <div className="panel__actions">{actions}</div>}
    </header>
  );
}
