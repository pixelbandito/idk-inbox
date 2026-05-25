export type Panel =
  | { kind: 'settings' }
  | { kind: 'threadlist'; label: string }
  | { kind: 'thread'; threadId: string; sourceLabel: string };

export type PanelKind = Panel['kind'];
