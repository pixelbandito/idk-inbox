// Clears every persistent and in-memory app store between tests, so state
// from one test can't leak into the next. Call in beforeEach.

import { resetTriageLog } from '../lib/heuristics/triageLog';
import { resetResolvedSuggestions } from '../lib/heuristics/resolvedSuggestions';
import { resetAutoArchiveRules } from '../lib/rules/autoArchive';
import { resetThreadSummaryCache } from '../state/threadSummaryCache';
import { resetAppLabelResolver } from '../lib/gmail/appLabelResolver';
import { resetProcessorSettings } from '../lib/automation/settings';

export function resetLocalState(): void {
  resetTriageLog();
  resetResolvedSuggestions();
  resetAutoArchiveRules();
  resetThreadSummaryCache();
  resetAppLabelResolver();
  resetProcessorSettings();
}
