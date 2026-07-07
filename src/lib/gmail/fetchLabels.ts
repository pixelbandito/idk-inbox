// User-facing tag labels: everything the user can file mail under, minus the
// app's plumbing (the idk-inbox parent and the snooze machinery).

import { gmailJson } from './http';
import { APP_LABEL, SNOOZED_LABEL } from './labelBootstrap';
import type { GmailLabel } from './types';

export type UserLabel = GmailLabel;

function isPlumbing(name: string): boolean {
  return name === APP_LABEL || name === SNOOZED_LABEL || name.startsWith(`${SNOOZED_LABEL}/`);
}

export async function fetchUserLabels(token: string): Promise<UserLabel[]> {
  const json = await gmailJson<{ labels?: (GmailLabel & { type?: string })[] }>(
    token,
    '/labels',
    'labels list',
  );
  return (json.labels ?? [])
    .filter((l) => l.type === 'user' && !isPlumbing(l.name))
    .map(({ id, name }) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
