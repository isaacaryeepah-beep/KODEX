// ════════════════════════════════════════════════════════════════════
//  DIKLY Service Worker -- Offline Support + Background Sync
//  Caches the app shell so it loads offline.
//  Handles BackgroundSync for offline monitor event uploads.
// ════════════════════════════════════════════════════════════════════

const CACHE_NAME  = 'dikly-v41';
const SYNC_TAG    = 'dikly-offline-sync';
const BEACON_TAG  = 'dikly-beacon-sync';

// App shell files to cache on install
const SHELL_FILES = [
  '/',
  '/index.html',
  '/snap-quiz.html',
  '/js/app.js?v=20260602a',
  '/js/offline-idb.js',
  '/js/offline-monitor.js',
  '/js/offline-recorder.js',
  '/js/faq-widget.js',
  '/js/faq-assistant.js',
  '/js/pages-academic.js',
  '/js/pages-device.js',
  '/js/pages-corporate.js',
  '/js/pages-faq.js',
  '/js/manager-portal.js',
  '/css/style.css',
];

// ── Install: pre-cache app shell ─────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(SHELL_FILES).catch(err => {
        console.warn('[SW] Some files failed to cache:', err);
      });
    }).then(() => self.skipWaiting())
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

  // Always go to network for API calls -- offline handled in app.js
  if (url.pathname.startsWith('/api/')) {
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

  // JS and CSS -- network first, update cache, fall back to cache if offline
  // This ensures updated files are always served fresh when online
  if (url.pathname.endsWith('.js') || url.pathname.endsWith('.css')) {
    event.respondWith(
      fetch(event.request)
        .then(res => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(event.request))
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
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(event.request))
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

// ── Background Sync: offline event queue ─────────────────────────────────────
// Triggered by OfflineMonitor via registration.sync.register(SYNC_TAG).
// Notifies all controlled clients to run their sync() function.
self.addEventListener('sync', event => {
  if (event.tag === SYNC_TAG || event.tag === BEACON_TAG) {
    event.waitUntil(
      self.clients.matchAll({ includeUncontrolled: true, type: 'window' }).then(clients => {
        clients.forEach(client => client.postMessage({ type: 'DIKLY_BG_SYNC' }));
      })
    );
  }
});

// ── Message handler: client → SW communication ────────────────────────────────
self.addEventListener('message', event => {
  if (event.data?.type === 'REGISTER_SYNC') {
    self.registration.sync.register(SYNC_TAG).catch(() => {
      // BackgroundSync not available — client handles via 'online' event instead
    });
  }
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
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
