import { useRef, type ReactNode } from 'react';
import {
  useScrollActions,
  type ScrollAction,
  type ScrollActionsConfig,
  type SideConfig,
  type SideState,
  type Edge,
  type Axis,
} from './scrollActions';

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

function Strip({
  edge,
  axis,
  side,
  config,
  onPick,
}: {
  edge: Edge;
  axis: Axis;
  side: SideState;
  config?: SideConfig;
  onPick: (edge: Edge, action: ScrollAction) => void;
}) {
  if (!config) return null;
  const horiz = axis === 'x';
  const shown = side.reveal + side.commit;
  // Commit progress drives the edgemost action's emphasis. It is the only feedback
  // the final stretch has: the phase does not change across it, and the strip is
  // already fully revealed, so without this the last travel looks like nothing.
  const commitProgress = config.commitPx > 0 ? Math.min(1, side.commit / config.commitPx) : 0;
  const lastIndex = config.actions.length - 1;
  /** Each action's share of the reveal. The edgemost may exceed it; none may be under. */
  const base = config.revealPx / Math.max(1, config.actions.length);

  /**
   * How lit each action is, 0–1.
   *
   * Once something has fired, the light belongs entirely to THAT action — a tap can
   * run an inner one, and it would be a lie to brighten the edgemost instead just
   * because that is what a travel would have chosen. Until then it tracks the commit
   * travel on the edgemost, which is the only feedback the final stretch has.
   */
  const litness = (a: ScrollAction, i: number) => {
    if (side.firedActionId) return a.id === side.firedActionId ? 1 : 0;
    return i === lastIndex ? commitProgress : 0;
  };

  return (
    <div
      className={`sa__strip sa__strip--${edge}`}
      style={{ [horiz ? 'width' : 'height']: `${shown}px` } as React.CSSProperties}
      aria-hidden={shown <= 0}
    >
      {/* The actions must always fill the strip. The strip is a window sized to how
          far the side has been travelled, and during the COMMIT that exceeds the
          reveal — so a row fixed at `revealPx` leaves a bare, transparent band on the
          inboard side, between the sheet and the buttons. It reads as the tile having
          overshot and stuck, and the band is exactly `commitPx` wide.

          Below the reveal distance the row stays at `revealPx` and is clipped, which
          is what uncovers the actions from the outer edge inward. Past it the row
          grows, and the extra goes to the edgemost action (see its flex below) — so
          the thing that is about to fire visibly swells as you commit to it. */}
      <div
        className="sa__actions"
        style={{ [horiz ? 'width' : 'height']: `${Math.max(config.revealPx, shown)}px` } as React.CSSProperties}
      >
        {config.actions.map((a, i) => (
          // A real button, so the actions are focusable and Enter works. Mouse
          // clicks do NOT arrive here — the scroller covers the strips — and are
          // routed by the surface's own handler below.
          <button
            type="button"
            key={a.id}
            className="sa__action"
            data-tone={a.tone}
            data-action-id={a.id}
            data-edgemost={i === lastIndex || undefined}
            data-fired={side.firedActionId === a.id || undefined}
            tabIndex={shown > 0 ? 0 : -1}
            onClick={() => onPick(edge, a)}
            style={
              {
                '--commit': litness(a, i),
                // Everything holds its share of the reveal; only the edgemost grows,
                // so the commit travel is absorbed by the action it is committing to.
                flex: i === lastIndex ? `1 1 ${base}px` : `0 0 ${base}px`,
              } as React.CSSProperties
            }
          >
            <span className="sa__action-label">{a.label}</span>
          </button>
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

  /**
   * Route a click to whichever action is underneath it.
   *
   * The strips sit BEHIND the scroller, and the scroller spans the whole surface —
   * that is what keeps a wheel anywhere on the card scrolling the card, including
   * over a revealed strip. The cost is that the buttons never receive the click
   * themselves, so it is hit-tested instead. `elementsFromPoint` returns the whole
   * stack under the cursor, occluded entries included, so the button is in there.
   *
   * A click inside the sheet's own box is content, not an action — the sheet is
   * opaque and is what covers the strips at rest — so those are ignored outright
   * rather than relying on the stacking order to mean the right thing.
   */
  const onSurfaceClick = (e: React.MouseEvent) => {
    const sheet = scrollerRef.current?.querySelector('.sa__sheet');
    if (!sheet) return;
    const r = sheet.getBoundingClientRect();
    const insideSheet =
      e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (insideSheet) return;

    const hit = document
      .elementsFromPoint(e.clientX, e.clientY)
      .find((el): el is HTMLElement => el instanceof HTMLElement && el.dataset.actionId !== undefined);
    if (!hit) return;

    const edge: Edge = hit.closest('.sa__strip--start') ? 'start' : 'end';
    const cfg = edge === 'start' ? start : end;
    const action = cfg?.actions.find((a) => a.id === hit.dataset.actionId);
    if (action) state.activate(edge, action);
  };

  // The keyboard path is not missing, it is elsewhere: the actions are real buttons
  // with their own onClick, so Tab and Enter reach them directly. This handler exists
  // only because a MOUSE click cannot, the scroller being on top.
  return (
    <div className={`sa sa--${axis}${className ? ` ${className}` : ''}`} onClick={onSurfaceClick}>
      <Strip edge="start" axis={axis} side={state.start} config={start} onPick={state.activate} />
      <Strip edge="end" axis={axis} side={state.end} config={end} onPick={state.activate} />
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
