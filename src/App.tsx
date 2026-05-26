import { useEffect, useRef } from 'react';
import { useGoogleAuth } from './lib/auth/useGoogleAuth';
import { LayoutContainer, type PanelRenderProps } from './layout/LayoutContainer';
import { SettingsPanel } from './panels/SettingsPanel';
import { ThreadlistPanel } from './panels/ThreadlistPanel';
import { ThreadPanel } from './panels/ThreadPanel';
import { ensureAppLabels, SNOOZED_LABEL } from './lib/gmail/labelBootstrap';
import { DispatchProvider } from './state/DispatchProvider';
import type { Panel } from './layout/types';
import './index.css';

const INITIAL_PANELS: Panel[] = [
  { kind: 'settings' },
  { kind: 'threadlist', label: 'INBOX' },
  { kind: 'threadlist', label: SNOOZED_LABEL },
];

function displayName(label: string): string {
  if (label === 'INBOX') return 'Inbox';
  return label.replace(/^idk-inbox\//, '');
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

  function renderPanel(panel: Panel, _index: number, props: PanelRenderProps) {
    if (panel.kind === 'settings') {
      return (
        <SettingsPanel
          signedIn={signedIn}
          onSignIn={signIn}
          onSignOut={signOut}
          onSwipeLeft={props.onSwipeLeft}
          onSwipeRight={props.onSwipeRight}
        />
      );
    }
    if (panel.kind === 'threadlist') {
      return (
        <ThreadlistPanel
          label={panel.label}
          displayName={displayName(panel.label)}
          getToken={getToken}
          onOpenThread={props.onOpenThread}
          onSwipeLeft={props.onSwipeLeft}
          onSwipeRight={props.onSwipeRight}
        />
      );
    }
    return (
      <ThreadPanel
        threadId={panel.threadId}
        getToken={getToken}
        onClose={props.onClose}
        onSwipeLeft={props.onSwipeLeft}
        onSwipeRight={props.onSwipeRight}
      />
    );
  }

  return (
    <DispatchProvider signedIn={signedIn} initialPanels={INITIAL_PANELS}>
      {error && <p className="error">Sign-in error: {error}</p>}
      <LayoutContainer renderPanel={renderPanel} />
    </DispatchProvider>
  );
}
