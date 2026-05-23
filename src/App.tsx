import { useState } from 'react';
import { useGoogleAuth } from './lib/auth/useGoogleAuth';
import { fetchInbox } from './lib/gmail/fetchInbox';
import { InboxList } from './components/InboxList';
import type { EmailSummary } from './lib/gmail/types';
import './index.css';

export default function App() {
  const { signedIn, error, signIn, getToken } = useGoogleAuth();
  const [emails, setEmails] = useState<EmailSummary[]>([]);
  const [failedCount, setFailedCount] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadInbox() {
    const token = getToken();
    if (!token) return;
    setLoading(true);
    setLoadError(null);
    setFailedCount(0);
    try {
      const result = await fetchInbox(token);
      setEmails(result.emails);
      setFailedCount(result.failed);
    } catch (e) {
      console.error(e);
      setLoadError(e instanceof Error ? e.message : 'Failed to load inbox.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="app">
      <h1>Inbox Zero</h1>
      {!signedIn && <button onClick={signIn}>Sign in with Google</button>}
      {error && <p className="error">Sign-in error: {error}</p>}
      {signedIn && (
        <>
          <button onClick={loadInbox} disabled={loading}>
            {loading ? 'Loading…' : 'Load inbox'}
          </button>
          {loadError && <p className="error">{loadError}</p>}
          {failedCount > 0 && (
            <p className="error">
              {failedCount} message{failedCount === 1 ? '' : 's'} failed to load — try again.
            </p>
          )}
          <InboxList emails={emails} />
        </>
      )}
    </main>
  );
}
