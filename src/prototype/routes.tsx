import type { ReactNode } from 'react';
import { PanelNavPrototype } from './PanelNavPrototype';
import { NavMinimal } from './nav/NavMinimal';
import { NavIdiomatic } from './nav/NavIdiomatic';
import { NavPadded } from './nav/NavPadded';
import { NavEmbla } from './nav/NavEmbla';
import { GestureDrag } from './gesture/GestureDrag';
import { GestureOverscroll } from './gesture/GestureOverscroll';
import { GestureNative } from './gesture/GestureNative';
import { GestureSides } from './gesture/GestureSides';
import { GestureApp } from './gesture/GestureApp';

// Every prototype and its hash URL, in one table. The router renders the match;
// the hub index lists them. Adding a prototype means adding one row here.

export type Route = {
  path: string;
  title: string;
  blurb: string;
  group: string;
  element: ReactNode;
};

export const ROUTES: Route[] = [
  {
    path: '/nav/minimal',
    title: 'Minimal',
    blurb: 'CSS scroll-snap + the scrollsnapchange event. Least code — but never selects the edge panels.',
    group: 'Panel navigation',
    element: <NavMinimal />,
  },
  {
    path: '/nav/idiomatic',
    title: 'Idiomatic',
    blurb: 'IntersectionObserver on a centre line + scrollIntoView. Common pattern; misses the edges too.',
    group: 'Panel navigation',
    element: <NavIdiomatic />,
  },
  {
    path: '/nav/padded',
    title: 'Padded',
    blurb: 'Pure-CSS fix: real half-viewport side padding lets even the edges centre. Visible empty ends.',
    group: 'Panel navigation',
    element: <NavPadded />,
  },
  {
    path: '/nav/embla',
    title: 'Embla (FOSS)',
    blurb: 'Embla Carousel does snapping, dragging, and selected-snap tracking; edges sit flush at the edge.',
    group: 'Panel navigation',
    element: <NavEmbla />,
  },
  {
    path: '/nav/homerolled',
    title: 'Home-rolled',
    blurb: 'The attention-cursor model: custom scrollbar, map, edge buffer, cursor-driven active.',
    group: 'Panel navigation',
    element: <PanelNavPrototype />,
  },
  {
    path: '/gesture/drag',
    title: 'Drag-to-trigger',
    blurb: 'Pointer drag only, 1:1, live threshold. High-control rig for pull-from-edge.',
    group: 'Pull-to-trigger gestures',
    element: <GestureDrag />,
  },
  {
    path: '/gesture/overscroll',
    title: 'Overscroll-to-trigger',
    blurb: "Overscroll + distance + dwell timer + buffer. Port of the app's close gesture.",
    group: 'Pull-to-trigger gestures',
    element: <GestureOverscroll />,
  },
  {
    path: '/gesture/native',
    title: 'Native-scroll reveal',
    blurb:
      'Nothing is lifted by JS: a transparent footer — only added once you reach the end — scrolls the affordance into view. Momentum, rubber-band and snap gravity stay native, the card never leaves the cursor, and mouse-drag works as a second path into the same states.',
    group: 'Pull-to-trigger gestures',
    element: <GestureNative />,
  },
  {
    path: '/gesture/sides',
    title: 'Scroll-to-act, any edge',
    blurb:
      'The same stop-then-travel staircase generalised onto all four edges, with more than one action per side. First travel reveals every action on that side; a second fires the edgemost one. Horizontal rows are nested inside a vertical card, as they would be in a thread list.',
    group: 'Pull-to-trigger gestures',
    element: <GestureSides />,
  },
  {
    path: '/gesture/app',
    title: 'Combined: panels + tiles',
    blurb:
      'The whole arrangement at once — a horizontal panel strip holding a vertical thread list whose tiles act horizontally, beside a detail panel that acts on its own vertical edges. Two nested surfaces share the X axis here, which is the case the real layout will have and no single rig could show.',
    group: 'Pull-to-trigger gestures',
    element: <GestureApp />,
  },
];
