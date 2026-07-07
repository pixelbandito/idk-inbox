// Senders whose suggestion the user has resolved — by acting on it
// (unsubscribe / auto-archive) OR by dismissing it. Either way we don't
// re-surface it. Local-only; permanent for now (a re-suggest-after-N-days
// policy is a followup).

import { STORAGE_KEYS } from '../storageKeys';

const STORAGE_KEY = STORAGE_KEYS.resolvedSuggestions;

function read(): string[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}

export function resolveSuggestionFor(sender: string): void {
  const resolved = new Set(read());
  resolved.add(sender);
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...resolved]));
}

export function isSuggestionResolved(sender: string): boolean {
  return read().includes(sender);
}

export function resetResolvedSuggestions(): void {
  localStorage.removeItem(STORAGE_KEY);
}
