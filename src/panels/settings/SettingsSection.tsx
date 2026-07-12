import { useState, type ReactNode } from 'react';

export interface SettingsSectionProps {
  title: string;
  /** Whether the section starts open. */
  defaultOpen?: boolean;
  children: ReactNode;
}

/** A titled, collapsible block in the Settings panel. */
export function SettingsSection({ title, defaultOpen = false, children }: SettingsSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="settings-section">
      <button
        className="settings-section__header"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="settings-section__twist">{open ? '▾' : '▸'}</span>
        {title}
      </button>
      {open && <div className="settings-section__body">{children}</div>}
    </section>
  );
}
