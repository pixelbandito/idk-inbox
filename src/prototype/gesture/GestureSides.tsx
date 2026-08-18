import { useState } from 'react';
import { ScrollActionSurface } from './ScrollActionSurface';
import type { ScrollAction } from './edgeActions';

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

// Enough prose that reaching the bottom edge takes a real scroll rather than
// happening on load. The vertical staircase is only honest if you have to travel to
// it: arriving at the trailing stop mid-flick, with momentum still running, is the
// case the whole design exists to handle, and a card short enough to be at its own
// end from the start never exercises it.
const BODY = [
  'Scroll to the top or the bottom of this card and keep going — the same stop-then-travel staircase, on both vertical edges.',
  'A stop here is not a rule being enforced. It is simply the end of the scrollable area: there is nowhere further to go, so momentum dies against the boundary exactly as the platform intends, and nothing has to refuse your input to make that happen.',
  'Come to rest at that boundary and the room for the next step is appended below it — invisibly, moving nothing. That is what lets the next scroll be travel from its very first pixel, instead of being spent asking for somewhere to go.',
  'The room is only ever prepared once input has gone quiet, and that is the whole safety property. A pad that appeared while a gesture was still running would be a pad that gesture could spend for you, which is how a hard flick used to walk straight through an offer without it ever being readable.',
  'Note that the clock listens to input rather than to scrolling. Pinned against a boundary the position stops changing and scroll events stop with it, while the platform carries on delivering momentum — so a scroll-keyed clock expires in the middle of a fling that is very much alive.',
];

const BODY_TAIL = [
  'Each row above is its own scroller on the x axis. Vertical scrolling passes straight through to the card, because a scroller only claims the axis it can actually move on.',
  'The same code drives all four edges. An axis picks scrollTop or scrollLeft, an edge picks which end the pad attaches to, and everything after that is shared — including the part where arriving at the far end of the commit pad IS the action, rather than an event anyone had to interpret.',
  'Because the commit is a position rather than an event, it cannot stall. There is nothing to refuse and nothing to debounce: either you have run the distance or you have not, and you can see which at every point along the way.',
  'What it costs is a little scroll range. A pad that has been prepared but not travelled stays until the side withdraws itself, since reclaiming it early means moving the scroll position under a live gesture — which cancels the browser’s own animation and truncates the very travel it was meant to tidy up.',
  'Keep going for the archive panel.',
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
          {BODY.map((text, i) => (
            <p key={`b${i}`}>{text}</p>
          ))}

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

          {BODY_TAIL.map((text, i) => (
            <p key={`t${i}`}>{text}</p>
          ))}
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
