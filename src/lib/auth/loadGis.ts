// Loads the Google Identity Services (GIS) library on demand.
//
// GIS defines the global `google` namespace asynchronously. Any code that uses
// `google.accounts.oauth2` must `await loadGis()` first — otherwise it hits a
// `ReferenceError: google is not defined` when the script has not loaded yet.

const GIS_SRC = 'https://accounts.google.com/gsi/client';
const LOAD_TIMEOUT_MS = 10_000;

declare global {
  interface Window {
    google?: typeof google;
  }
}

let loadPromise: Promise<void> | null = null;

function gisReady(): boolean {
  return Boolean(window.google?.accounts?.oauth2);
}

export function loadGis(): Promise<void> {
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<void>((resolve, reject) => {
    if (gisReady()) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;

    const timeout = window.setTimeout(() => {
      script.remove();
      reject(new Error('Google Identity Services failed to load (timed out).'));
    }, LOAD_TIMEOUT_MS);

    script.onload = () => {
      window.clearTimeout(timeout);
      if (gisReady()) {
        resolve();
      } else {
        reject(new Error('Google Identity Services loaded but did not initialize.'));
      }
    };

    script.onerror = () => {
      window.clearTimeout(timeout);
      script.remove();
      reject(new Error('Google Identity Services failed to load (blocked or offline).'));
    };

    document.head.appendChild(script);
  });

  // Allow a later call to retry if this attempt fails.
  loadPromise.catch(() => {
    loadPromise = null;
  });

  return loadPromise;
}
