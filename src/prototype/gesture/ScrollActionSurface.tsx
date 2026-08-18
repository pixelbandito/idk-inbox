import { useRef, type ReactNode } from 'react';
import { useScrollActions, type ScrollActionsConfig, type SideConfig, type SideState, type Edge, type Axis } from './scrollActions';

// The visible half of the mechanic. Structure mirrors the native-scroll rig, for
// the same three reasons that made it work there:
//
//   1. The scroller is TRANSPARENT — the card's own surface lives on an inner sheet,
//      so the scroller is just a window onto whatever sits behind it.
//   2. The action strips are rendered BEHIND, pinned to their edge, and clipped to
//      exactly how far that side has been travelled. At rest the sheet covers them
//      completely, so no strip can peek out through a seam.
//   3. Nothing is transformed. The strips grow because the sheet scrolls away from
//      them, which is why the sheet's box never moves out from under the cursor.
//
// Actions are uncovered FROM THE OUTER EDGE INWARD, so the edgemost one — the one a
// completed commit travel fires — is the first thing you see. What you are being
// offered and what will happen if you keep going are the same thing.

interface Props {
  axis: Axis;
  start?: SideConfig;
  end?: SideConfig;
  settleMs?: number;
  holdMs?: number;
  returnMs?: number;
  className?: string;
  children: ReactNode;
}

function Strip({ edge, axis, side, config }: { edge: Edge; axis: Axis; side: SideState; config?: SideConfig }) {
  if (!config) return null;
  const horiz = axis === 'x';
  const shown = side.reveal + side.commit;
  // Commit progress drives the edgemost action's emphasis. It is the only feedback
  // the final stretch has: the phase does not change across it, and the strip is
  // already fully revealed, so without this the last travel looks like nothing.
  const commitProgress = config.commitPx > 0 ? Math.min(1, side.commit / config.commitPx) : 0;
  const lastIndex = config.actions.length - 1;

  return (
    <div
      className={`sa__strip sa__strip--${edge}`}
      style={{ [horiz ? 'width' : 'height']: `${shown}px` } as React.CSSProperties}
      aria-hidden={shown <= 0}
    >
      <div
        className="sa__actions"
        style={{ [horiz ? 'width' : 'height']: `${config.revealPx}px` } as React.CSSProperties}
      >
        {config.actions.map((a, i) => (
          <div
            key={a.id}
            className="sa__action"
            data-tone={a.tone}
            data-edgemost={i === lastIndex || undefined}
            style={{ '--commit': i === lastIndex ? commitProgress : 0 } as React.CSSProperties}
          >
            <span className="sa__action-label">{a.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ScrollActionSurface({ axis, start, end, settleMs, holdMs, returnMs, className, children }: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const startPadRef = useRef<HTMLDivElement>(null);
  const endPadRef = useRef<HTMLDivElement>(null);

  const config: ScrollActionsConfig = { axis, start, end, settleMs, holdMs, returnMs };
  const state = useScrollActions(scrollerRef, startPadRef, endPadRef, config);

  return (
    <div className={`sa sa--${axis}${className ? ` ${className}` : ''}`}>
      <Strip edge="start" axis={axis} side={state.start} config={start} />
      <Strip edge="end" axis={axis} side={state.end} config={end} />
      <div className="sa__scroller" ref={scrollerRef}>
        {/* Pads are sized imperatively by the hook — never from render, so a pad
            exists on the same frame it is earned. */}
        <div className="sa__pad" ref={startPadRef} aria-hidden="true" />
        <div className="sa__sheet">{children}</div>
        <div className="sa__pad" ref={endPadRef} aria-hidden="true" />
      </div>
    </div>
  );
}
