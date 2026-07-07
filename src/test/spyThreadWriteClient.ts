import { vi } from 'vitest';
import type { ThreadWriteClient } from '../lib/gmail/threadWriteClient';

/**
 * Always-succeeding ThreadWriteClient spy for component tests — inject via
 * DispatchProvider's `threadWriteClient` prop and assert on `modifyThreadLabels`.
 */
export function spyThreadWriteClient() {
  const modifyThreadLabels = vi.fn(
    async (_token: string, threadIds: string[]) => ({
      succeeded: threadIds,
      failed: [] as string[],
    }),
  );
  const client: ThreadWriteClient = { modifyThreadLabels };
  return { client, modifyThreadLabels };
}
