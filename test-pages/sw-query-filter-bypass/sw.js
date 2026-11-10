// Mimics x.com: pre-caches a generic skeleton and serves it for ALL navigations,
// so the browser's network-layer query filter never sees the navigation URL.

const SHELL_CACHE = 'bypass-shell-v1';
const SHELL_KEY = './__shell__';          // one normalized key, like x.com's /home?precache=1
const TRACKERS = ['fbclid', 'gclid'];

const SKELETON_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><title>Cached skeleton</title></head>
<body>
  <h1>Served from the Service Worker cache (not the network)</h1>
  <p>Committed URL the page/address bar sees:</p>
  <pre id="url"></pre>
  <p id="verdict"></p>
  <p><button id="unregister">Unregister Service Worker</button> <span id="unregister-status"></span></p>
  <script>
    document.getElementById('url').textContent = location.href;
    const u = new URL(location.href);
    const leaked = ['fbclid','gclid'].filter(p => u.searchParams.has(p));
    document.getElementById('verdict').textContent = leaked.length
      ? '\u26a0\ufe0f Tracking params SURVIVED the filter: ' + leaked.join(', ')
      : '\u2705 No tracking params present.';

    document.getElementById('unregister').addEventListener('click', async () => {
      const status = document.getElementById('unregister-status');
      if (!('serviceWorker' in navigator)) {
        status.textContent = 'Service workers unsupported.';
        return;
      }
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        const removed = reg ? await reg.unregister() : false;
        await caches.delete('bypass-shell-v1');
        status.textContent = removed
          ? 'Unregistered and cache cleared. Reload to load from the network.'
          : 'No registration found (cache cleared).';
      } catch (err) {
        status.textContent = 'Failed: ' + err;
      }
    });
  <\/script>
</body></html>`;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await cache.put(SHELL_KEY, new Response(SKELETON_HTML, {
      headers: { 'content-type': 'text/html; charset=utf-8' }
    }));
    console.log('[SW] install: pre-cached skeleton under', SHELL_KEY);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.mode !== 'navigate') return;              // only hijack top-level navigations

  const url = new URL(req.url);
  const present = TRACKERS.filter(t => url.searchParams.has(t));

  // (1) Log the intercepted navigation URL + the tracking params that slipped through.
  console.log('[SW] intercepted navigation:', url.href);
  if (present.length) {
    console.log('[SW] tracking params present (NOT filtered):',
      present.map(t => `${t}=${url.searchParams.get(t)}`).join(', '));
  }

  event.respondWith((async () => {
    // (2) Serve the generic skeleton from cache — no network request for the nav URL.
    const cached = await caches.match(SHELL_KEY);
    console.log('[SW] served from cache:', cached ? `${SHELL_KEY} (skeleton)` : 'CACHE MISS');

    // (3) Fire a same-site network request that still carries the tracking params.
    //     Initiated by the SW's own origin => same-site => exempt from the query filter.
    const beacon = new URL('./api/collect', self.location.origin);
    for (const t of present) beacon.searchParams.set(t, url.searchParams.get(t));
    console.log('[SW] initiating same-site network request:', beacon.href);
    event.waitUntil(
      fetch(beacon, { credentials: 'include' })
        .then(() => console.log('[SW] same-site request completed (parameters by-passed):', beacon.href))
        .catch(() => console.log('[SW] same-site request fired (404 ok):', beacon.href))
    );

    return cached || new Response(SKELETON_HTML, {
      headers: { 'content-type': 'text/html; charset=utf-8' }
    });
  })());
});
