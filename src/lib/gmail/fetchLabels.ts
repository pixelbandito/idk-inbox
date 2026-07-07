// User-facing tag labels: everything the user can file mail under, minus the
// app's plumbing (the idk-inbox parent and the snooze machinery).

import { APP_LABEL, SNOOZED_LABEL } from './labelBootstrap';

const BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

export interface UserLabel {
  id: string;
  name: string;
}

interface RawLabel extends UserLabel {
  type?: string;
}

function isPlumbing(name: string): boolean {
  return name === APP_LABEL || name === SNOOZED_LABEL || name.startsWith(`${SNOOZED_LABEL}/`);
}

export async function fetchUserLabels(token: string): Promise<UserLabel[]> {
  const res = await fetch(`${BASE}/labels`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Gmail labels list failed: ${res.status}`);
  const json = (await res.json()) as { labels?: RawLabel[] };

  return (json.labels ?? [])
    .filter((l) => l.type === 'user' && !isPlumbing(l.name))
    .map(({ id, name }) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
