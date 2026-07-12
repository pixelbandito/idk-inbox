import { describe, it, expect, beforeEach } from 'vitest';
import { isProcessorEnabled, setProcessorEnabled, resetProcessorSettings } from './settings';

describe('processor enablement', () => {
  beforeEach(() => resetProcessorSettings());

  it('defaults unknown and untouched processors to enabled', () => {
    expect(isProcessorEnabled('sender-fatigue')).toBe(true);
    expect(isProcessorEnabled('anything')).toBe(true);
  });

  it('persists an explicit off, and can be turned back on', () => {
    setProcessorEnabled('sender-fatigue', false);
    expect(isProcessorEnabled('sender-fatigue')).toBe(false);
    setProcessorEnabled('sender-fatigue', true);
    expect(isProcessorEnabled('sender-fatigue')).toBe(true);
  });

  it('tracks processors independently', () => {
    setProcessorEnabled('auto-archive', false);
    expect(isProcessorEnabled('auto-archive')).toBe(false);
    expect(isProcessorEnabled('sender-fatigue')).toBe(true);
  });
});
