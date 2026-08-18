// Resolves the opaque Gmail label IDs on a message into human pills. Gmail
// returns user-label IDs (e.g. "Label_45"), so we need the full label list to
// name them. The directory is fetched once and cached module-wide; reset on
// sign-out. `pillsFor` is pure and turns a message's label IDs into the chips a
// thread tile should show.

import { gmailJson } from './http';
import { APP_LABEL, SNOOZED_LABEL } from './labelBootstrap';
import { displayNameOf } from './labelDisplay';
import type { GmailLabel } from './types';

const SYSTEM_LABELS = new Set([
  'INBOX', 'UNREAD', 'STARRED', 'IMPORTANT', 'SENT', 'DRAFT', 'SPAM', 'TRASH', 'CHAT',
]);

export interface LabelPill {
  key: string;
  text: string;
  /** 0..359 hue for a stable per-label colour; undefined = the snoozed pill. */
  hue?: number;
  snoozed?: boolean;
}

let cache: Promise<Map<string, string>> | null = null;

/** id → label name, fetched once. */
export function loadLabelDirectory(token: string): Promise<Map<string, string>> {
  cache ??= gmailJson<{ labels?: GmailLabel[] }>(token, '/labels', 'labels list')
    .then((json) => new Map((json.labels ?? []).map((l) => [l.id, l.name])))
    .catch((e) => { cache = null; throw e; });
  return cache;
}

export function resetLabelDirectory(): void {
  cache = null;
}

function hueOf(text: string): number {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 360;
}

/**
 * Pills for a thread tile: its user labels plus a snoozed marker. `currentLabel`
 * (the list you're viewing) is omitted — you don't need the tag you're already
 * inside, but you still see the thread's other tags.
 */
export function pillsFor(
  labelIds: string[],
  directory: Map<string, string>,
  currentLabel?: string,
): LabelPill[] {
  const names = labelIds.map((id) => directory.get(id) ?? id);
  const pills: LabelPill[] = [];
  let snoozed = false;

  for (const name of names) {
    if (name === SNOOZED_LABEL || name.startsWith(`${SNOOZED_LABEL}/`)) { snoozed = true; continue; }
    if (SYSTEM_LABELS.has(name) || name === APP_LABEL) continue;
    if (name === currentLabel) continue; // the list's own tag
    pills.push({ key: name, text: displayNameOf(name), hue: hueOf(name) });
  }
  if (snoozed && currentLabel !== SNOOZED_LABEL) {
    pills.unshift({ key: '__snoozed', text: 'Snoozed', snoozed: true });
  }
  return pills;
}
