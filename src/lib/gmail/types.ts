export interface GmailLabel {
  id: string;
  name: string;
}

export interface EmailSummary {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  snippet: string;
  date: string;
  unread: boolean;
  /** Raw Gmail label IDs on the message (resolved to pills via labelDirectory). */
  labels: string[];
  /** Raw List-Unsubscribe header when the sender provides one. */
  listUnsubscribe?: string;
}
