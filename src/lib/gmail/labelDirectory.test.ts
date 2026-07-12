import { describe, it, expect } from 'vitest';
import { pillsFor } from './labelDirectory';

const dir = new Map<string, string>([
  ['INBOX', 'INBOX'],
  ['UNREAD', 'UNREAD'],
  ['IMPORTANT', 'IMPORTANT'],
  ['L_todo', 'idk-inbox/Todo'],
  ['L_trips', 'idk-inbox/Trips'],
  ['L_snoozed', 'idk-inbox/Snoozed'],
  ['L_bucket', 'idk-inbox/Snoozed/2026-07-20-0900'],
]);

describe('pillsFor', () => {
  it('shows user-label pills and skips system labels', () => {
    const pills = pillsFor(['INBOX', 'UNREAD', 'IMPORTANT', 'L_todo'], dir);
    expect(pills.map((p) => p.text)).toEqual(['Todo']);
  });

  it('adds a Snoozed pill when the snooze label (or a bucket) is present', () => {
    const pills = pillsFor(['L_todo', 'L_bucket'], dir);
    expect(pills.map((p) => p.text)).toEqual(['Snoozed', 'Todo']);
    expect(pills[0].snoozed).toBe(true);
  });

  it('omits the current list\'s own tag but keeps other tags', () => {
    const pills = pillsFor(['L_todo', 'L_trips'], dir, 'idk-inbox/Todo');
    expect(pills.map((p) => p.text)).toEqual(['Trips']);
  });

  it('gives each label a stable hue', () => {
    const a = pillsFor(['L_todo'], dir)[0];
    const b = pillsFor(['L_todo'], dir)[0];
    expect(a.hue).toBe(b.hue);
    expect(a.hue).toBeGreaterThanOrEqual(0);
    expect(a.hue).toBeLessThan(360);
  });
});
