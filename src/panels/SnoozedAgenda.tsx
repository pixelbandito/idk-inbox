import { useState, type ReactNode } from 'react';
import { dayHeading, type AgendaDay } from '../lib/snooze/agenda';
import type { EmailSummary } from '../lib/gmail/types';

export interface SnoozedAgendaProps {
  days: AgendaDay[];
  now: Date;
  renderEmail: (email: EmailSummary) => ReactNode;
  /** How many threads a day shows before collapsing the rest behind "+N more". */
  perDayCap?: number;
}

const DEFAULT_CAP = 4;

/**
 * Snoozed threads grouped by wake day. Each day shows a handful of threads then
 * a "+N more" that expands that day in place — dense enough to scan a week on a
 * narrow screen without one busy day burying the rest.
 */
export function SnoozedAgenda({ days, now, renderEmail, perDayCap = DEFAULT_CAP }: SnoozedAgendaProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const expand = (key: string) => setExpanded((prev) => new Set(prev).add(key));

  return (
    <div className="agenda">
      {days.map((day) => {
        const isOpen = expanded.has(day.key);
        const visible = isOpen ? day.emails : day.emails.slice(0, perDayCap);
        const hiddenCount = day.emails.length - visible.length;
        return (
          <section key={day.key} className="agenda__day">
            <h3 className="agenda__heading">{dayHeading(day.dayStart, now)}</h3>
            <ul className="inbox-list">{visible.map(renderEmail)}</ul>
            {hiddenCount > 0 && (
              <button className="agenda__more" onClick={() => expand(day.key)}>
                +{hiddenCount} more
              </button>
            )}
          </section>
        );
      })}
    </div>
  );
}
