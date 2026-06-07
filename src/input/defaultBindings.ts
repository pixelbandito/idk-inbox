import type { Binding } from './types';

export const DEFAULT_BINDINGS: Binding[] = [
  // ----- Row scope (touch) -----
  // (All row interactions migrated to the new pipeline in Step 4 Task 12;
  // see src/panels/ThreadlistPanel.tsx for the ROW_NEW_PIPELINE allowlist.)

  // ----- Panel-header scope (touch) -----
  // (Migrated to the new pipeline in Step 4 Task 13; see
  // src/layout/PanelHeader.tsx for the PANEL_HEADER_NEW_PIPELINE allowlist.)

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
