import { useState } from 'react';
import { PanelHeader } from '../layout/PanelHeader';
import { Toggle } from './settings/Toggle';
import {
  autoArchiveRules, ruleEnabled,
  setAutoArchiveRuleEnabled, setAllAutoArchiveRulesEnabled,
  removeAutoArchiveRule, removeAllAutoArchiveRules,
} from '../lib/rules/autoArchive';

export interface AutomationActionsPanelProps {
  onClose: () => void;
}

/**
 * The concrete auto-archive rules your accepted suggestions created, opened as
 * its own panel from Settings. Each can be paused (kept but skipped) or removed,
 * and there are one-tap "disable all" / "delete all" controls.
 */
export function AutomationActionsPanel({ onClose }: AutomationActionsPanelProps) {
  const [, force] = useState(0);
  const refresh = () => force((n) => n + 1);
  const rules = autoArchiveRules();
  const anyEnabled = rules.some(ruleEnabled);

  return (
    <>
      <PanelHeader
        title="Auto-archive actions"
        actions={<button onClick={onClose} aria-label="Close automations">×</button>}
      />
      <div className="panel__body settings">
        <p className="automation__intro">
          Every auto-archive rule your accepted suggestions created. Pause one to stop
          it without losing it, or remove it for good.
        </p>

        {rules.length === 0 ? (
          <p className="rule-list__empty">
            No auto-archive actions yet. When you accept an auto-archive suggestion, it shows up here.
          </p>
        ) : (
          <>
            <div className="actions-bulk">
              <button
                className="btn btn--ghost"
                onClick={() => { setAllAutoArchiveRulesEnabled(!anyEnabled); refresh(); }}
              >
                {anyEnabled ? 'Disable all' : 'Enable all'}
              </button>
              <button
                className="btn btn--ghost actions-bulk__danger"
                onClick={() => { removeAllAutoArchiveRules(); refresh(); }}
              >
                Delete all
              </button>
            </div>

            <ul className="rule-list">
              {rules.map((rule) => (
                <li
                  key={rule.sender}
                  className="rule-list__item"
                  data-disabled={ruleEnabled(rule) ? undefined : 'true'}
                >
                  <Toggle
                    checked={ruleEnabled(rule)}
                    label={`Enable auto-archive for ${rule.sender}`}
                    onChange={(next) => { setAutoArchiveRuleEnabled(rule.sender, next); refresh(); }}
                  />
                  <span className="rule-list__sender">{rule.sender}</span>
                  <button
                    className="rule-list__remove"
                    aria-label={`Remove auto-archive rule for ${rule.sender}`}
                    onClick={() => { removeAutoArchiveRule(rule.sender); refresh(); }}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </>
  );
}
