// ════════════════════════════════════════════════════════════════════════════
//  DIKLY Offline IDB — Invisible local database layer
//  Intercepts all fetch() calls to:
//    • Cache every GET /api/ response in IndexedDB (auto, silent)
//    • Return cached data instantly when offline
//    • Queue POST/PATCH/DELETE calls (attendance marks, etc.) when offline
//    • Auto-sync the queue the moment the device reconnects
//  No user interaction needed. Storage is in the app's private IDB — not
//  visible in localStorage, not clearable by the user from browser settings.
// ════════════════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  const DB_NAME    = 'dikly_local';
  const DB_VERSION = 3;
  const CACHE_TTL  = 7 * 24 * 60 * 60 * 1000; // 7 days

  // ── IndexedDB bootstrap ─────────────────────────────────────────────────────
  let _db = null;

  function openDB() {
    return new Promise((resolve, reject) => {
      if (_db) return resolve(_db);
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (e) => {
        const db = e.target.result;

        // API response cache — keyed by URL
        if (!db.objectStoreNames.contains('apiCache')) {
          const s = db.createObjectStore('apiCache', { keyPath: 'url' });
          s.createIndex('ts', 'ts', { unique: false });
        }

        // Pending write queue — attendance marks, session ops, etc.
        if (!db.objectStoreNames.contains('syncQueue')) {
          const q = db.createObjectStore('syncQueue', { keyPath: 'id', autoIncrement: true });
          q.createIndex('queuedAt', 'queuedAt', { unique: false });
        }

        // User session cache — full user object + token
        if (!db.objectStoreNames.contains('userSession')) {
          db.createObjectStore('userSession', { keyPath: 'key' });
        }

        // Dashboard data — each widget/panel cached separately
        if (!db.objectStoreNames.contains('dashboardCache')) {
          const d = db.createObjectStore('dashboardCache', { keyPath: 'key' });
          d.createIndex('ts', 'ts', { unique: false });
        }
      };

      req.onsuccess  = (e) => { _db = e.target.result; resolve(_db); };
      req.onerror    = (e) => reject(e.target.error);
      req.onblocked  = ()  => reject(new Error('IDB blocked'));
    });
  }

  // ── Generic IDB helpers ─────────────────────────────────────────────────────
  async function idbPut(storeName, record) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).put(record);
      tx.oncomplete = resolve;
      tx.onerror    = (e) => reject(e.target.error);
    });
  }

  async function idbGet(storeName, key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx  = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).get(key);
      req.onsuccess = (e) => resolve(e.target.result ?? null);
      req.onerror   = (e) => reject(e.target.error);
    });
  }

  async function idbDelete(storeName, key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).delete(key);
      tx.oncomplete = resolve;
      tx.onerror    = (e) => reject(e.target.error);
    });
  }

  async function idbGetAll(storeName) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx  = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = (e) => resolve(e.target.result || []);
      req.onerror   = (e) => reject(e.target.error);
    });
  }

  // ── API cache ───────────────────────────────────────────────────────────────
  async function cacheApiResponse(url, data) {
    try {
      await idbPut('apiCache', { url, data, ts: Date.now() });
    } catch (e) {
      // Silent — IDB write failure should never crash the app
    }
  }

  async function getCachedApiResponse(url) {
    try {
      const rec = await idbGet('apiCache', url);
      if (!rec) return null;
      if (Date.now() - rec.ts > CACHE_TTL) return null; // expired
      return rec.data;
    } catch (e) {
      return null;
    }
  }

  // ── Sync queue ──────────────────────────────────────────────────────────────
  async function enqueueWrite(url, options, label) {
    try {
      await idbPut('syncQueue', {
        url,
        method:  options.method || 'POST',
        headers: options.headers || {},
        body:    options.body   || null,
        label:   label || url,
        queuedAt: Date.now(),
      });
    } catch (e) {
      // Fall back silently
    }
  }

  async function getSyncQueue() {
    try { return await idbGetAll('syncQueue'); }
    catch (e) { return []; }
  }

  async function removeSyncItem(id) {
    try { await idbDelete('syncQueue', id); }
    catch (e) { /* silent */ }
  }

  // ── Flush queue when back online ─────────────────────────────────────────────
  async function flushSyncQueue() {
    const queue = await getSyncQueue();
    if (!queue.length) return;

    console.log(`[IDB] Flushing ${queue.length} queued action(s)`);

    for (const item of queue) {
      try {
        const res = await window._originalFetch(item.url, {
          method:  item.method,
          headers: { 'Content-Type': 'application/json', ...item.headers },
          body:    item.body,
        });
        if (res.ok || (res.status >= 400 && res.status < 500)) {
          // Remove from queue — either succeeded or server rejected it (don't retry 4xx)
          await removeSyncItem(item.id);
          console.log(`[IDB] Synced: ${item.label}`);
        }
      } catch (e) {
        console.warn(`[IDB] Sync failed for ${item.label}:`, e.message);
        // Leave in queue — will retry on next reconnect
      }
    }

    // Notify app.js that sync happened (triggers UI refresh)
    window.dispatchEvent(new CustomEvent('dikly-idb-synced'));
  }

  // ── Detect whether the server is actually reachable ─────────────────────────
  function isOffline() {
    return !navigator.onLine;
  }

  // ── Intercept fetch ─────────────────────────────────────────────────────────
  // Save original before anything else can override it
  window._originalFetch = window.fetch.bind(window);

  window.fetch = async function (resource, options = {}) {
    const url    = typeof resource === 'string' ? resource : resource.url;
    const method = (options.method || 'GET').toUpperCase();
    const isApi  = url.includes('/api/');
    const isGet  = method === 'GET';

    // ── Offline path ──────────────────────────────────────────────────────
    if (isOffline() && isApi) {

      if (isGet) {
        // Return cached API response if available
        const cached = await getCachedApiResponse(url);
        if (cached !== null) {
          return new Response(JSON.stringify(cached), {
            status:  200,
            headers: { 'Content-Type': 'application/json', 'X-IDB-Cache': '1' },
          });
        }
        // No cache — return graceful empty response
        return new Response(JSON.stringify({ offline: true, data: [], results: [], items: [] }), {
          status:  503,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Offline write (attendance mark, etc.) — queue it
      if (!isGet) {
        const label = _labelForUrl(url, method);
        await enqueueWrite(url, options, label);
        // Return a fake success so the UI doesn't show an error
        return new Response(JSON.stringify({ success: true, queued: true, offline: true }), {
          status:  200,
          headers: { 'Content-Type': 'application/json', 'X-IDB-Queued': '1' },
        });
      }
    }

    // ── Online path ───────────────────────────────────────────────────────
    const response = await window._originalFetch(resource, options);

    // Cache successful GET /api/ responses
    if (response.ok && isApi && isGet) {
      try {
        const clone = response.clone();
        clone.json().then(data => cacheApiResponse(url, data)).catch(() => {});
      } catch (_) {}
    }

    return response;
  };

  // ── Label helper (for sync queue display) ──────────────────────────────────
  function _labelForUrl(url, method) {
    if (url.includes('/attendance'))    return 'Attendance mark';
    if (url.includes('/sessions'))      return 'Session action';
    if (url.includes('/quizzes'))       return 'Quiz submission';
    if (url.includes('/assignments'))   return 'Assignment submit';
    if (url.includes('/messages'))      return 'Message send';
    if (url.includes('/notifications')) return 'Notification action';
    return `${method} ${url.split('/api/')[1] || url}`;
  }

  // ── Auto-flush on reconnect ─────────────────────────────────────────────────
  window.addEventListener('online', async () => {
    await flushSyncQueue();
  });

  // ── Expose helpers globally so app.js can use them ─────────────────────────
  window.DiklyIDB = {
    cacheApiResponse,
    getCachedApiResponse,
    enqueueWrite,
    getSyncQueue,
    removeSyncItem,
    flushSyncQueue,

    // Store full user session (called after successful login)
    async saveUserSession(userData, tokenData) {
      try { await idbPut('userSession', { key: 'session', user: userData, token: tokenData, savedAt: Date.now() }); }
      catch (e) { /* silent */ }
    },

    async getUserSession() {
      try { return await idbGet('userSession', 'session'); }
      catch (e) { return null; }
    },

    async clearAll() {
      const db = await openDB();
      await Promise.all(['apiCache', 'syncQueue', 'userSession', 'dashboardCache'].map(store =>
        new Promise((res, rej) => {
          const tx = db.transaction(store, 'readwrite');
          const req = tx.objectStore(store).clear();
          req.onsuccess = res;
          req.onerror   = e => rej(e.target.error);
        })
      ));
    },

    // Store dashboard widget data
    async saveDashboardData(key, data) {
      try { await idbPut('dashboardCache', { key, data, ts: Date.now() }); }
      catch (e) { /* silent */ }
    },

    async getDashboardData(key) {
      try {
        const rec = await idbGet('dashboardCache', key);
        if (!rec) return null;
        if (Date.now() - rec.ts > CACHE_TTL) return null;
        return rec.data;
      } catch (e) { return null; }
    },

    async queueCount() {
      const q = await getSyncQueue();
      return q.length;
    },
  };

  // ── Pre-warm the DB on load ─────────────────────────────────────────────────
  openDB().then(() => {
    console.log('[IDB] Dikly local database ready');
    // Flush any pending queue from a previous offline session
    if (navigator.onLine) flushSyncQueue();
  }).catch((e) => {
    console.warn('[IDB] Could not open local database:', e.message);
  });

})();
