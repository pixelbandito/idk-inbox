import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { useKeyboardProducer } from './fromKeyboard';
import { comboString } from './combo';
import type { AbstractEvent } from '../types';

function Harness({ onEvent }: { onEvent: (e: AbstractEvent) => void }) {
  useKeyboardProducer(onEvent);
  return null;
}

function fireKey(opts: Partial<KeyboardEventInit> & { key: string }) {
  document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...opts }));
}

describe('comboString', () => {
  it('lowercases plain keys', () => {
    expect(comboString(new KeyboardEvent('keydown', { key: 'J' }))).toBe('j');
  });
  it('prefixes mod for metaKey or ctrlKey', () => {
    expect(comboString(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))).toBe('mod+k');
    expect(comboString(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))).toBe('mod+k');
  });
  it('orders modifiers mod / shift / alt', () => {
    expect(comboString(new KeyboardEvent('keydown', {
      key: 'z', metaKey: true, shiftKey: true, altKey: true,
    }))).toBe('mod+shift+alt+z');
  });
  it('canonicalises arrows and space', () => {
    expect(comboString(new KeyboardEvent('keydown', { key: 'ArrowDown' }))).toBe('down');
    expect(comboString(new KeyboardEvent('keydown', { key: ' ' }))).toBe('space');
  });
});

describe('useKeyboardProducer', () => {
  it('emits a keypress AbstractEvent for each keydown', () => {
    const onEvent = vi.fn<(e: AbstractEvent) => void>();
    render(<Harness onEvent={onEvent} />);

    fireKey({ key: 'j' });
    expect(onEvent).toHaveBeenLastCalledWith({
      kind: 'keypress', surface: 'document', combo: 'j',
    });

    fireKey({ key: 'k', metaKey: true });
    expect(onEvent).toHaveBeenLastCalledWith({
      kind: 'keypress', surface: 'document', combo: 'mod+k',
    });

    fireKey({ key: 'z', metaKey: true, shiftKey: true });
    expect(onEvent).toHaveBeenLastCalledWith({
      kind: 'keypress', surface: 'document', combo: 'mod+shift+z',
    });

    fireKey({ key: 'Escape' });
    expect(onEvent).toHaveBeenLastCalledWith({
      kind: 'keypress', surface: 'document', combo: 'escape',
    });

    expect(onEvent).toHaveBeenCalledTimes(4);
  });

  it('detaches the listener on unmount', () => {
    const onEvent = vi.fn<(e: AbstractEvent) => void>();
    const { unmount } = render(<Harness onEvent={onEvent} />);
    fireKey({ key: 'j' });
    expect(onEvent).toHaveBeenCalledTimes(1);
    unmount();
    fireKey({ key: 'j' });
    expect(onEvent).toHaveBeenCalledTimes(1);   // no second fire
  });
});
