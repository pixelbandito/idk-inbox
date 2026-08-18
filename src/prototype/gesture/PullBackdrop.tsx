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
 * @param variant How the backdrop occupies its space. `fill` (default) covers the
 *   whole rig area, so it shows in whatever band the card doesn't cover. `peek`
 *   pins it to the bottom of a clipping window, so it stays hidden behind the
 *   card until the card's own displacement reveals it.
 */
export function PullBackdrop({
  state,
  progress,
  label,
  variant = 'fill',
  commit,
}: {
  state: PullState;
  progress: number;
  label?: string;
  variant?: 'fill' | 'peek';
  /**
   * 0–1 along the final commit travel, for rigs that have one. Drives a continuous
   * colour shift from armed toward activated, so the last stretch reads as motion
   * toward firing rather than as a second stop that looks identical to the first.
   * Omit it entirely when the rig has no such travel — the CSS keys off its
   * presence, so passing 0 is NOT the same as passing nothing.
   */
  commit?: number;
}) {
  return (
    <div
      className={variant === 'peek' ? 'pull__bg pull__bg--peek' : 'pull__bg'}
      data-state={state}
      style={commit === undefined ? undefined : ({ '--commit': Math.max(0, Math.min(1, commit)) } as React.CSSProperties)}
    >
      <div className="pull__label">{label ?? DEFAULT_LABEL[state]}</div>
      <div className="pull__meter">
        <div className="pull__meter-fill" style={{ width: `${Math.max(0, Math.min(1, progress)) * 100}%` }} />
      </div>
    </div>
  );
}
