// Shared Gmail REST plumbing — one place for the base URL, auth header, and
// the status-check-throw every endpoint wrapper was hand-rolling.

export const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

export function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

export interface GmailRequestOptions {
  method?: 'GET' | 'POST' | 'DELETE';
  body?: unknown;
}

/**
 * Fetches a Gmail endpoint and parses JSON, throwing `Gmail <what> failed:
 * <status>` on any non-2xx. `what` names the operation for humans reading the
 * error — never include the token or other secrets.
 */
export async function gmailJson<T>(
  token: string,
  path: string,
  what: string,
  opts: GmailRequestOptions = {},
): Promise<T> {
  const res = await fetch(`${GMAIL_BASE}${path}`, {
    method: opts.method ?? 'GET',
    headers: {
      ...authHeaders(token),
      ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  });
  if (!res.ok) throw new Error(`Gmail ${what} failed: ${res.status}`);
  return (await res.json()) as T;
}

/** DELETE that treats 404 as success — deletes are idempotent to us. */
export async function gmailDelete(token: string, path: string, what: string): Promise<void> {
  const res = await fetch(`${GMAIL_BASE}${path}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  });
  if (!res.ok && res.status !== 404) throw new Error(`Gmail ${what} failed: ${res.status}`);
}
