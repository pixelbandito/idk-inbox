// The signed-in account's own email address, fetched once and cached module-
// wide (reset on sign-out). It unlocks the "am I in To vs only Cc?" signal:
// without knowing your address there's no way to place you among the
// recipients. Address only — no other profile data is read or kept.

import { gmailJson } from './http';

let cache: Promise<string> | null = null;

/** The account's email address, lowercased, fetched once. */
export function loadAccountAddress(token: string): Promise<string> {
  cache ??= gmailJson<{ emailAddress?: string }>(token, '/profile', 'profile')
    .then((json) => (json.emailAddress ?? '').toLowerCase())
    .catch((e) => { cache = null; throw e; });
  return cache;
}

export function resetAccountProfile(): void {
  cache = null;
}
