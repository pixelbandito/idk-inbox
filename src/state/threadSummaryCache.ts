// Overlays (e.g. SnoozePicker's event-relative options) need the summary of
// the thread they're acting on, but targets travel as bare threadIds. List
// fetches deposit summaries here so overlays can look them up synchronously.

import type { EmailSummary } from '../lib/gmail/types';

const summaryByThreadId = new Map<string, EmailSummary>();

export function cacheThreadSummaries(emails: EmailSummary[]): void {
  for (const email of emails) summaryByThreadId.set(email.threadId, email);
}

export function threadSummaryOf(threadId: string): EmailSummary | undefined {
  return summaryByThreadId.get(threadId);
}

/** Sign-out boundary: cached mail from account A must not leak into B. */
export function resetThreadSummaryCache(): void {
  summaryByThreadId.clear();
}
