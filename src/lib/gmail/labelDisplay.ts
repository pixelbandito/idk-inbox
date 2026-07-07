import { APP_LABEL } from './labelBootstrap';

/** What the user sees for a label: "Inbox", not INBOX; "Todo", not idk-inbox/Todo. */
export function displayNameOf(label: string): string {
  if (label === 'INBOX') return 'Inbox';
  return label.replace(new RegExp(`^${APP_LABEL}/`), '');
}
