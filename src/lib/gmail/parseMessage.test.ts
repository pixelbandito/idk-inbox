import { describe, it, expect } from 'vitest';
import { parseGmailMessage } from './parseMessage';

const rawMessage = {
  id: 'm1',
  threadId: 't1',
  snippet: 'Hello there, this is a preview',
  labelIds: ['INBOX', 'UNREAD'],
  payload: {
    headers: [
      { name: 'From', value: 'Alice <alice@example.com>' },
      { name: 'Subject', value: 'Lunch?' },
      { name: 'Date', value: 'Fri, 16 May 2026 14:00:00 -0700' },
    ],
  },
};

describe('parseGmailMessage', () => {
  it('extracts fields from headers', () => {
    const result = parseGmailMessage(rawMessage);
    expect(result).toEqual({
      id: 'm1',
      threadId: 't1',
      from: 'Alice <alice@example.com>',
      subject: 'Lunch?',
      snippet: 'Hello there, this is a preview',
      date: 'Fri, 16 May 2026 14:00:00 -0700',
      unread: true,
    });
  });

  it('marks read when UNREAD label is absent', () => {
    const read = { ...rawMessage, labelIds: ['INBOX'] };
    expect(parseGmailMessage(read).unread).toBe(false);
  });

  it('tolerates missing headers and labels', () => {
    const bare = { id: 'm2', threadId: 't2', snippet: '' };
    const result = parseGmailMessage(bare);
    expect(result.from).toBe('');
    expect(result.subject).toBe('');
    expect(result.unread).toBe(false);
  });
});
