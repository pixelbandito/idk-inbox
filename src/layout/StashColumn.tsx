export interface StashColumnProps {
  side: 'left' | 'right';
  count: number;
  onActivate: () => void;
}

export function StashColumn({ side, count, onActivate }: StashColumnProps) {
  if (count <= 0) return null;
  return (
    <button
      type="button"
      className="stash-column"
      data-side={side}
      onClick={onActivate}
      aria-label={`${count} panel${count === 1 ? '' : 's'} hidden`}
    >
      <span className="stash-column__count">{count}</span>
    </button>
  );
}
