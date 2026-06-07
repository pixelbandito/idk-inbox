// Core types for the trigger system.
//
// An AbstractEvent is the producer's normalised view of a raw pointer or
// keyboard event: it has already been routed to a surface, has CSS-logical
// axes, and (for swipes) carries surface-relative distance information in
// both fractional and pixel form so triggers can express accessibility-aware
// thresholds.

export type Surface = 'row' | 'panel-header' | 'panel-body' | 'document' | 'overlay';

export type Distance = { fraction: number; pixels: number };

export type TriggerName = symbol;

export type AbstractEvent =
  | { kind: 'gesture-click';
      surface: Surface; target: Element | null }
  | { kind: 'gesture-long-press';
      surface: Surface; target: Element | null; dt: number }
  | { kind: 'gesture-swipe';
      surface: Surface; target: Element | null;
      axis: 'inline' | 'block';
      towards: 'start' | 'end';
      distance:          Distance;
      startEdgeDistance: Distance;
      endEdgeDistance:   Distance;
      dt: number }
  | { kind: 'gesture-overscroll';
      surface: Surface; edge: 'block-start' | 'block-end';
      distance: Distance }
  | { kind: 'keypress';
      surface: Surface; combo: string };

export type Trigger = {
  name:     TriggerName;
  priority: number;
  match:    (event: AbstractEvent) => boolean;
};
