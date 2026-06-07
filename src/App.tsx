import { useEffect, useRef } from 'react';
import { useGoogleAuth } from './lib/auth/useGoogleAuth';
import { LayoutContainer, type PanelRenderProps } from './layout/LayoutContainer';
import { SettingsPanel } from './panels/SettingsPanel';
import { ThreadlistPanel } from './panels/ThreadlistPanel';
import { ThreadPanel } from './panels/ThreadPanel';
import { SnoozePicker } from './pickers/SnoozePicker';
import { LabelPicker } from './pickers/LabelPicker';
import { CommandPalette } from './palette/CommandPalette';
import { UndoToast } from './feedback/UndoToast';
import { ensureAppLabels, SNOOZED_LABEL } from './lib/gmail/labelBootstrap';
import { DispatchProvider } from './state/DispatchProvider';
import { useDispatchContext, useDispatcher } from './state/useDispatch';
import { useKeyboardProducer } from './triggers/producers/fromKeyboard';
import { useTriggerHandler } from './triggers/useTriggerHandler';
import {
  keypressJ,
  keypressE,
  keypressHash,
  keypressBang,
  keypressB,
  keypressModK,
  keypressEscape,
  keypressModZ,
  keypressModShiftZ,
} from './triggers/triggers';
import type { TriggerName } from './triggers/types';
import type { Panel } from './layout/types';
import './index.css';

// Every document-scope keyboard shortcut flows through the new pipeline.
const DOCUMENT_NEW_PIPELINE: ReadonlySet<TriggerName> = new Set([
  keypressJ,
  keypressE,
  keypressHash,
  keypressBang,
  keypressB,
  keypressModK,
  keypressEscape,
  keypressModZ,
  keypressModShiftZ,
]);

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
  // Document keyboard producer wired through the new pipeline, gated by an
  // allowlist of the keypress triggers that have action-map entries today.
  const onTrigger = useTriggerHandler(DOCUMENT_NEW_PIPELINE);
  useKeyboardProducer(onTrigger);

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
