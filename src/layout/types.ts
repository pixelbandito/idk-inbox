export type Panel =
  | { kind: 'settings' }
  | { kind: 'threadlist'; label: string }
  | { kind: 'thread'; threadId: string; sourceLabel: string }
  | { kind: 'labels' };

export type PanelKind = Panel['kind'];
