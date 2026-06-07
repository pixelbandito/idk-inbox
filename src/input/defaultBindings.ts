import type { Binding } from './types';

// All bindings have been migrated to the new trigger pipeline:
//   - Row scope (Step 4 Task 12)         → src/panels/ThreadlistPanel.tsx
//   - Panel-header scope (Step 4 Task 13) → src/layout/PanelHeader.tsx
//   - Document keyboard scope (Step 4 Task 14) → src/App.tsx
//   - Panel-body overscroll (Step 4 Task 15) → src/panels/ThreadPanel.tsx
//
// This file (and the legacy useGestureBindings / useDocumentKeyboard /
// fireBinding plumbing it feeds) will be deleted in Step 5.
export const DEFAULT_BINDINGS: Binding[] = [];
