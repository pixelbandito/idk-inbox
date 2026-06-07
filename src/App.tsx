import { useCallback, useEffect, useRef } from 'react';
import { useGoogleAuth } from './lib/auth/useGoogleAuth';
import { LayoutContainer, type PanelRenderProps } from './layout/LayoutContainer';
import { SettingsPanel } from './panels/SettingsPanel';
import { ThreadlistPanel } from './panels/ThreadlistPanel';
import { ThreadPanel } from './panels/ThreadPanel';
import { SnoozePicker } from './pickers/SnoozePicker';
import { LabelPicker } from './pickers/LabelPicker';
import { CommandPalette } from './palette/CommandPalette';
import { UndoToast } from './feedback/UndoToast';
import { useDocumentKeyboard } from './input/useDocumentKeyboard';
import { ensureAppLabels, SNOOZED_LABEL } from './lib/gmail/labelBootstrap';
import { DispatchProvider } from './state/DispatchProvider';
import { useDispatchContext, useDispatcher } from './state/useDispatch';
import { useKeyboardProducer } from './triggers/producers/fromKeyboard';
import { fireThrough, makeStringDispatchBridge } from './triggers/wireUp';
import type { AbstractEvent } from './triggers/types';
import type { Panel } from './layout/types';
import './index.css';

/**
 * Feature flag for the new trigger pipeline (Step 2 of the trigger-system
 * redesign). When false, the producers are wired but their emitted events
 * are dropped — the legacy useDocumentKeyboard / useGestureBindings hooks
 * remain the only path that reaches the dispatcher. Step 3 (canary) is the
 * first time this needs to flip on for any particular trigger.
 */
const USE_NEW_TRIGGERS = false;

const INITIAL_PANELS: Panel[] = [
  { kind: 'settings' },
  { kind: 'threadlist', label: 'INBOX' },
  { kind: 'threadlist', label: SNOOZED_LABEL },
];

function displayName(label: string): string {
  if (label === 'INBOX') return 'Inbox';
  return label.replace(/^idk-inbox\//, '');
}

/**
 * Small adapter that pulls signedIn from the dispatch context and dispatches
 * `sign-in` / `sign-out` actions, keeping SettingsPanel decoupled from the
 * dispatch system.
 */
function SettingsPanelDispatching() {
  const ctx = useDispatchContext();
  const dispatch = useDispatcher();
  return (
    <SettingsPanel
      signedIn={ctx.signedIn}
      onSignIn={() => { void dispatch({ action: 'sign-in',  args: {}, context: ctx }); }}
      onSignOut={() => { void dispatch({ action: 'sign-out', args: {}, context: ctx }); }}
    />
  );
}

function AppInner({ getToken }: { getToken: () => string | null }) {
  useDocumentKeyboard();

  // --- New trigger pipeline (Step 2): producers parallel to legacy hooks.
  // The keyboard producer is mounted unconditionally so its listener
  // attach/detach lifecycle matches the legacy one; only the resolver call
  // is gated by USE_NEW_TRIGGERS. Gesture-producer wiring is deferred to
  // Step 3 (canary) where it lives alongside useGestureBindings inside the
  // panels.
  const ctx = useDispatchContext();
  const dispatch = useDispatcher();
  const bridge = makeStringDispatchBridge(dispatch);
  const handleAbstractEvent = useCallback((event: AbstractEvent) => {
    if (!USE_NEW_TRIGGERS) return;
    void fireThrough(event, ctx, bridge);
  }, [ctx, bridge]);
  useKeyboardProducer(handleAbstractEvent);

  function renderPanel(panel: Panel, index: number, props: PanelRenderProps) {
    if (panel.kind === 'settings') {
      return <SettingsPanelDispatching />;
    }
    if (panel.kind === 'threadlist') {
      return (
        <ThreadlistPanel
          label={panel.label}
          displayName={displayName(panel.label)}
          getToken={getToken}
        />
      );
    }
    return (
      <ThreadPanel
        threadId={panel.threadId}
        panelIndex={index}
        getToken={getToken}
        onClose={props.onClose}
      />
    );
  }

  return (
    <>
      <LayoutContainer renderPanel={renderPanel} />
      <SnoozePicker />
      <LabelPicker />
      <CommandPalette />
      <UndoToast />
    </>
  );
}

export default function App() {
  const { signedIn, error, signIn, signOut, getToken } = useGoogleAuth();
  const bootstrapped = useRef(false);

  useEffect(() => {
    if (!signedIn || bootstrapped.current) return;
    const token = getToken();
    if (!token) return;
    bootstrapped.current = true;
    ensureAppLabels(token).catch((e) => {
      console.warn('label bootstrap failed:', e);
    });
  }, [signedIn, getToken]);

  return (
    <>
      {error && <p className="error">Sign-in error: {error}</p>}
      <DispatchProvider
        signedIn={signedIn}
        initialPanels={INITIAL_PANELS}
        externalSignIn={signIn}
        externalSignOut={signOut}
      >
        <AppInner getToken={getToken} />
      </DispatchProvider>
    </>
  );
}
