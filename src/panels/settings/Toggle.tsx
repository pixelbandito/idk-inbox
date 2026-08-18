export interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Accessible name, since the visual switch carries no text of its own. */
  label: string;
}

/** An on/off switch. Uses role="switch" so it reads correctly to assistive tech. */
export function Toggle({ checked, onChange, label }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="toggle"
      data-on={checked ? 'true' : undefined}
      onClick={() => onChange(!checked)}
    >
      <span className="toggle__knob" />
    </button>
  );
}
