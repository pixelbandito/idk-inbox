import { useCallback, useEffect, useRef, useState } from 'react';
import { GOOGLE_CLIENT_ID, GMAIL_SCOPE } from '../config';
import { TokenStore } from './tokenStore';
import { loadGis } from './loadGis';
import { loadPersistedToken, savePersistedToken } from './tokenPersistence';
import { resetAppLabelResolver } from '../gmail/appLabelResolver';
import { resetThreadSummaryCache } from '../../state/threadSummaryCache';
import { clearAccountScopedStorage } from '../storageKeys';

const tokenStore = new TokenStore();

// Hydrate from localStorage so a page refresh keeps us signed in until the
// token's natural ~1-hour expiry.
{
  const persisted = loadPersistedToken();
  if (persisted) {
    const remainingSeconds = Math.max(0, (persisted.expiresAt - Date.now()) / 1000);
    tokenStore.set(persisted.accessToken, remainingSeconds);
  }
}

export function useGoogleAuth() {
  const [signedIn, setSignedIn] = useState<boolean>(() => tokenStore.isValid());
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
          // Guard the TTL: a missing / non-numeric expires_in would make
          // expiresAt NaN, which JSON stores as null and the loader then
          // rejects — silently signing the user out on the next refresh.
          const parsed = Number(resp.expires_in);
          const ttlSeconds = Number.isFinite(parsed) && parsed > 0 ? parsed : 3600;
          tokenStore.set(resp.access_token, ttlSeconds);
          savePersistedToken({
            accessToken: resp.access_token,
            expiresAt: Date.now() + ttlSeconds * 1000,
          });
          setError(null);
          setSignedIn(true);
        },
      });
    }
    clientRef.current.requestAccessToken();
  }, []);

  const signOut = useCallback(() => {
    tokenStore.clear();
    savePersistedToken(null);
    clientRef.current = null;
    // Per-account state (label ids, cached mail, triage history, rules) must
    // not leak into the next account.
    resetAppLabelResolver();
    resetThreadSummaryCache();
    clearAccountScopedStorage();
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
