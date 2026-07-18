// Where the app's data and logic actually live, for the user to browse. It's
// their account, so nothing here is hidden. Today idk-inbox is client-only —
// it stores state as labels in your own Gmail and on your device, and runs no
// external servers, Apps Scripts, or Sheets. This registry is the single place
// that answers "what powers this app?", and Apps Script / Sheet entries slot in
// here the moment we add any.

import { APP_LABEL } from '../gmail/labelBootstrap';

export type SourceKind = 'gmail-label' | 'apps-script' | 'sheet';

export interface ExternalSource {
  kind: SourceKind;
  name: string;
  /** Plain-language: what it holds or does, and why it's here. */
  description: string;
  /** A link the user can open to inspect it in Google. */
  url: string;
}

/** Deep link to a Gmail label view; nested labels join segments with %2F. */
export function gmailLabelUrl(label: string): string {
  const path = label.split('/').map(encodeURIComponent).join('%2F');
  return `https://mail.google.com/mail/u/0/#label/${path}`;
}

/** Let the user see and revoke exactly what idk-inbox can touch. */
export const APP_PERMISSIONS_URL = 'https://myaccount.google.com/permissions';

/** The external sources that currently power the app (browsable links). */
export function externalSources(): ExternalSource[] {
  return [
    {
      kind: 'gmail-label',
      name: 'Your idk-inbox labels',
      description:
        'Your tags and snoozed mail are kept as ordinary labels inside your own ' +
        'Gmail — not on any server we run. Open Gmail to see and edit them directly.',
      url: gmailLabelUrl(APP_LABEL),
    },
  ];
}

/** True while the app runs entirely client-side (no server-side scripts/sheets). */
export function hasNoServerSources(): boolean {
  return !externalSources().some((s) => s.kind === 'apps-script' || s.kind === 'sheet');
}
