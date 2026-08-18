// Per-processor on/off state. Processors default to ENABLED; the store only
// records explicit overrides, so a new processor is live without a migration
// and "off" is always a deliberate user choice.

import { STORAGE_KEYS } from '../storageKeys';

const STORAGE_KEY = STORAGE_KEYS.automationEnabled;

type Overrides = Record<string, boolean>;

function readOverrides(): Overrides {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Overrides;
  } catch {
    return {};
  }
}

/** Whether a processor is currently allowed to run. Unknown ids default on. */
export function isProcessorEnabled(id: string): boolean {
  return readOverrides()[id] !== false;
}

export function setProcessorEnabled(id: string, enabled: boolean): void {
  const overrides = readOverrides();
  overrides[id] = enabled;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
}

export function resetProcessorSettings(): void {
  localStorage.removeItem(STORAGE_KEY);
}
