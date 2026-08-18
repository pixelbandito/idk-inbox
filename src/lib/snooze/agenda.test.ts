import { describe, it, expect } from 'vitest';
import { groupByWakeDay, dayHeading, wakeTimeFromLabels } from './agenda';
import { snoozeBucketLabel } from './bucket';
import type { EmailSummary } from '../gmail/types';

// A directory mapping opaque label ids to names, as Gmail returns them.
// Local-constructed so the wake's local calendar day is timezone-independent.
const dir = new Map<string, string>([
  ['Label_1', snoozeBucketLabel(new Date(2026, 6, 13, 9, 0))],
  ['Label_2', snoozeBucketLabel(new Date(2026, 6, 13, 17, 0))],
  ['Label_3', snoozeBucketLabel(new Date(2026, 6, 20, 9, 0))],
]);

function email(id: string, labels: string[]): EmailSummary {
  return { id, threadId: `t${id}`, from: 'a@b.c', subject: id, snippet: '', date: '', unread: false, labels };
}

describe('wakeTimeFromLabels', () => {
  it('resolves a bucket id through the directory', () => {
    const wake = wakeTimeFromLabels(['INBOX', 'Label_1'], dir);
    expect(wake).toEqual(new Date(2026, 6, 13, 9, 0));
  });

  it('returns null when no label is a bucket', () => {
    expect(wakeTimeFromLabels(['INBOX', 'UNREAD'], dir)).toBeNull();
  });
});

describe('groupByWakeDay', () => {
  it('groups threads waking the same local day and sorts ascending', () => {
    const days = groupByWakeDay(
      [email('c', ['Label_3']), email('a', ['Label_1']), email('b', ['Label_2'])],
      dir,
    );
    expect(days).toHaveLength(2);
    expect(days[0].emails.map((e) => e.id)).toEqual(['a', 'b']); // both on the 13th
    expect(days[1].emails.map((e) => e.id)).toEqual(['c']);      // the 20th, later
  });

  it('places undated threads in a trailing group', () => {
    const days = groupByWakeDay([email('x', ['INBOX']), email('a', ['Label_1'])], dir);
    expect(days[0].dayStart).not.toBeNull();
    expect(days[1].dayStart).toBeNull();
    expect(days[1].emails.map((e) => e.id)).toEqual(['x']);
  });
});

describe('dayHeading', () => {
  const now = new Date(2026, 6, 12, 12, 0); // Sun Jul 12, noon local

  it('labels near days relatively and far days by date', () => {
    expect(dayHeading(new Date(2026, 6, 12), now)).toMatch(/^Today · /);
    expect(dayHeading(new Date(2026, 6, 13), now)).toMatch(/^Tomorrow · /);
    expect(dayHeading(new Date(2026, 6, 20), now)).not.toMatch(/Today|Tomorrow/);
    expect(dayHeading(null, now)).toBe('No wake date');
  });
});
