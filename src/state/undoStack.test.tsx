import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { DispatchProvider } from './DispatchProvider';
import { useUndoState } from './useDispatch';
import type { UndoEntry } from '../input/types';

const sampleEntry: UndoEntry = {
  original: { action: 'archive-thread', args: { targets: ['t1'] }, description: 'Archived 1 thread' },
  inverse:  { action: 'modify-thread-labels', args: { targets: ['t1'], add: ['INBOX'], remove: [] }, description: 'Restored 1 thread' },
};

describe('undo stack', () => {
  it('starts empty', () => {
    const { result } = renderHook(() => useUndoState(), {
      wrapper: ({ children }) => <DispatchProvider>{children}</DispatchProvider>,
    });
    expect(result.current.undoStack).toEqual([]);
    expect(result.current.redoStack).toEqual([]);
  });

  it('pushUndo grows the undo stack and clears redo', () => {
    const { result } = renderHook(() => useUndoState(), {
      wrapper: ({ children }) => <DispatchProvider>{children}</DispatchProvider>,
    });
    act(() => { result.current.pushUndo(sampleEntry); });
    expect(result.current.undoStack).toEqual([sampleEntry]);
    expect(result.current.redoStack).toEqual([]);
  });

  it('popUndo returns the top entry and moves it to redo stack on caller request', () => {
    const { result } = renderHook(() => useUndoState(), {
      wrapper: ({ children }) => <DispatchProvider>{children}</DispatchProvider>,
    });
    act(() => { result.current.pushUndo(sampleEntry); });
    let popped: UndoEntry | undefined;
    act(() => { popped = result.current.popUndo(); });
    expect(popped).toEqual(sampleEntry);
    expect(result.current.undoStack).toEqual([]);
    // popUndo itself does NOT push to redo — Task 12 wraps dispatch to do that.
  });

  it('pushUndo clears the redo stack', () => {
    const { result } = renderHook(() => useUndoState(), {
      wrapper: ({ children }) => <DispatchProvider>{children}</DispatchProvider>,
    });
    act(() => { result.current.pushRedo(sampleEntry); });
    act(() => { result.current.pushUndo(sampleEntry); });
    expect(result.current.redoStack).toEqual([]);
  });

  it('clearStacks empties both', () => {
    const { result } = renderHook(() => useUndoState(), {
      wrapper: ({ children }) => <DispatchProvider>{children}</DispatchProvider>,
    });
    act(() => {
      result.current.pushUndo(sampleEntry);
      result.current.pushRedo(sampleEntry);
    });
    act(() => { result.current.clearStacks(); });
    expect(result.current.undoStack).toEqual([]);
    expect(result.current.redoStack).toEqual([]);
  });
});
