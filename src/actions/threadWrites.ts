import type { ActionResult, ReadonlyContext, ThreadRef } from '../input/types';

export interface ModifyArgs { targets: ThreadRef[]; add: string[]; remove: string[]; }
export interface SingleTargetArgs { targets: ThreadRef[]; }
export interface LabelArgs        { targets: ThreadRef[]; label: string; }

function summarize(n: number, verb: string): string {
  return `${verb} ${n} thread${n === 1 ? '' : 's'}`;
}

export async function modifyThreadLabelsStub(args: ModifyArgs, _ctx: ReadonlyContext): Promise<ActionResult> {
  if (args.targets.length === 0) {
    return { ok: false, error: 'No targets specified.' };
  }
  console.info('[stub:modify-thread-labels]', args);
  return {
    ok: true,
    description: summarize(args.targets.length, 'Modified'),
    inverse: {
      action: 'modify-thread-labels',
      args: { targets: args.targets, add: args.remove, remove: args.add },
      description: summarize(args.targets.length, 'Reverted'),
    },
  };
}

async function delegate(action: string, args: ModifyArgs, _ctx: ReadonlyContext, verb: string): Promise<ActionResult> {
  if (args.targets.length === 0) return { ok: false, error: 'No targets specified.' };
  console.info(`[stub:${action}]`, args);
  return {
    ok: true,
    description: summarize(args.targets.length, verb),
    inverse: {
      action: 'modify-thread-labels',
      args: { targets: args.targets, add: args.remove, remove: args.add },
      description: summarize(args.targets.length, 'Restored'),
    },
  };
}

export const archiveThreadStub = (args: SingleTargetArgs, ctx: ReadonlyContext) =>
  delegate('archive-thread',
    { targets: args.targets, add: [], remove: ['INBOX'] }, ctx, 'Archived');

export const deleteThreadStub = (args: SingleTargetArgs, ctx: ReadonlyContext) =>
  delegate('delete-thread',
    { targets: args.targets, add: ['TRASH'], remove: ['INBOX'] }, ctx, 'Deleted');

export const spamThreadStub = (args: SingleTargetArgs, ctx: ReadonlyContext) =>
  delegate('spam-thread',
    { targets: args.targets, add: ['SPAM'], remove: ['INBOX'] }, ctx, 'Marked as spam');

export const addLabelThreadStub = (args: LabelArgs, ctx: ReadonlyContext) =>
  delegate('add-label-thread',
    { targets: args.targets, add: [args.label], remove: [] }, ctx, `Labelled with ${args.label}`);

export const removeLabelThreadStub = (args: LabelArgs, ctx: ReadonlyContext) =>
  delegate('remove-label-thread',
    { targets: args.targets, add: [], remove: [args.label] }, ctx, `Removed ${args.label}`);

export interface SnoozeArgs { targets: ThreadRef[]; until?: string; }

export const snoozeThreadStub = async (args: SnoozeArgs, _ctx: ReadonlyContext): Promise<ActionResult> => {
  if (args.targets.length === 0) return { ok: false, error: 'No targets specified.' };
  if (!args.until) return { ok: false, error: 'Snooze duration required.' };
  console.info('[stub:snooze-thread]', args);
  const subLabel = `idk-inbox/Snoozed/${args.until}`;
  return {
    ok: true,
    description: summarize(args.targets.length, 'Snoozed'),
    inverse: {
      action: 'modify-thread-labels',
      args: {
        targets: args.targets,
        add: ['INBOX'],
        remove: ['idk-inbox/Snoozed', subLabel],
      },
      description: summarize(args.targets.length, 'Unsnoozed'),
    },
  };
};

export const unsubscribeThreadStub = async (args: SingleTargetArgs, _ctx: ReadonlyContext): Promise<ActionResult> => {
  if (args.targets.length === 0) return { ok: false, error: 'No targets specified.' };
  console.info('[stub:unsubscribe-thread]', args);
  return {
    ok: true,
    description: summarize(args.targets.length, 'Unsubscribed from'),
    // No inverse — unsubscribe is not reversible.
  };
};
