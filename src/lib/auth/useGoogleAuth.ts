import { useCallback, useEffect, useRef, useState } from 'react';
import { GOOGLE_CLIENT_ID, GMAIL_SCOPE } from '../config';
import { TokenStore } from './tokenStore';
import { loadGis } from './loadGis';

const tokenStore = new TokenStore();

export function useGoogleAuth() {
  const [signedIn, setSignedIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clientRef = useRef<google.accounts.oauth2.TokenClient | null>(null);

  // Warm up the GIS library as soon as the app mounts so sign-in is instant.
  // A failure here is left silent; it is surfaced when the user clicks signIn.
  useEffect(() => {
    loadGis().catch(() => {});
  }, []);

  const signIn = useCallback(async () => {
    try {
      await loadGis();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load Google sign-in.');
      return;
    }

    if (!clientRef.current) {
      clientRef.current = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: GMAIL_SCOPE,
        callback: (resp) => {
          if (resp.error) {
            setError(resp.error);
            return;
          }
          tokenStore.set(resp.access_token, Number(resp.expires_in));
          setError(null);
          setSignedIn(true);
        },
      });
    }
    clientRef.current.requestAccessToken();
  }, []);

  const getToken = useCallback(() => tokenStore.get()?.accessToken ?? null, []);

  return { signedIn, error, signIn, getToken };
}
