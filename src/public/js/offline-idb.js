/**
 * DIKLY Offline Layer  v1.0
 *
 * Provides transparent offline support via IndexedDB:
 *  - Caches all GET /api/* responses for 7 days
 *  - Queues POST/PATCH/DELETE when offline — auto-flushes on reconnect
 *  - Stores user session for offline login
 *  - Stores dashboard snapshot for offline viewing
 *
 * Loaded before app.js so the fetch interceptor is in place first.
 */
(function () {
  'use strict';

  const DB_NAME    = 'dikly_offline_v1';
  const DB_VERSION = 1;
  const CACHE_TTL  = 7 * 24 * 60 * 60 * 1000; // 7 days

  let _db = null;

  // ── Open DB ────────────────────────────────────────────────────────────────
  function openDB() {
    return new Promise((resolve, reject) => {
      if (_db) return resolve(_db);
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function (e) {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('apiCache')) {
          db.createObjectStore('apiCache', { keyPath: 'url' });
        }
        if (!db.objectStoreNames.contains('syncQueue')) {
          db.createObjectStore('syncQueue', { autoIncrement: true, keyPath: '_qid' });
        }
        if (!db.objectStoreNames.contains('userSession')) {
          db.createObjectStore('userSession', { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('dashboardCache')) {
          db.createObjectStore('dashboardCache', { keyPath: 'key' });
        }
      };
      req.onsuccess  = e => { _db = e.target.result; resolve(_db); };
      req.onerror    = e => reject(e.target.error);
    });
  }

  // ── Generic IDB helpers ────────────────────────────────────────────────────
  async function idbGet(store, key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readonly');
      const req = tx.objectStore(store).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror   = e => reject(e.target.error);
    });
  }

  async function idbPut(store, value) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      const req = tx.objectStore(store).put(value);
      req.onsuccess = () => resolve(req.result);
      req.onerror   = e => reject(e.target.error);
    });
  }

  async function idbDelete(store, key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      const req = tx.objectStore(store).delete(key);
      req.onsuccess = () => resolve();
      req.onerror   = e => reject(e.target.error);
    });
  }

  async function idbGetAll(store) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readonly');
      const req = tx.objectStore(store).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror   = e => reject(e.target.error);
    });
  }

  async function idbClear(store) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      const req = tx.objectStore(store).clear();
      req.onsuccess = () => resolve();
      req.onerror   = e => reject(e.target.error);
    });
  }

  // ── Fake Response builder ─────────────────────────────────────────────────
  function makeCachedResponse(data) {
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'X-Dikly-Offline': '1' },
    });
  }

  function makeOfflineResponse(status, message) {
    return new Response(JSON.stringify({ error: message, offline: true }), {
      status,
      headers: { 'Content-Type': 'application/json', 'X-Dikly-Offline': '1' },
    });
  }

  // ── Fetch Interceptor ─────────────────────────────────────────────────────
  const _origFetch = window.fetch.bind(window);

  window.fetch = async function (input, init) {
    const url    = typeof input === 'string' ? input : (input instanceof URL ? input.href : input.url);
    const method = ((init && init.method) || 'GET').toUpperCase();
    const isApi  = typeof url === 'string' && url.includes('/api/');

    if (!isApi) return _origFetch(input, init);

    const isOnline = navigator.onLine;

    // ── OFFLINE branch ────────────────────────────────────────────────────
    if (!isOnline) {
      if (method === 'GET') {
        try {
          const cached = await idbGet('apiCache', url);
          if (cached && cached.data) {
            console.log('[Offline] Serving from cache:', url);
            return makeCachedResponse(cached.data);
          }
        } catch (_) {}
        return makeOfflineResponse(503, 'You are offline and this data is not cached.');
      } else {
        // Queue mutation
        const body = (init && init.body) ? init.body : null;
        let bodyObj = null;
        try { bodyObj = body ? JSON.parse(body) : null; } catch (_) { bodyObj = { _raw: body }; }

        const label = _queueLabel(url, method, bodyObj);
        await idbPut('syncQueue', {
          url,
          method,
          body: bodyObj,
          headers: (init && init.headers) ? Object.fromEntries(Object.entries(init.headers)) : {},
          label,
          queuedAt: Date.now(),
        });
        console.log('[Offline] Queued:', method, url);
        // Return an optimistic 202
        return new Response(JSON.stringify({ queued: true, offline: true, label }), {
          status: 202,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    // ── ONLINE branch — fetch + cache ─────────────────────────────────────
    try {
      const response = await _origFetch(input, init);
      if (method === 'GET' && response.ok) {
        const clone = response.clone();
        clone.json().then(data => {
          idbPut('apiCache', { url, data, cachedAt: Date.now() }).catch(() => {});
        }).catch(() => {});
      }
      return response;
    } catch (err) {
      // Network error — try cache for GETs
      if (method === 'GET') {
        try {
          const cached = await idbGet('apiCache', url);
          if (cached && cached.data && Date.now() - cached.cachedAt < CACHE_TTL) {
            console.log('[Offline] Network failed, serving from cache:', url);
            return makeCachedResponse(cached.data);
          }
        } catch (_) {}
      }
      throw err;
    }
  };

  // ── Sync queue label ───────────────────────────────────────────────────────
  function _queueLabel(url, method, body) {
    if (url.includes('/attendance') && method === 'POST') return 'Mark Attendance';
    if (url.includes('/auth/login') && method === 'POST')  return 'Login';
    if (url.includes('/announcements') && method === 'POST') return 'Post Announcement';
    return `${method} ${url.split('/api/')[1] || url}`;
  }

  // ── Auto-flush sync queue on reconnect ─────────────────────────────────────
  async function flushSyncQueue() {
    const items = await idbGetAll('syncQueue');
    if (!items.length) return;

    console.log(`[Offline] Flushing ${items.length} queued request(s)…`);
    for (const item of items) {
      try {
        const headers = item.headers || {};
        if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
        const res = await _origFetch(item.url, {
          method:  item.method,
          headers,
          body:    item.body ? JSON.stringify(item.body) : undefined,
        });
        if (res.ok || res.status < 500) {
          await idbDelete('syncQueue', item._qid);
          console.log('[Offline] Synced:', item.label);
        }
      } catch (e) {
        console.warn('[Offline] Sync failed for', item.label, e.message);
        break; // stop on network failure
      }
    }

    // Notify the app
    const remaining = (await idbGetAll('syncQueue')).length;
    if (!remaining && typeof window.toastSuccess === 'function') {
      window.toastSuccess('Offline actions synced successfully.');
    }
  }

  window.addEventListener('online',  flushSyncQueue);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && navigator.onLine) flushSyncQueue().catch(() => {});
  });

  // ── Public API ──────────────────────────────────────────────────────────────
  window.DiklyIDB = {
    // Save / restore logged-in user session for offline login
    saveUserSession: async function (userData, tokenData) {
      await idbPut('userSession', { key: 'session', user: userData, token: tokenData, savedAt: Date.now() });
    },

    getUserSession: async function () {
      const rec = await idbGet('userSession', 'session');
      if (!rec) return null;
      if (Date.now() - rec.savedAt > 30 * 24 * 60 * 60 * 1000) return null; // 30 days
      return rec;
    },

    clearUserSession: async function () {
      await idbDelete('userSession', 'session');
    },

    // Dashboard snapshot
    saveDashboardData: async function (key, data) {
      await idbPut('dashboardCache', { key, data, savedAt: Date.now() });
    },

    getDashboardData: async function (key) {
      const rec = await idbGet('dashboardCache', key);
      if (!rec) return null;
      if (Date.now() - rec.savedAt > CACHE_TTL) return null;
      return rec.data;
    },

    // Queue management
    queueCount: async function () {
      const items = await idbGetAll('syncQueue');
      return items.length;
    },

    flushQueue: flushSyncQueue,

    // Clear everything (on logout)
    clearAll: async function () {
      await Promise.all([
        idbClear('apiCache'),
        idbClear('syncQueue'),
        idbClear('userSession'),
        idbClear('dashboardCache'),
      ]);
    },
  };

  // Persist user session whenever login succeeds
  document.addEventListener('dikly:login', function (e) {
    if (e.detail && e.detail.user && e.detail.token) {
      window.DiklyIDB.saveUserSession(e.detail.user, e.detail.token).catch(() => {});
    }
  });

  // Clear session on logout
  document.addEventListener('dikly:logout', function () {
    window.DiklyIDB.clearAll().catch(() => {});
  });

})();
