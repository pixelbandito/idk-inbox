import { useRef, type ReactNode } from 'react';
import { useGestureBindings } from '../input/useGestureBindings';

export interface PanelHeaderProps {
  title: string;
  actions?: ReactNode;
}

export function PanelHeader({ title, actions }: PanelHeaderProps) {
  const ref = useRef<HTMLElement>(null);
  useGestureBindings('panel-header', ref);

  return (
    <header
      ref={ref}
      className="panel__header"
      role="banner"
      data-surface="panel-header"
      style={{ touchAction: 'pan-y' }}
    >
      <h2 className="panel__title">{title}</h2>
      {actions && <div className="panel__actions">{actions}</div>}
    </header>
  );
}
