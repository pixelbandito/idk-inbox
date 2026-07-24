import { useEffect, useRef } from 'react';
import { useGoogleAuth } from './lib/auth/useGoogleAuth';
import { LayoutContainer, type PanelRenderProps } from './layout/LayoutContainer';
import { SettingsPanel } from './panels/SettingsPanel';
import { ThreadlistPanel } from './panels/ThreadlistPanel';
import { ThreadPanel } from './panels/ThreadPanel';
import { LabelsPanel } from './panels/LabelsPanel';
import { AutomationActionsPanel } from './panels/AutomationActionsPanel';
import { SnoozePicker } from './pickers/SnoozePicker';
import { LabelPicker } from './pickers/LabelPicker';
import { CommandPalette } from './palette/CommandPalette';
import { UndoToast } from './feedback/UndoToast';
import { FeedbackToast } from './feedback/FeedbackToast';
import { ensureAppLabels, SNOOZED_LABEL } from './lib/gmail/labelBootstrap';
import { isProcessorEnabled } from './lib/automation/settings';
import { displayNameOf } from './lib/gmail/labelDisplay';
import { DispatchProvider } from './state/DispatchProvider';
import { useDispatchContext, useDispatcher, useFeedback } from './state/useDispatch';
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
  { kind: 'labels' },
];

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

  const ctx = useDispatchContext();
  const dispatch = useDispatcher();
  const { setFeedback } = useFeedback();
  const bootstrapped = useRef(false);

  // Post-sign-in bootstrap: make sure the app labels exist, then wake any
  // snoozed threads that came due while the app was closed and apply the
  // user's auto-archive rules. Both are thread-writes, so their successes
  // refresh the lists automatically.
  useEffect(() => {
    if (!ctx.signedIn || bootstrapped.current) return;
    const token = getToken();
    if (!token) return;
    bootstrapped.current = true;
    void (async () => {
      try {
        await ensureAppLabels(token);
      } catch (e) {
        console.warn('label bootstrap failed:', e);
      }
      // Suppress each sweep's own announcement, then compose one summary — two
      // back-to-back announcements would clobber the single feedback slot.
      const woke = await dispatch({ action: 'wake-snoozed', args: {}, context: ctx, silent: true });
      // The auto-archive rule engine only runs while the user leaves it on.
      const archived = isProcessorEnabled('auto-archive')
        ? await dispatch({ action: 'apply-auto-archive', args: {}, context: ctx, silent: true })
        : null;
      const parts = [
        woke.ok && woke.mutated !== false ? woke.description : null,
        archived?.ok && archived.mutated !== false ? archived.description : null,
      ].filter(Boolean);
      if (parts.length > 0) setFeedback({ kind: 'info', message: parts.join(' · ') });
    })();
  }, [ctx, dispatch, getToken, setFeedback]);

  function renderPanel(panel: Panel, index: number, props: PanelRenderProps) {
    if (panel.kind === 'settings') {
      return <SettingsPanelDispatching />;
    }
    if (panel.kind === 'threadlist') {
      return (
        <ThreadlistPanel
          label={panel.label}
          displayName={displayNameOf(panel.label)}
          getToken={getToken}
          onClose={panel.closable ? props.onClose : undefined}
        />
      );
    }
    if (panel.kind === 'labels') {
      return <LabelsPanel getToken={getToken} />;
    }
    if (panel.kind === 'automations') {
      return <AutomationActionsPanel onClose={props.onClose} />;
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
      <LabelPicker getToken={getToken} />
      <CommandPalette />
      <UndoToast />
      <FeedbackToast />
    </>
  );
}

export default function App() {
  const { signedIn, error, signIn, signOut, getToken } = useGoogleAuth();

  return (
    <>
      {error && <p className="error">Sign-in error: {error}</p>}
      <DispatchProvider
        signedIn={signedIn}
        initialPanels={INITIAL_PANELS}
        externalSignIn={signIn}
        externalSignOut={signOut}
        getToken={getToken}
      >
        <AppInner getToken={getToken} />
      </DispatchProvider>
    </>
  );
}
