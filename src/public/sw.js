// ════════════════════════════════════════════════════════════════════
//  DIKLY Service Worker -- Offline Support
//  Caches the app shell so it loads offline
//  API requests are NOT cached here (handled in app.js with localStorage)
// ════════════════════════════════════════════════════════════════════

const CACHE_NAME = 'dikly-v14';

// App shell files to cache on install.
// IMPORTANT: index.html loads its scripts with cache-busting query strings
// (e.g. /js/app.js?v=20260620o). We pre-cache the bare paths and serve them
// with ignoreSearch matching, so the versioned requests still hit the cache
// offline. Before this, a fresh SW install left the app unable to boot
// offline because /js/app.js?v=... was never in the cache.
const SHELL_FILES = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/app.js',
  '/js/offline-idb.js',
  '/js/pages-device.js',
  '/js/pages-academic.js',
  '/js/pages-faq.js',
  '/js/pages-corporate.js',
  '/js/manager-portal.js',
  '/js/faq-widget.js',
  '/js/faq-assistant.js',
  '/js/vendor/chart.umd.min.js',
  '/dikly-icon.svg',
  '/manifest.json',
];

// Strip the query string so runtime-cached files overwrite their
// pre-cached bare-path entry instead of piling up versioned duplicates.
const bareUrl = req => {
  const u = new URL(req.url);
  return u.origin + u.pathname;
};

// ── Install: pre-cache app shell ─────────────────────────────────────
// Files are cached individually so one miss doesn't abort the rest.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.all(SHELL_FILES.map(f =>
        cache.add(f).catch(err => console.warn('[SW] Failed to cache', f, err))
      ))
    ).then(() => self.skipWaiting())
  );
});

// ── Activate: clean ALL old caches ───────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => {
        console.log('[SW] Deleting old cache:', k);
        return caches.delete(k);
      }))
    ).then(() => self.clients.claim())
  );
});

// ── Fetch handler ─────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Always go to network for API calls AND the reachability probe --
  // /health must NEVER come from cache, or the app thinks it is online
  // while offline and never falls back to offline login.
  if (url.pathname.startsWith('/api/') || url.pathname === '/health') {
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response(JSON.stringify({ error: 'You are offline' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        })
      )
    );
    return;
  }

  // JS and CSS -- network first, update cache, fall back to cache if offline.
  // Cached under the bare path (query string stripped) and matched with
  // ignoreSearch, so /js/app.js?v=... is served offline from /js/app.js.
  if (url.pathname.endsWith('.js') || url.pathname.endsWith('.css')) {
    event.respondWith(
      fetch(event.request)
        .then(res => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(bareUrl(event.request), clone));
          }
          return res;
        })
        .catch(() => caches.match(event.request, { ignoreSearch: true }))
    );
    return;
  }

  // HTML navigation -- network first, fall back to cached index
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return res;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Everything else -- network first, cache as fallback
  event.respondWith(
    fetch(event.request)
      .then(res => {
        if (res && res.status === 200 && res.type !== 'opaque') {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(bareUrl(event.request), clone));
        }
        return res;
      })
      .catch(() => caches.match(event.request, { ignoreSearch: true }))
  );
});

// ── Push Notifications ────────────────────────────────────────────────────────
self.addEventListener('push', event => {
  if (!event.data) return;
  let data = {};
  try { data = event.data.json(); } catch(e) { data = { title: 'DIKLY', body: event.data.text() }; }

  const options = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-72.png',
    tag: data.tag || 'dikly-notification',
    data: { url: data.url || '/' },
    actions: data.actions || [],
    requireInteraction: data.requireInteraction || false,
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'DIKLY', options)
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const existing = list.find(c => c.url.includes(self.location.origin));
      if (existing) { existing.focus(); existing.navigate(url); }
      else clients.openWindow(url);
    })
  );
});
