import { useState } from 'react';
import { PROCESSORS, type ProcessorInfo } from '../../lib/automation/processors';
import { isProcessorEnabled, setProcessorEnabled } from '../../lib/automation/settings';
import { autoArchiveRules, removeAutoArchiveRule } from '../../lib/rules/autoArchive';
import { Toggle } from './Toggle';

/**
 * The audit hub: every automatic processor, what it does in plain language, an
 * on/off switch, and — for the rule engine — the concrete rules it will apply,
 * each removable. This is the "what is this app doing to my mail?" answer.
 */
export function AutomationSettings() {
  // Storage is imperative; bump to re-read after a toggle or removal.
  const [, force] = useState(0);
  const refresh = () => force((n) => n + 1);

  const toggle = (id: string, next: boolean) => {
    setProcessorEnabled(id, next);
    refresh();
  };

  return (
    <div className="automation">
      <p className="automation__intro">
        These run automatically on your mail. You’re in control — switch any off,
        or remove individual rules below.
      </p>
      {PROCESSORS.map((processor) => (
        <ProcessorCard
          key={processor.id}
          processor={processor}
          enabled={isProcessorEnabled(processor.id)}
          onToggle={(next) => toggle(processor.id, next)}
          onRulesChanged={refresh}
        />
      ))}
    </div>
  );
}

interface ProcessorCardProps {
  processor: ProcessorInfo;
  enabled: boolean;
  onToggle: (next: boolean) => void;
  onRulesChanged: () => void;
}

function ProcessorCard({ processor, enabled, onToggle, onRulesChanged }: ProcessorCardProps) {
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
      {processor.id === 'auto-archive' && <RuleList onChanged={onRulesChanged} />}
    </section>
  );
}

function RuleList({ onChanged }: { onChanged: () => void }) {
  const rules = autoArchiveRules();
  if (rules.length === 0) {
    return (
      <p className="rule-list__empty">
        No rules yet. When you accept an auto-archive suggestion, the sender shows up here.
      </p>
    );
  }
  const remove = (sender: string) => {
    removeAutoArchiveRule(sender);
    onChanged();
  };
  return (
    <ul className="rule-list">
      {rules.map((rule) => (
        <li key={rule.sender} className="rule-list__item">
          <span className="rule-list__sender">{rule.sender}</span>
          <span className="rule-list__since">
            since {new Date(rule.createdAt).toLocaleDateString()}
          </span>
          <button
            className="rule-list__remove"
            aria-label={`Remove auto-archive rule for ${rule.sender}`}
            onClick={() => remove(rule.sender)}
          >
            Remove
          </button>
        </li>
      ))}
    </ul>
  );
}
