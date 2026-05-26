import { PanelHeader } from '../layout/PanelHeader';

export interface SettingsPanelProps {
  signedIn: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
}

export function SettingsPanel({ signedIn, onSignIn, onSignOut }: SettingsPanelProps) {
  return (
    <>
      <PanelHeader title="Settings" />
      <div className="panel__body" style={{ padding: '1rem' }}>
        {signedIn ? (
          <>
            <p>Signed in.</p>
            <button onClick={onSignOut}>Sign out</button>
          </>
        ) : (
          <>
            <p>Not signed in.</p>
            <button onClick={onSignIn}>Sign in with Google</button>
          </>
        )}
      </div>
    </>
  );
}
