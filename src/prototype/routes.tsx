import type { ReactNode } from 'react';
import { PanelNavPrototype } from './PanelNavPrototype';
import { NavMinimal } from './nav/NavMinimal';
import { NavIdiomatic } from './nav/NavIdiomatic';
import { NavPadded } from './nav/NavPadded';
import { NavEmbla } from './nav/NavEmbla';
import { GestureDrag } from './gesture/GestureDrag';
import { GestureOverscroll } from './gesture/GestureOverscroll';

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
];
