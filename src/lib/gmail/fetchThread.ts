import { extractPlainText } from './threadParse';

const BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

interface RawHeader { name: string; value: string }
interface RawPayload {
  headers?: RawHeader[];
  mimeType?: string;
  body?: { data?: string };
  parts?: RawPayload[];
}
interface RawMessage {
  id: string;
  payload?: RawPayload;
}
interface RawThread {
  id: string;
  messages?: RawMessage[];
}

export interface ThreadMessage {
  id: string;
  from: string;
  to: string;
  date: string;
  body: string;
}

export interface ThreadView {
  id: string;
  subject: string;
  messages: ThreadMessage[];
}

function header(headers: RawHeader[] | undefined, name: string): string {
  const h = (headers ?? []).find((x) => x.name.toLowerCase() === name.toLowerCase());
  return h ? h.value : '';
}

function parseMessage(raw: RawMessage): ThreadMessage {
  const headers = raw.payload?.headers ?? [];
  return {
    id: raw.id,
    from: header(headers, 'From'),
    to: header(headers, 'To'),
    date: header(headers, 'Date'),
    body: extractPlainText(raw.payload),
  };
}

export async function fetchThread(token: string, threadId: string): Promise<ThreadView> {
  const res = await fetch(`${BASE}/threads/${threadId}?format=full`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Gmail thread fetch failed: ${res.status}`);

  const raw = (await res.json()) as RawThread;
  const messages = (raw.messages ?? []).map(parseMessage);
  const subject = messages.length > 0
    ? header(raw.messages![0].payload?.headers, 'Subject')
    : '';

  return { id: raw.id, subject, messages };
}
