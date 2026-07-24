/// <reference types="vitest" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import fs from 'node:fs';

/**
 * TLS for LAN testing / PWA install: point DEV_TLS_CERT and DEV_TLS_KEY (in
 * .env.local) at a cert from your own CA. When set, the server also binds to
 * the LAN (host: true); without them it stays plain-http localhost.
 */
function tlsFromEnv(env: Record<string, string>) {
  if (!env.DEV_TLS_CERT || !env.DEV_TLS_KEY) return undefined;
  return {
    cert: fs.readFileSync(env.DEV_TLS_CERT),
    key: fs.readFileSync(env.DEV_TLS_KEY),
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const https = tlsFromEnv(env);
  const serverConfig = { https, host: https !== undefined };

  return {
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        workbox: {
          // The default precache covers the app shell (markup, code, icons,
          // manifest). Every Google request — Gmail data and OAuth — is
          // deliberately left to the network with NO runtimeCaching entry, so we
          // never persist mail or tokens in the cache and always talk to a live
          // API. The SPA navigation fallback is same-origin only; keep any
          // future same-origin API/auth paths out of it just in case.
          runtimeCaching: [],
          navigateFallbackDenylist: [/^\/api\//, /^\/oauth/],
        },
        manifest: {
          name: 'idk-inbox',
          short_name: 'idk-inbox',
          description: 'A lightweight, mobile-first Gmail wrapper',
          theme_color: '#1a1a1a',
          background_color: '#ffffff',
          display: 'standalone',
          icons: [
            { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          ],
        },
      }),
    ],
    server: serverConfig,
    preview: serverConfig,
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: './src/test/setup.ts',
      // Headroom above the 5s async-util timeout (see src/test/setup.ts) so a
      // test that legitimately waits under load isn't killed by the test timeout.
      testTimeout: 15000,
    },
  };
});
