import type { Binding } from './types';

export const DEFAULT_BINDINGS: Binding[] = [
  // ----- Row scope (touch) -----
  { scope: 'row', modality: 'touch', trigger: { kind: 'click' },
    action: 'open-panel', when: 'not-in-picker' },

  { scope: 'row', modality: 'touch', trigger: { kind: 'long-press', ms: 500 },
    action: 'enter-selection', when: 'not-in-picker' },

  { scope: 'row', modality: 'touch',
    trigger: {
      kind: 'swipe', direction: 'right', minPx: 60,
      stages: [
        { minPx: 60, action: 'archive-thread' },
        { minPx: 240, action: 'delete-thread' },
      ],
    },
    action: 'archive-thread', when: 'not-in-picker' },

  { scope: 'row', modality: 'touch',
    trigger: { kind: 'swipe', direction: 'left', minPx: 60 },
    action: 'snooze-thread', when: 'not-in-picker' },

  // ----- Panel-header scope (touch) -----
  { scope: 'panel-header', modality: 'touch',
    trigger: { kind: 'swipe', direction: 'left', minPx: 60 },
    action: 'nav-panel-next' },
  { scope: 'panel-header', modality: 'touch',
    trigger: { kind: 'swipe', direction: 'right', minPx: 60 },
    action: 'nav-panel-prev' },

  // ----- Document scope (keyboard) -----
  { scope: 'document', modality: 'keyboard',
    trigger: { kind: 'key', combo: 'mod+k' },  action: 'open-command-palette' },
  { scope: 'document', modality: 'keyboard',
    trigger: { kind: 'key', combo: 'escape' }, action: 'exit-mode' },

  { scope: 'document', modality: 'keyboard', trigger: { kind: 'key', combo: 'j' },
    action: 'archive-thread', when: ['mode-idle', 'in-threadlist-panel'] },
  { scope: 'document', modality: 'keyboard', trigger: { kind: 'key', combo: 'e' },
    action: 'archive-thread', when: ['mode-idle', 'in-thread-panel'] },
  { scope: 'document', modality: 'keyboard', trigger: { kind: 'key', combo: '#' },
    action: 'delete-thread',  when: 'mode-idle' },
  { scope: 'document', modality: 'keyboard', trigger: { kind: 'key', combo: '!' },
    action: 'spam-thread',    when: 'mode-idle' },
  { scope: 'document', modality: 'keyboard', trigger: { kind: 'key', combo: 'b' },
    action: 'snooze-thread',  when: 'mode-idle' },

  { scope: 'document', modality: 'keyboard',
    trigger: { kind: 'key', combo: 'mod+z' },       action: 'undo' },
  { scope: 'document', modality: 'keyboard',
    trigger: { kind: 'key', combo: 'mod+shift+z' }, action: 'redo' },
];
