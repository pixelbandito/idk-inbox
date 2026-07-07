import { describe, it, expect } from 'vitest';
import { findFatiguedSenders } from './senderFatigue';
import type { SenderStats } from './triageLog';

function stats(sender: string, seen: number, dismissedUnread: number): SenderStats {
  return { sender, seen, dismissedUnread };
}

describe('findFatiguedSenders', () => {
  it('flags a sender with enough volume and a high unread-dismiss rate', () => {
    const result = findFatiguedSenders([stats('deals@shop.example', 10, 9)]);
    expect(result).toEqual([
      { sender: 'deals@shop.example', seen: 10, dismissedUnread: 9 },
    ]);
  });

  it('ignores low-volume senders regardless of rate', () => {
    expect(findFatiguedSenders([stats('rare@x.example', 3, 3)])).toEqual([]);
  });

  it('ignores senders the user actually reads', () => {
    expect(findFatiguedSenders([stats('friend@x.example', 10, 2)])).toEqual([]);
  });

  it('orders the worst offender first', () => {
    const result = findFatiguedSenders([
      stats('mild@x.example', 5, 4),
      stats('worst@x.example', 20, 20),
    ]);
    expect(result.map((r) => r.sender)).toEqual(['worst@x.example', 'mild@x.example']);
  });

  it('honors custom thresholds', () => {
    const result = findFatiguedSenders(
      [stats('a@x.example', 3, 3)],
      { minSeen: 3, minDismissRate: 1 },
    );
    expect(result).toHaveLength(1);
  });
});
