import { describe, it, expect, vi } from 'vitest';
import { createSelectionActions } from './selection';
import type { ReadonlyContext } from '../input/types';

const ctx: ReadonlyContext = {
  focusedPanelIndex: 1, focusedPanelKind: 'threadlist', focusedLabel: 'INBOX',
  selection: ['t1', 't2'], mode: 'selecting', signedIn: true,
};

describe('createSelectionActions', () => {
  it('enter-selection sets mode to selecting and optionally adds the initial target', async () => {
    const setMode = vi.fn();
    const setSelection = vi.fn();
    const actions = createSelectionActions({ setMode, setSelection });
    await actions.enterSelection({ initialTarget: 'tA' }, ctx);
    expect(setMode).toHaveBeenCalledWith('selecting');
    expect(setSelection).toHaveBeenCalledWith(['tA']);
  });

  it('enter-selection with no initialTarget leaves selection empty', async () => {
    const setMode = vi.fn();
    const setSelection = vi.fn();
    const actions = createSelectionActions({ setMode, setSelection });
    await actions.enterSelection({}, ctx);
    expect(setMode).toHaveBeenCalledWith('selecting');
    expect(setSelection).toHaveBeenCalledWith([]);
  });

  it('exit-selection resets mode and clears selection', async () => {
    const setMode = vi.fn();
    const setSelection = vi.fn();
    const actions = createSelectionActions({ setMode, setSelection });
    await actions.exitSelection({}, ctx);
    expect(setMode).toHaveBeenCalledWith('idle');
    expect(setSelection).toHaveBeenCalledWith([]);
  });

  it('toggle-selection removes a target that is already selected', async () => {
    const setSelection = vi.fn();
    const actions = createSelectionActions({ setMode: vi.fn(), setSelection });
    await actions.toggleSelection({ target: 't1' }, ctx);
    // ctx had ['t1', 't2'] — toggling t1 removes it
    expect(setSelection).toHaveBeenCalledWith(['t2']);
  });

  it('toggle-selection adds a target that is not selected', async () => {
    const setSelection = vi.fn();
    const actions = createSelectionActions({ setMode: vi.fn(), setSelection });
    await actions.toggleSelection({ target: 't3' }, ctx);
    expect(setSelection).toHaveBeenCalledWith(['t1', 't2', 't3']);
  });
});
