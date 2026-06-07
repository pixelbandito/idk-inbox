export const APP_LABEL = 'idk-inbox';
export const SNOOZED_LABEL = 'idk-inbox/Snoozed';

const BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

interface GmailLabel {
  id: string;
  name: string;
}

interface ListLabelsResponse {
  labels?: GmailLabel[];
}

export interface BootstrapResult {
  created: string[];
}

async function listLabels(token: string): Promise<GmailLabel[]> {
  const res = await fetch(`${BASE}/labels`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Gmail labels list failed: ${res.status}`);
  const json = (await res.json()) as ListLabelsResponse;
  return json.labels ?? [];
}

async function createLabel(token: string, name: string): Promise<void> {
  const res = await fetch(`${BASE}/labels`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(`Gmail label create failed: ${res.status}`);
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
