import type { PullState } from './pullShared';

// The background revealed behind the panel as it's pulled. Colour and copy are
// driven purely by the pull state, so all the "am I far/hard enough?" feedback
// lives in one place and looks identical across both gesture rigs.

const DEFAULT_LABEL: Record<PullState, string> = {
  idle: 'Pull to archive',
  pulling: 'Keep pulling…',
  armed: 'Release to archive',
  activated: 'Archived ✓',
  reverting: 'Cancelled',
};

/**
 * @param progress 0–1 fill for the meter — distance toward the threshold while
 *   pulling, or hold-time toward firing while armed. Lets you watch exactly how
 *   close the gesture is to committing.
 */
export function PullBackdrop({
  state,
  progress,
  label,
}: {
  state: PullState;
  progress: number;
  label?: string;
}) {
  return (
    <div className="pull__bg" data-state={state}>
      <div className="pull__label">{label ?? DEFAULT_LABEL[state]}</div>
      <div className="pull__meter">
        <div className="pull__meter-fill" style={{ width: `${Math.max(0, Math.min(1, progress)) * 100}%` }} />
      </div>
    </div>
  );
}
