import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  modifyThreadLabelsStub, archiveThreadStub, deleteThreadStub, spamThreadStub,
  addLabelThreadStub, removeLabelThreadStub,
} from './threadWrites';
import type { ReadonlyContext } from '../input/types';

const ctx: ReadonlyContext = {
  focusedPanelIndex: 1, focusedPanelKind: 'threadlist', focusedLabel: 'INBOX',
  selection: [], mode: 'idle', signedIn: true,
};

describe('modifyThreadLabelsStub', () => {
  beforeEach(() => vi.spyOn(console, 'info').mockImplementation(() => {}));

  it('logs and returns ok with a symmetric inverse', async () => {
    const result = await modifyThreadLabelsStub(
      { targets: ['t1'], add: ['L1'], remove: ['INBOX'] }, ctx,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.inverse).toEqual({
        action: 'modify-thread-labels',
        args: { targets: ['t1'], add: ['INBOX'], remove: ['L1'] },
        description: expect.any(String),
      });
    }
    expect(console.info).toHaveBeenCalledWith('[stub:modify-thread-labels]', expect.any(Object));
  });

  it('returns ok:false when targets is empty', async () => {
    const result = await modifyThreadLabelsStub({ targets: [], add: ['L1'], remove: [] }, ctx);
    expect(result.ok).toBe(false);
  });
});

describe('archiveThreadStub', () => {
  beforeEach(() => vi.spyOn(console, 'info').mockImplementation(() => {}));

  it("delegates to modify with remove:['INBOX']", async () => {
    const result = await archiveThreadStub({ targets: ['t1', 't2'] }, ctx);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.inverse?.action).toBe('modify-thread-labels');
      expect(result.inverse?.args).toEqual({
        targets: ['t1', 't2'], add: ['INBOX'], remove: [],
      });
    }
  });
});

describe('deleteThreadStub', () => {
  beforeEach(() => vi.spyOn(console, 'info').mockImplementation(() => {}));

  it("delegates to modify with add:['TRASH'], remove:['INBOX']", async () => {
    const result = await deleteThreadStub({ targets: ['t1'] }, ctx);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.inverse?.args).toEqual({
        targets: ['t1'], add: ['INBOX'], remove: ['TRASH'],
      });
    }
  });
});

describe('spamThreadStub', () => {
  beforeEach(() => vi.spyOn(console, 'info').mockImplementation(() => {}));

  it("delegates to modify with add:['SPAM'], remove:['INBOX']", async () => {
    const result = await spamThreadStub({ targets: ['t1'] }, ctx);
    if (result.ok) {
      expect(result.inverse?.args).toEqual({
        targets: ['t1'], add: ['INBOX'], remove: ['SPAM'],
      });
    }
  });
});

describe('addLabelThreadStub', () => {
  beforeEach(() => vi.spyOn(console, 'info').mockImplementation(() => {}));

  it('inverse removes the same label', async () => {
    const result = await addLabelThreadStub({ targets: ['t1'], label: 'idk-inbox/Receipts' }, ctx);
    if (result.ok) {
      expect(result.inverse?.args).toEqual({
        targets: ['t1'], add: [], remove: ['idk-inbox/Receipts'],
      });
    }
  });
});

describe('removeLabelThreadStub', () => {
  beforeEach(() => vi.spyOn(console, 'info').mockImplementation(() => {}));

  it('inverse adds the same label', async () => {
    const result = await removeLabelThreadStub({ targets: ['t1'], label: 'idk-inbox/Receipts' }, ctx);
    if (result.ok) {
      expect(result.inverse?.args).toEqual({
        targets: ['t1'], add: ['idk-inbox/Receipts'], remove: [],
      });
    }
  });
});
