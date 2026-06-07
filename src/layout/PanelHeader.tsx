import { useRef, type ReactNode } from 'react';
import { useGestureProducer } from '../triggers/producers/fromGesture';
import { useTriggerHandler } from '../triggers/useTriggerHandler';
import { swipeInlineEnd, swipeInlineStart } from '../triggers/triggers';
import type { TriggerName } from '../triggers/types';

// Panel-header swipes (next/prev nav) flow through the trigger pipeline.
const PANEL_HEADER_NEW_PIPELINE: ReadonlySet<TriggerName> = new Set([
  swipeInlineEnd,
  swipeInlineStart,
]);

export interface PanelHeaderProps {
  title: string;
  actions?: ReactNode;
}

export function PanelHeader({ title, actions }: PanelHeaderProps) {
  const ref = useRef<HTMLElement>(null);
  const onTrigger = useTriggerHandler(PANEL_HEADER_NEW_PIPELINE);
  useGestureProducer('panel-header', ref, onTrigger);

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
