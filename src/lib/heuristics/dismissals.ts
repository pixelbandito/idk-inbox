// Suggestions the user has waved away. Local-only; permanent for now (a
// re-suggest-after-N-days policy is a followup).

const STORAGE_KEY = 'idk-inbox:dismissed-suggestions';

function read(): string[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}

export function dismissSuggestionFor(sender: string): void {
  const dismissed = new Set(read());
  dismissed.add(sender);
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...dismissed]));
}

export function isSuggestionDismissed(sender: string): boolean {
  return read().includes(sender);
}

export function resetDismissals(): void {
  localStorage.removeItem(STORAGE_KEY);
}
