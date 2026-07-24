import { useState } from 'react';
import { PROCESSORS, type ProcessorInfo } from '../../lib/automation/processors';
import { isProcessorEnabled, setProcessorEnabled } from '../../lib/automation/settings';
import { autoArchiveRules, ruleEnabled } from '../../lib/rules/autoArchive';
import { useDispatchContext, useDispatcher } from '../../state/useDispatch';
import { Toggle } from './Toggle';

/**
 * The audit hub: every automatic processor, what it does in plain language, an
 * on/off switch, and — for the rule engine — a link to the concrete actions it
 * will apply. This is the "what is this app doing to my mail?" answer.
 */
export function AutomationSettings() {
  // Storage is imperative; bump to re-read after a toggle.
  const [, force] = useState(0);
  const ctx = useDispatchContext();
  const dispatch = useDispatcher();

  const toggle = (id: string, next: boolean) => {
    setProcessorEnabled(id, next);
    force((n) => n + 1);
  };
  const openActions = () =>
    void dispatch({ action: 'open-panel', args: { kind: 'automations' }, context: ctx });

  return (
    <div className="automation">
      <p className="automation__intro">
        These run automatically on your mail. You’re in control — switch any off,
        or manage the individual actions they created.
      </p>
      {PROCESSORS.map((processor) => (
        <ProcessorCard
          key={processor.id}
          processor={processor}
          enabled={isProcessorEnabled(processor.id)}
          onToggle={(next) => toggle(processor.id, next)}
          onOpenActions={openActions}
        />
      ))}
    </div>
  );
}

interface ProcessorCardProps {
  processor: ProcessorInfo;
  enabled: boolean;
  onToggle: (next: boolean) => void;
  onOpenActions: () => void;
}

function ProcessorCard({ processor, enabled, onToggle, onOpenActions }: ProcessorCardProps) {
  return (
    <section className="processor" data-enabled={enabled ? 'true' : undefined}>
      <div className="processor__head">
        <div>
          <h4 className="processor__name">
            {processor.name}
            <span className="processor__kind">
              {processor.kind === 'heuristic' ? 'suggests' : 'acts automatically'}
            </span>
          </h4>
          <p className="processor__summary">{processor.summary}</p>
        </div>
        <Toggle checked={enabled} onChange={onToggle} label={`Enable ${processor.name}`} />
      </div>
      <p className="processor__detail">{processor.detail}</p>
      {processor.id === 'auto-archive' && <RulesLink onOpen={onOpenActions} />}
    </section>
  );
}

/** A CTA into the dedicated actions panel, labelled with the live rule count. */
function RulesLink({ onOpen }: { onOpen: () => void }) {
  const rules = autoArchiveRules();
  if (rules.length === 0) {
    return (
      <p className="rule-list__empty">
        No rules yet. When you accept an auto-archive suggestion, the sender shows up here.
      </p>
    );
  }
  const active = rules.filter(ruleEnabled).length;
  const summary =
    active === rules.length
      ? `${rules.length} action${rules.length === 1 ? '' : 's'}`
      : `${active} of ${rules.length} active`;
  return (
    <button className="processor__actions-link" onClick={onOpen}>
      View {summary} →
    </button>
  );
}
