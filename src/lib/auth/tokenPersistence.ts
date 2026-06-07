// Persists the OAuth access token to localStorage so the app survives a
// page refresh without re-authenticating. The token has a ~1-hour Gmail
// expiry built in, so even a stored token is short-lived; we treat it
// as ephemeral convenience, not a long-term secret.

const KEY = 'idk-inbox.token.v1';

export interface PersistedToken {
  accessToken: string;
  expiresAt: number; // epoch ms
}

function safeLocalStorage(): Storage | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    // Touching `localStorage` can throw in some sandboxed contexts.
    localStorage.getItem(KEY);
    return localStorage;
  } catch {
    return null;
  }
}

export function loadPersistedToken(now: number = Date.now()): PersistedToken | null {
  const ls = safeLocalStorage();
  if (!ls) return null;
  try {
    const raw = ls.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedToken;
    if (
      typeof parsed.accessToken !== 'string' ||
      typeof parsed.expiresAt !== 'number'
    ) {
      ls.removeItem(KEY);
      return null;
    }
    if (parsed.expiresAt <= now) {
      ls.removeItem(KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function savePersistedToken(token: PersistedToken | null): void {
  const ls = safeLocalStorage();
  if (!ls) return;
  try {
    if (token === null) ls.removeItem(KEY);
    else ls.setItem(KEY, JSON.stringify(token));
  } catch {
    // Quota / security errors: swallow. Persistence is a nice-to-have.
  }
}
