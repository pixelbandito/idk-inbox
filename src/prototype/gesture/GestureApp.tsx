import { useState } from 'react';
import { ScrollActionSurface } from './ScrollActionSurface';
import type { ScrollAction } from './edgeActions';

// Rig 5 — the whole arrangement at once, as close to the real app as it gets
// without touching the real app.
//
// Three panels side by side, because that is what the inbox is: a thread LIST whose
// tiles act horizontally, a thread DETAIL that acts vertically on its own edges, and
// a labels column that acts on neither. What this rig exists to find is the things
// only the combination can show —
//
//   1. A horizontal tile inside a vertically-scrolling list inside a horizontally
//      scrolling panel strip. That is two nested surfaces sharing the X axis, which
//      no earlier rig had, and it is the arrangement the real layout will have.
//   2. Whether a panel that acts on its own vertical edges can coexist with a list
//      whose children act on the horizontal one, side by side and both live.
//   3. Whether any of it survives touch, where a swipe has to be routed by direction
//      through three levels of scroller rather than two.
//
// The panel strip itself is a plain scroller here — the attention-cursor navigation
// is a separate mechanic and lands separately. What matters for now is that it is
// horizontal, so the same-axis conflict is real rather than hypothetical.

const ARCHIVE: ScrollAction = { id: 'archive', label: 'Archive', tone: 'archive' };
const SNOOZE: ScrollAction = { id: 'snooze', label: 'Snooze', tone: 'snooze' };
const DELETE: ScrollAction = { id: 'delete', label: 'Delete', tone: 'delete' };
const UNREAD: ScrollAction = { id: 'unread', label: 'Mark unread', tone: 'snooze' };

interface Thread {
  id: string;
  from: string;
  subject: string;
  preview: string;
}

const THREADS: Thread[] = [
  { id: 't1', from: 'Weekly digest', subject: 'Six things worth your attention', preview: 'Swipe or drag sideways — archive one way, snooze and delete the other.' },
  { id: 't2', from: 'Deploys', subject: 'main → production succeeded', preview: 'Every tile acts on its own, and the list still scrolls past them.' },
  { id: 't3', from: 'Ana Ruiz', subject: 'Re: the offsite agenda', preview: 'Drag distance picks the action; a scroll always takes the edgemost one.' },
  { id: 't4', from: 'Billing', subject: 'Your receipt for August', preview: 'Nothing here is transformed — the tiles scroll, so nothing slides out from under you.' },
  { id: 't5', from: 'GitHub', subject: '3 new pull requests need review', preview: 'A tile is a scroller in its own right, one axis each.' },
  { id: 't6', from: 'Standup bot', subject: 'Yesterday · Today · Blockers', preview: 'The list is long enough that its own bottom edge takes real travel to reach.' },
  { id: 't7', from: 'Calendar', subject: 'Design review moved to Thursday', preview: 'Which is the case the staircase exists to handle.' },
  { id: 't8', from: 'Ops', subject: 'Certificate renews in 14 days', preview: 'And the last tile sits right above that edge.' },
];

const DETAIL_BODY = [
  'This panel acts on its own vertical edges, the way a thread does: pull down past the end to archive it, pull up past the top to mark it unread.',
  'It sits beside a list whose tiles act horizontally, and both are live at once. That is the arrangement worth testing — a single rig can be made to feel right in isolation and still fight its neighbour.',
  'Nothing is transformed anywhere in here. Every surface is an ordinary scroller with pads appended at its edges, so no box ever moves out from under a cursor or a thumb.',
  'A stop is the end of a scrollable area, which is why it holds regardless of how hard the gesture was thrown: there is nowhere further to go, and momentum dies against the boundary as the platform intends.',
  'Scroll to the bottom of this panel and keep going for the archive affordance.',
];

export function GestureApp() {
  const [log, setLog] = useState<string[]>([]);
  const [archived, setArchived] = useState<Set<string>>(new Set());
  const record = (where: string) => (a: ScrollAction) => {
    setLog((l) => [`${a.label} · ${where}`, ...l].slice(0, 5));
    if (a.id === 'archive' || a.id === 'delete') {
      setArchived((prev) => new Set(prev).add(where));
    }
  };

  return (
    <div className="proto">
      <header className="proto__bar">
        <a className="proto__back" href="#/">‹ hub</a>
        <span className="proto__status">Combined · {log[0] ?? 'nothing fired yet'}</span>
        <span />
      </header>

      {/* The panel strip. Horizontal, so a tile's horizontal gesture and the strip's
          own navigation share an axis — deliberately, because the real layout will. */}
      <div className="app">
        <div className="app__strip">
          {/* PANEL 1 — the thread list. Vertical itself; its tiles act horizontally. */}
          <section className="app__panel">
            <h2 className="app__panel-title">Inbox</h2>
            <ScrollActionSurface axis="y" className="app__list" settleMs={30} holdMs={3000} returnMs={700}>
              {THREADS.map((t) => (
                <div className="app__tile-wrap" key={t.id}>
                  <ScrollActionSurface
                    axis="x"
                    className="app__tile"
                    settleMs={30}
                    holdMs={3000}
                    returnMs={600}
                    start={{ actions: [ARCHIVE], revealPx: 96, commitPx: 56, onCommit: record(t.id) }}
                    end={{ actions: [DELETE, SNOOZE], revealPx: 192, commitPx: 56, onCommit: record(t.id) }}
                  >
                    <div className="app__msg" data-done={archived.has(t.id) || undefined}>
                      <span className="app__from">{t.from}</span>
                      <span className="app__subject">{t.subject}</span>
                      <span className="app__preview">{t.preview}</span>
                    </div>
                  </ScrollActionSurface>
                </div>
              ))}
            </ScrollActionSurface>
          </section>

          {/* PANEL 2 — thread detail. Acts on its own vertical edges. */}
          <section className="app__panel app__panel--wide">
            <h2 className="app__panel-title">Six things worth your attention</h2>
            <ScrollActionSurface
              axis="y"
              className="app__detail"
              settleMs={30}
              holdMs={3000}
              returnMs={800}
              start={{ actions: [UNREAD], revealPx: 96, commitPx: 60, onCommit: record('detail top') }}
              end={{ actions: [ARCHIVE], revealPx: 96, commitPx: 60, onCommit: record('detail bottom') }}
            >
              <p className="app__meta">Weekly digest · to me · 08:14</p>
              {DETAIL_BODY.map((text, i) => (
                <p key={i}>{text}</p>
              ))}
            </ScrollActionSurface>
          </section>

          {/* PANEL 3 — a plain panel, for contrast: no edge actions at all. */}
          <section className="app__panel app__panel--narrow">
            <h2 className="app__panel-title">Labels</h2>
            <div className="app__labels">
              {['Inbox', 'Snoozed', 'Sent', 'Receipts', 'Newsletters', 'Travel', 'Archive'].map((l) => (
                <span className="app__label" key={l}>{l}</span>
              ))}
            </div>
            <p className="app__note">
              No edge actions here. A panel opts in per side, so "nothing happens at this edge" stays
              a normal, unremarkable state rather than something to switch off.
            </p>
          </section>
        </div>

        <ul className="app__log">
          {log.length === 0 && <li className="app__log-empty">Fired actions appear here.</li>}
          {log.map((entry, i) => (
            <li key={`${entry}-${i}`}>{entry}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
