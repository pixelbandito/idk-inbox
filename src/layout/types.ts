export type Panel =
  | { kind: 'settings' }
  // `closable` marks a list opened on demand (e.g. a tag from the Labels
  // panel); the core workspace lists (INBOX, Snoozed) leave it unset.
  | { kind: 'threadlist'; label: string; closable?: boolean }
  | { kind: 'thread'; threadId: string; sourceLabel: string }
  | { kind: 'labels' };

export type PanelKind = Panel['kind'];
