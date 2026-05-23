import type { EmailSummary } from '../lib/gmail/types';

export function InboxList({ emails }: { emails: EmailSummary[] }) {
  if (emails.length === 0) {
    return <p className="inbox-empty">Inbox zero 🎉</p>;
  }
  return (
    <ul className="inbox-list">
      {emails.map((e) => (
        <li key={e.id} className={e.unread ? 'email email--unread' : 'email'}>
          <span className="email__from">{e.from}</span>
          <span className="email__subject">{e.subject}</span>
          <span className="email__snippet">{e.snippet}</span>
        </li>
      ))}
    </ul>
  );
}
