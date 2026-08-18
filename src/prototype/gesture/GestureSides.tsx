import { useState } from 'react';
import { ScrollActionSurface } from './ScrollActionSurface';
import type { ScrollAction } from './scrollActions';

// Rig 4 — the same scroll-to-act mechanic, generalised onto any edge.
//
// Two things are being tried here that the single-card rig could not answer:
//
//   1. Does it hold on the OTHER axis? A horizontal strip has no rubber-band to
//      lean on and much less travel to play with, so it is the harder case.
//   2. Does more than one action per side work? First travel reveals every action
//      on that side; a second travel fires the EDGEMOST one. The rest are there to
//      be tapped, which keeps the full-travel gesture unambiguous — it always means
//      the same thing, whatever else is on offer.
//
// The horizontal rows are deliberately nested INSIDE a vertical surface, because
// that is the real arrangement on a thread list: the list scrolls vertically and
// each row acts horizontally. The two never fight, since a scroller only claims the
// axis it can actually move on.

const ARCHIVE: ScrollAction = { id: 'archive', label: 'Archive', tone: 'archive' };
const SNOOZE: ScrollAction = { id: 'snooze', label: 'Snooze', tone: 'snooze' };
const DELETE: ScrollAction = { id: 'delete', label: 'Delete', tone: 'delete' };

interface Row {
  id: string;
  from: string;
  subject: string;
  preview: string;
}

const ROWS: Row[] = [
  {
    id: 'r1',
    from: 'Weekly digest',
    subject: 'Six things worth your attention',
    preview: 'Scroll this row sideways — left to archive, right for snooze and delete.',
  },
  {
    id: 'r2',
    from: 'Deploys',
    subject: 'main → production succeeded',
    preview: 'Same mechanic, second row. The list itself still scrolls vertically.',
  },
];

export function GestureSides() {
  const [log, setLog] = useState<string[]>([]);
  const record = (where: string) => (a: ScrollAction) =>
    setLog((l) => [`${a.label} · ${where}`, ...l].slice(0, 6));

  return (
    <div className="proto">
      <header className="proto__bar">
        <a className="proto__back" href="#/">‹ hub</a>
        <span className="proto__status">All sides · {log[0] ?? 'nothing fired yet'}</span>
        <span />
      </header>

      <div className="sides">
        {/* The outer card acts on the vertical axis: pull up from the top to mark
            unread, down past the end to archive. One action per side, so the reveal
            and the commit are the whole staircase. */}
        <ScrollActionSurface
          axis="y"
          className="sides__card"
          settleMs={30}
          holdMs={3000}
          returnMs={800}
          start={{
            actions: [{ id: 'unread', label: 'Mark unread', tone: 'snooze' }],
            revealPx: 96,
            commitPx: 60,
            onCommit: record('top'),
          }}
          end={{
            actions: [ARCHIVE],
            revealPx: 96,
            commitPx: 60,
            onCommit: record('bottom'),
          }}
        >
          <h2>Thread list</h2>
          <p>
            Scroll to the top or the bottom of this card and keep going — the same stop-then-travel
            staircase, on both vertical edges.
          </p>

          {ROWS.map((row) => (
            <div className="sides__row-wrap" key={row.id}>
              {/* Edge to edge inside the card: the strips reach the card's own
                  margins, so a full-travel gesture ends where the card ends. */}
              <ScrollActionSurface
                axis="x"
                className="sides__row"
                settleMs={30}
                holdMs={3000}
                returnMs={600}
                start={{
                  actions: [ARCHIVE],
                  revealPx: 96,
                  commitPx: 56,
                  onCommit: record(`${row.id} left`),
                }}
                end={{
                  // Content-ward → edge-ward. Snooze sits hard against the right
                  // edge, so it is both the first thing uncovered and the thing a
                  // completed travel fires.
                  actions: [DELETE, SNOOZE],
                  revealPx: 192,
                  commitPx: 56,
                  onCommit: record(`${row.id} right`),
                }}
              >
                <div className="sides__msg">
                  <span className="sides__from">{row.from}</span>
                  <span className="sides__subject">{row.subject}</span>
                  <span className="sides__preview">{row.preview}</span>
                </div>
              </ScrollActionSurface>
            </div>
          ))}

          <p>
            Each row is its own scroller on the x axis. Vertical scrolling passes straight through to
            the card, because a scroller only claims the axis it can move on.
          </p>
          <p className="sides__hint">↓ end of list · scroll again for the archive panel</p>
        </ScrollActionSurface>

        <ul className="sides__log">
          {log.length === 0 && <li className="sides__log-empty">Fired actions appear here.</li>}
          {log.map((entry, i) => (
            <li key={`${entry}-${i}`}>{entry}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
