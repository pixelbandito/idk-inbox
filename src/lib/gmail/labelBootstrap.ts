export const APP_LABEL = 'idk-inbox';
export const SNOOZED_LABEL = 'idk-inbox/Snoozed';

import { gmailJson } from './http';
import type { GmailLabel } from './types';

export interface BootstrapResult {
  created: string[];
}

async function listLabels(token: string): Promise<GmailLabel[]> {
  const json = await gmailJson<{ labels?: GmailLabel[] }>(token, '/labels', 'labels list');
  return json.labels ?? [];
}

async function createLabel(token: string, name: string): Promise<void> {
  await gmailJson<GmailLabel>(token, '/labels', 'label create', {
    method: 'POST',
    body: { name },
  });
}

export async function ensureAppLabels(token: string): Promise<BootstrapResult> {
  const existing = await listLabels(token);
  const names = new Set(existing.map((l) => l.name));

  const created: string[] = [];
  for (const wanted of [APP_LABEL, SNOOZED_LABEL]) {
    if (!names.has(wanted)) {
      await createLabel(token, wanted);
      created.push(wanted);
    }
  }
  return { created };
}
