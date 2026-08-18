import { useMemo } from 'react';
import {
  allFingerprintStats, parseFingerprintKey, type FingerprintStats,
} from '../../lib/signals/behaviourLog';

// A read-only look at what the behaviour log has measured — the evidence a
// heuristic would stand on, shown before any heuristic fires. Fixed 30-day
// window and a top-N cap keep it scannable.
const WINDOW_DAYS = 30;
const TOP_N = 12;
// A fatigue candidate: enough volume, and mostly archived without a look.
const FATIGUE_MIN_SEEN = 5;
const FATIGUE_RATE = 0.8;

interface TrendRow extends FingerprintStats {
  kind: 'sender' | 'list';
  label: string;
  openRate: number | null;
  archivedUnopenedRate: number | null;
  fatigued: boolean;
}

function rate(part: number, whole: number): number | null {
  return whole > 0 ? Math.min(1, part / whole) : null;
}

function toRow(stats: FingerprintStats): TrendRow {
  const { kind, value } = parseFingerprintKey(stats.key);
  const archivedUnopenedRate = rate(stats.archivedWithoutOpen, stats.seen);
  return {
    ...stats,
    kind,
    label: value,
    openRate: rate(stats.opened, stats.seen),
    archivedUnopenedRate,
    fatigued: stats.seen >= FATIGUE_MIN_SEEN && (archivedUnopenedRate ?? 0) >= FATIGUE_RATE,
  };
}

function pct(value: number | null): string {
  return value === null ? '—' : `${Math.round(value * 100)}%`;
}

/** Top fingerprints by volume, each with its open and archived-unopened rates. */
export function NoticedTrends() {
  const rows = useMemo(
    () =>
      allFingerprintStats(WINDOW_DAYS)
        .filter((s) => s.seen > 0)
        .map(toRow)
        .sort((a, b) => b.seen - a.seen)
        .slice(0, TOP_N),
    [],
  );

  if (rows.length === 0) {
    return (
      <p className="trends__empty">
        Nothing measured yet. As you read, archive, and snooze, patterns per sender
        and mailing list show up here — the evidence future suggestions build on.
      </p>
    );
  }

  return (
    <>
      <p className="trends__intro">What each sender and list did over the last {WINDOW_DAYS} days.</p>
      <ul className="trends">
        {rows.map((row) => (
          <li key={row.key} className="trends__row" data-fatigued={row.fatigued ? 'true' : undefined}>
            <div className="trends__id">
              <span className="trends__kind" data-kind={row.kind}>{row.kind}</span>
              <span className="trends__label">{row.label}</span>
            </div>
            <div className="trends__metrics">
              <span className="trends__metric">{row.seen} seen</span>
              <span className="trends__metric">{pct(row.openRate)} opened</span>
              <span className="trends__metric">{pct(row.archivedUnopenedRate)} archived unopened</span>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
