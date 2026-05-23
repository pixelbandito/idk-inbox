import { describe, it, expect, beforeEach, vi } from 'vitest';

// loadGis memoizes its promise at module scope, so each test imports a fresh
// copy of the module via vi.resetModules() + dynamic import.

function injectedScript(): HTMLScriptElement | null {
  return document.head.querySelector('script[src*="gsi/client"]');
}

describe('loadGis', () => {
  beforeEach(() => {
    vi.resetModules();
    document.head.innerHTML = '';
    delete (window as unknown as { google?: unknown }).google;
  });

  it('injects the GIS script and resolves once google is available', async () => {
    const { loadGis } = await import('./loadGis');
    const promise = loadGis();

    const script = injectedScript();
    expect(script).not.toBeNull();

    // Simulate the browser finishing the download and defining the global.
    (window as unknown as { google: unknown }).google = {
      accounts: { oauth2: {} },
    };
    script!.dispatchEvent(new Event('load'));

    await expect(promise).resolves.toBeUndefined();
  });

  it('rejects when the script fails to load', async () => {
    const { loadGis } = await import('./loadGis');
    const promise = loadGis();

    injectedScript()!.dispatchEvent(new Event('error'));

    await expect(promise).rejects.toThrow(/failed to load/i);
  });

  it('rejects when the script loads but google never initializes', async () => {
    const { loadGis } = await import('./loadGis');
    const promise = loadGis();

    // load fires, but window.google was never defined.
    injectedScript()!.dispatchEvent(new Event('load'));

    await expect(promise).rejects.toThrow(/did not initialize/i);
  });

  it('resolves immediately when google is already available', async () => {
    (window as unknown as { google: unknown }).google = {
      accounts: { oauth2: {} },
    };
    const { loadGis } = await import('./loadGis');

    await expect(loadGis()).resolves.toBeUndefined();
    expect(injectedScript()).toBeNull();
  });
});
