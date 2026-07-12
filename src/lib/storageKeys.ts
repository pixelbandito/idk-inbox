// The single inventory of everything idk-inbox persists to localStorage, and
// the one place that clears account-scoped state at sign-out. Add a key here
// (not inline in a module) so "what does this app store, and what survives
// sign-out?" has one answer.

export const STORAGE_KEYS = {
  /** OAuth access token + expiry. Owned by lib/auth/tokenPersistence. */
  token: 'idk-inbox.token.v1',
  /** Sender volume + unread-dismissal log for the fatigue heuristic. */
  triageLog: 'idk-inbox:triage-log',
  /** Senders whose suggestion the user has resolved (won't re-suggest). */
  resolvedSuggestions: 'idk-inbox:dismissed-suggestions',
  /** User-accepted auto-archive rules. */
  autoArchiveRules: 'idk-inbox:auto-archive-rules',
  /** Per-processor on/off overrides (absence means "enabled"). */
  automationEnabled: 'idk-inbox:automation-enabled',
} as const;

// Account-scoped keys: Gmail label ids, sender history, and rules all belong to
// one account and must not leak into the next. The token is cleared separately
// by the auth flow.
const ACCOUNT_SCOPED_KEYS: string[] = [
  STORAGE_KEYS.triageLog,
  STORAGE_KEYS.resolvedSuggestions,
  STORAGE_KEYS.autoArchiveRules,
  STORAGE_KEYS.automationEnabled,
];

export function clearAccountScopedStorage(): void {
  for (const key of ACCOUNT_SCOPED_KEYS) localStorage.removeItem(key);
}
