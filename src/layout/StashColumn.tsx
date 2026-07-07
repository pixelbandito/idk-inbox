export interface StashColumnProps {
  side: 'left' | 'right';
  count: number;
  onActivate: () => void;
}

export function StashColumn({ side, count, onActivate }: StashColumnProps) {
  if (count <= 0) return null;
  // The chevron points the way tapping navigates; the count says how many
  // panels are stacked off-screen that direction.
  const chevron = side === 'left' ? '‹' : '›';
  return (
    <button
      type="button"
      className="stash-column"
      data-side={side}
      onClick={onActivate}
      aria-label={`${count} panel${count === 1 ? '' : 's'} hidden to the ${side} — tap to go ${side === 'left' ? 'back' : 'forward'}`}
      title={`${count} more this way`}
    >
      <span className="stash-column__chevron" aria-hidden="true">{chevron}</span>
      <span className="stash-column__count">{count}</span>
    </button>
  );
}
