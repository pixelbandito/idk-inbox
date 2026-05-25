import { useCallback, useEffect, useRef, useState } from 'react';
import { GOOGLE_CLIENT_ID, GMAIL_SCOPE } from '../config';
import { TokenStore } from './tokenStore';
import { loadGis } from './loadGis';

const tokenStore = new TokenStore();

export function useGoogleAuth() {
  const [signedIn, setSignedIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clientRef = useRef<google.accounts.oauth2.TokenClient | null>(null);

  // Warm up the GIS library so sign-in is instant. Failures here are surfaced
  // when the user actually clicks signIn.
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

  const signOut = useCallback(() => {
    tokenStore.clear();
    clientRef.current = null;
    setError(null);
    setSignedIn(false);
  }, []);

  const getToken = useCallback(() => {
    if (!tokenStore.isValid()) {
      // Token expired or absent. Defer the state update to a microtask so a
      // caller invoking getToken during render does not trigger React's
      // "setState while rendering a different component" warning.
      if (signedIn) queueMicrotask(() => setSignedIn(false));
      return null;
    }
    return tokenStore.get()?.accessToken ?? null;
  }, [signedIn]);

  return { signedIn, error, signIn, signOut, getToken };
}
