/*
 * AWN Resale — service worker. Caches the STATIC APP SHELL ONLY, for fast launch.
 *
 * CORRECTNESS RULE (money app): it must never intercept or cache /api/*, the
 * webhook, server actions/mutations (POST), or RSC data fetches. A cached
 * balance is a bug. Data always hits the network — only immutable/static assets
 * (/_next/static, the generated icons, the manifest) are cached; page
 * navigations are network-first with an offline notice, never a cached data page.
 */
const CACHE = 'awn-shell-v1';

// Only content-hashed build output + brand/static assets are cacheable.
function isStaticAsset(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/pwa/') ||
    url.pathname === '/manifest.webmanifest' ||
    url.pathname === '/favicon.ico'
  );
}

self.addEventListener('install', () => {
  // Activate immediately; assets populate the cache lazily on first use.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Hard exclusions — ALWAYS live network, never cached or intercepted:
  //   • non-GET  → server actions, mutations, the webhook POST
  //   • cross-origin
  //   • /api/*   → includes /api/square/webhook and every data route
  //   • RSC data fetches (?_rsc query or RSC request header)
  // Returning without respondWith() lets the browser do its normal fetch.
  if (
    req.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api/') ||
    url.searchParams.has('_rsc') ||
    req.headers.get('RSC') === '1'
  ) {
    return;
  }

  // Static shell assets: cache-first, revalidate in the background.
  if (isStaticAsset(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const hit = await cache.match(req);
        const fromNetwork = fetch(req)
          .then((res) => {
            if (res && res.ok) cache.put(req, res.clone());
            return res;
          })
          .catch(() => hit);
        return hit || fromNetwork;
      })(),
    );
    return;
  }

  // Page navigations: NETWORK-FIRST so pages always render live data. Only when
  // offline do we fall back — to a minimal notice, NOT a cached data page, so a
  // stale balance can never be shown.
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          return await fetch(req);
        } catch {
          return new Response(
            '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
              '<title>Offline</title><body style="font-family:system-ui;background:#f4f7f9;color:#2c353f;' +
              'display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;text-align:center">' +
              '<div><h1 style="font-size:18px;margin:0 0 6px">You’re offline</h1>' +
              '<p style="color:#566472;font-size:14px;margin:0">AWN Resale needs a connection for live data. ' +
              'Reconnect and try again.</p></div></body>',
            { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
          );
        }
      })(),
    );
    return;
  }

  // Everything else: default network, no caching.
});
