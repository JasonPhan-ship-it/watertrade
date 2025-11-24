# PWA and native shell notes

This project ships PWA metadata and an offline-ready service worker so contributors can test installability without a separate repository.

## Key files
- `public/manifest.webmanifest` — app name, theme colors, and icon declarations.
- `public/icons/` — PWA icons used across platforms.
- `public/offline.html` — friendly offline fallback shown when navigation happens without network access.
- `next.config.mjs` — wraps the Next.js config with `next-pwa` to emit `/public/sw.js` during production builds.
- `components/PwaUpdater.tsx` — registers the service worker on the client and promotes waiting workers.

## Local testing
1. Install dependencies: `npm install` (Node 20.x is recommended to satisfy the engines field).
2. Build and serve the production bundle so the service worker is emitted: `npm run build && npm run start`.
3. Open the site in the browser, confirm the manifest and service worker under DevTools > Application, and use the Network tab to switch to **Offline** to verify the offline fallback page.

## Native wrapper sketch
If you later need a store-ready binary, create a sibling directory (e.g., `mobile/capacitor` or `mobile/expo`) that wraps the deployed site in a WebView while reusing the same backend APIs and auth configuration. Keep it in this repository to share assets and CI pipelines.
