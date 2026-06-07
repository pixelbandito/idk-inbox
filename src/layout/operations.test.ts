import { describe, it, expect } from 'vitest';
import { openThread, closeAt } from './operations';
import type { Panel } from './types';

const settings: Panel = { kind: 'settings' };
const inbox: Panel = { kind: 'threadlist', label: 'INBOX' };
const snoozed: Panel = { kind: 'threadlist', label: 'idk-inbox/Snoozed' };
const thread = (id: string, src: string): Panel => ({ kind: 'thread', threadId: id, sourceLabel: src });

describe('openThread', () => {
  it('inserts a new thread panel immediately after the source threadlist', () => {
    const before: Panel[] = [settings, inbox, snoozed];
    const after = openThread(before, 'INBOX', 'tA');
    expect(after).toEqual([settings, inbox, thread('tA', 'INBOX'), snoozed]);
  });

  it('places a newer thread between the threadlist and existing same-source threads', () => {
    const before: Panel[] = [settings, inbox, thread('tA', 'INBOX'), snoozed];
    const after = openThread(before, 'INBOX', 'tB');
    expect(after).toEqual([
      settings, inbox, thread('tB', 'INBOX'), thread('tA', 'INBOX'), snoozed,
    ]);
  });

  it('throws when the source threadlist is not present', () => {
    const before: Panel[] = [settings, inbox];
    expect(() => openThread(before, 'NoSuch', 't1')).toThrow();
  });
});

describe('closeAt', () => {
  it('removes the panel at the given index', () => {
    const before: Panel[] = [settings, inbox, thread('tA', 'INBOX'), snoozed];
    const after = closeAt(before, 2);
    expect(after).toEqual([settings, inbox, snoozed]);
  });

  it('is a no-op when the index is out of range', () => {
    const before: Panel[] = [settings, inbox];
    expect(closeAt(before, 5)).toEqual(before);
    expect(closeAt(before, -1)).toEqual(before);
  });
});
