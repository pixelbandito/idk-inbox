// The catalogue of "automatic processors" the app runs on a user's mail,
// described in plain language for the Settings hub. This is the human-facing
// registry; the actual logic lives in lib/heuristics and lib/rules. Keeping the
// descriptions here (not buried in components) gives "what does this app do to
// my inbox, and why?" a single, readable answer.

import { DEFAULT_FATIGUE_THRESHOLDS, FATIGUE_WINDOW_DAYS } from '../heuristics/senderFatigue';

/**
 * A "heuristic" watches your behaviour and *suggests* something; a "rule" is a
 * concrete filter that *acts* on its own. Users audit both, but the distinction
 * matters: turning off a heuristic stops future suggestions, while a rule keeps
 * running until you remove it.
 */
export type ProcessorKind = 'heuristic' | 'rule-engine';

export interface ProcessorInfo {
  id: string;
  kind: ProcessorKind;
  /** Short, human name. */
  name: string;
  /** One plain-language sentence: what it does for the user. */
  summary: string;
  /** The specifics — thresholds and timing — spelled out without jargon. */
  detail: string;
}

const fatigueDetail = (): string => {
  const { minSeen, minDismissRate } = DEFAULT_FATIGUE_THRESHOLDS;
  const percent = Math.round(minDismissRate * 100);
  return `Kicks in once you've seen ${minSeen}+ messages from a sender in ${FATIGUE_WINDOW_DAYS} days and archived at least ${percent}% of them while still unread.`;
};

export const PROCESSORS: ProcessorInfo[] = [
  {
    id: 'sender-fatigue',
    kind: 'heuristic',
    name: 'Sender fatigue',
    summary: 'Spots senders whose mail you keep archiving unread, and offers to unsubscribe or auto-archive them.',
    detail: fatigueDetail(),
  },
  {
    id: 'auto-archive',
    kind: 'rule-engine',
    name: 'Auto-archive rules',
    summary: 'Archives new mail from senders you chose to silence, so it never reaches your inbox.',
    detail: 'Each rule below was created when you accepted an auto-archive suggestion. Rules run every time you open the app.',
  },
];

export function processorById(id: string): ProcessorInfo | undefined {
  return PROCESSORS.find((p) => p.id === id);
}
