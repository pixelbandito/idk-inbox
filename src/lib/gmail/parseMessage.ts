import type { EmailSummary } from './types';

interface GmailHeader {
  name: string;
  value: string;
}

export interface RawGmailMessage {
  id: string;
  threadId: string;
  snippet?: string;
  labelIds?: string[];
  payload?: { headers?: GmailHeader[] };
}

function header(headers: GmailHeader[], name: string): string {
  const found = headers.find((h) => h.name.toLowerCase() === name.toLowerCase());
  return found ? found.value : '';
}

export function parseGmailMessage(msg: RawGmailMessage): EmailSummary {
  const headers = msg.payload?.headers ?? [];
  return {
    id: msg.id,
    threadId: msg.threadId,
    from: header(headers, 'From'),
    subject: header(headers, 'Subject'),
    snippet: msg.snippet ?? '',
    date: header(headers, 'Date'),
    unread: (msg.labelIds ?? []).includes('UNREAD'),
  };
}
