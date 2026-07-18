import { PanelHeader } from '../layout/PanelHeader';
import { SettingsSection } from './settings/SettingsSection';
import { AutomationSettings } from './settings/AutomationSettings';
import { NoticedTrends } from './settings/NoticedTrends';
import { UnderTheHood } from './settings/UnderTheHood';
import { ShortcutsReference } from './settings/ShortcutsReference';

export interface SettingsPanelProps {
  signedIn: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
}

export function SettingsPanel({ signedIn, onSignIn, onSignOut }: SettingsPanelProps) {
  return (
    <>
      <PanelHeader title="Settings" />
      <div className="panel__body settings">
        <SettingsSection title="Account" defaultOpen>
          {signedIn ? (
            <>
              <p>Signed in.</p>
              <button className="btn btn--ghost" onClick={onSignOut}>Sign out</button>
            </>
          ) : (
            <>
              <p>Not signed in.</p>
              <button className="btn btn--primary" onClick={onSignIn}>Sign in with Google</button>
            </>
          )}
        </SettingsSection>

        <SettingsSection title="What this app automates" defaultOpen>
          <AutomationSettings />
        </SettingsSection>

        <SettingsSection title="What I’ve noticed">
          <NoticedTrends />
        </SettingsSection>

        <SettingsSection title="Gestures & shortcuts">
          <ShortcutsReference />
        </SettingsSection>

        <SettingsSection title="Under the hood">
          <UnderTheHood />
        </SettingsSection>
      </div>
    </>
  );
}
