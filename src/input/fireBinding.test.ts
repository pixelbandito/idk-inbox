import { describe, it, expect, vi } from 'vitest';
import { fireBinding } from './fireBinding';
import type { Binding, ReadonlyContext } from './types';

function makeCtx(over: Partial<ReadonlyContext> = {}): ReadonlyContext {
  return { focusedPanelIndex: 1, focusedPanelKind: 'threadlist', focusedLabel: 'INBOX',
           selection: [], mode: 'idle', signedIn: true, ...over };
}

describe('fireBinding', () => {
  it('dispatches a row-scope click with the row target', async () => {
    const dispatch = vi.fn().mockResolvedValue({ ok: true, description: 'opened' });
    const li = document.createElement('li');
    li.setAttribute('data-thread-id', 'tA');

    const binding: Binding = {
      scope: 'row', modality: 'touch', trigger: { kind: 'click' }, action: 'open-panel',
    };

    await fireBinding(binding, { target: li }, makeCtx(), dispatch);

    expect(dispatch).toHaveBeenCalledWith({
      action: 'open-panel',
      args: expect.objectContaining({ kind: 'thread', threadId: 'tA' }),
      context: expect.any(Object),
    });
  });

  it('prefers selection when non-empty for thread-write actions', async () => {
    const dispatch = vi.fn().mockResolvedValue({ ok: true, description: 'archived' });
    const li = document.createElement('li');
    li.setAttribute('data-thread-id', 'tA');

    const binding: Binding = {
      scope: 'row', modality: 'touch', trigger: { kind: 'click' }, action: 'archive-thread',
    };

    await fireBinding(binding, { target: li }, makeCtx({ selection: ['t1', 't2'] }), dispatch);

    expect(dispatch).toHaveBeenCalledWith({
      action: 'archive-thread',
      args: { targets: ['t1', 't2'] },
      context: expect.any(Object),
    });
  });

  it('skips dispatch when when-predicate fails', async () => {
    const dispatch = vi.fn();
    const binding: Binding = {
      scope: 'document', modality: 'keyboard', trigger: { kind: 'key', combo: 'j' },
      action: 'archive-thread', when: 'mode-idle',
    };
    await fireBinding(binding, { target: document.body }, makeCtx({ mode: 'cmd-k' }), dispatch);
    expect(dispatch).not.toHaveBeenCalled();
  });
});
