/**
 * DIKLY Offline AI Monitor  v2.0
 *
 * Works fully offline using IndexedDB + SubtleCrypto (AES-GCM).
 * Detects: tab switch, app backgrounding, time manipulation, dev tools,
 *          duplicate sessions, rapid rotation, inactivity, screenshot,
 *          force-exit, multiple faces, noise, copy/paste, dev mode.
 *
 * All events are encrypted before storage. Key is derived deterministically
 * from the attemptId via PBKDF2 (survives app restarts and crashes).
 * Syncs to server when internet returns via automatic retry queue.
 */
const OfflineMonitor = (() => {
  'use strict';

  // ─── Constants ────────────────────────────────────────────────────────────
  const DB_NAME    = 'dikly-offline-v2';
  const DB_VERSION = 1;
  const S_EVENTS   = 'events';
  const S_SESSION  = 'sessions';
  const S_SYNC_LOG = 'sync_log';

  const SEVERITY = { LOW: 'low', MEDIUM: 'medium', HIGH: 'high' };

  const EVENT_CFG = {
    heartbeat:          { sev: 'low',    score: 0  },
    face_detected:      { sev: 'low',    score: 0  },
    face_off_center:    { sev: 'low',    score: 1  },
    inactivity:         { sev: 'low',    score: 2  },
    noise_detected:     { sev: 'low',    score: 2  },
    orientation_change: { sev: 'low',    score: 1  },
    looking_away:       { sev: 'medium', score: 4  },
    face_missing:       { sev: 'medium', score: 5  },
    copy_attempt:       { sev: 'medium', score: 5  },
    rapid_rotation:     { sev: 'medium', score: 5  },
    tab_switch:         { sev: 'high',   score: 15 },
    app_backgrounded:   { sev: 'high',   score: 10 },
    multiple_faces:     { sev: 'high',   score: 15 },
    head_turn:          { sev: 'high',   score: 10 },
    phone_detected:     { sev: 'high',   score: 15 },
    camera_disabled:    { sev: 'high',   score: 15 },
    time_manipulation:  { sev: 'high',   score: 20 },
    duplicate_session:  { sev: 'high',   score: 20 },
    dev_tools_open:     { sev: 'high',   score: 15 },
    force_exit_attempt: { sev: 'high',   score: 10 },
    screenshot_attempt: { sev: 'high',   score: 15 },
    low_storage:        { sev: 'medium', score: 0  },
  };

  // ─── Module state ─────────────────────────────────────────────────────────
  let _db           = null;
  let _cryptoKey    = null;
  let _session      = null;
  let _score        = 100;
  let _perfBase     = null;
  let _intervals    = [];
  let _listeners    = [];  // [target, event, fn] for cleanup
  let _bcChannel    = null;
  let _onlineUnsub  = null;
  let _syncPending  = false;
  let _lastActivity = Date.now();
  let _rotCount     = 0;
  let _rotWindow    = 0;
  let _devToolsFlag = false;
  let _devToolsCooldown = 0;

  // ─── Public: init ─────────────────────────────────────────────────────────
  async function init({ attemptId, quizId, token, settings = {} }) {
    _session = { attemptId, quizId, token, settings, startedAt: Date.now() };
    _score   = 100;

    await _openDB();
    await _deriveKey(attemptId);

    _perfBase = { perf: performance.now(), wall: Date.now() };

    // Persist session metadata
    await _put(S_SESSION, {
      id:             attemptId,
      quizId,
      startedAt:      _session.startedAt,
      integrityScore: 100,
      deviceInfo:     _collectDeviceInfo(),
    });

    _startDetection(settings);
    _watchNetwork(token);
  }

  // ─── Public: logEvent ─────────────────────────────────────────────────────
  /**
   * Log an event both locally (encrypted IDB) and immediately online if able.
   * Pass `apiFn` = the existing logEvent/api function from snap-quiz.html so
   * online calls use the established session token.
   */
  async function logEvent(type, metadata = {}, apiFn = null) {
    if (!_session) return null;

    const cfg = EVENT_CFG[type] || { sev: 'low', score: 1 };
    _score = Math.max(0, _score - cfg.score);

    const event = {
      id:          `${_session.attemptId}_${Date.now()}_${_uid()}`,
      attemptId:   _session.attemptId,
      quizId:      _session.quizId,
      type,
      severity:    cfg.sev,
      score:       cfg.score,
      timestamp:   Date.now(),
      isoTime:     new Date().toISOString(),
      metadata,
      synced:      false,
      integrityAt: _score,
    };

    await _storeEncrypted(event);
    await _updateScore(_score);

    // Notify UI
    window.dispatchEvent(new CustomEvent('dikly:monitor-event', { detail: event }));

    // Try live API call (online path)
    if (navigator.onLine && apiFn && type !== 'heartbeat') {
      try {
        await apiFn(type, metadata);
        await _markSynced(event.id);
      } catch { /* queued for retry */ }
    }

    return event;
  }

  // ─── Public: getters ──────────────────────────────────────────────────────
  function getIntegrityScore() { return _score; }

  async function getUnsyncedEvents() {
    if (!_db || !_session) return [];
    const rows = await _getAll(S_EVENTS);
    const decrypted = [];
    for (const row of rows) {
      if (row.attemptId !== _session.attemptId || row.synced) continue;
      try { decrypted.push(await _decrypt(row.enc)); } catch { /* skip corrupted */ }
    }
    return decrypted;
  }

  async function getAllEvents(attemptId) {
    const rows = await _getAll(S_EVENTS);
    const out = [];
    for (const row of rows) {
      if (row.attemptId !== (attemptId || _session?.attemptId)) continue;
      try { out.push(await _decrypt(row.enc)); } catch { /* skip */ }
    }
    return out;
  }

  // ─── Public: sync ─────────────────────────────────────────────────────────
  async function sync(token) {
    if (!_session || _syncPending) return { ok: false };
    if (!navigator.onLine) return { ok: false, reason: 'offline' };

    _syncPending = true;
    let syncedCount = 0;

    try {
      const unsynced = await getUnsyncedEvents();
      if (!unsynced.length) { _syncPending = false; return { ok: true, synced: 0 }; }

      const body = {
        events:         unsynced,
        integrityScore: _score,
        deviceInfo:     _collectDeviceInfo(),
        attemptId:      _session.attemptId,
      };

      const res = await fetch(`/api/offline-sync/${_session.attemptId}/events`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${token || _session.token}`,
        },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        for (const e of unsynced) await _markSynced(e.id);
        syncedCount = unsynced.length;

        await _put(S_SYNC_LOG, {
          id:        `sync_${Date.now()}`,
          attemptId: _session.attemptId,
          synced:    syncedCount,
          at:        new Date().toISOString(),
          ok:        true,
        });
      }
    } catch (err) {
      console.warn('[OfflineMonitor] Sync failed:', err.message);
    }

    _syncPending = false;
    return { ok: syncedCount > 0, synced: syncedCount };
  }

  // ─── Public: stop ─────────────────────────────────────────────────────────
  async function stop() {
    _intervals.forEach(clearInterval);
    _intervals = [];
    _listeners.forEach(([t, ev, fn]) => t.removeEventListener(ev, fn));
    _listeners = [];
    if (_bcChannel) { _bcChannel.close(); _bcChannel = null; }
    if (_onlineUnsub) { window.removeEventListener('online', _onlineUnsub); _onlineUnsub = null; }
    _session = null;
  }

  // ─── Public: cleanupExpired ───────────────────────────────────────────────
  async function cleanupExpired(olderThanDays = 14) {
    if (!_db) return;
    const cutoff = Date.now() - olderThanDays * 864e5;
    const tx = _db.transaction([S_EVENTS, S_SYNC_LOG], 'readwrite');
    const evStore = tx.objectStore(S_EVENTS);
    const allReq  = evStore.getAll();
    allReq.onsuccess = () => {
      for (const row of allReq.result) {
        if (row.synced && row.timestamp < cutoff) evStore.delete(row.id);
      }
    };
  }

  // ─── Detection modules ────────────────────────────────────────────────────
  function _startDetection(settings) {
    _on(document, 'visibilitychange', _onVisibility);
    _on(window,   'blur',            _onWindowBlur);
    _on(window,   'focus',           _onWindowFocus);
    _on(window,   'beforeunload',    _onBeforeUnload);
    _on(document, 'keydown',         _onKeydown);
    _on(document, 'mousemove',       _onActivity, { passive: true });
    _on(document, 'touchstart',      _onActivity, { passive: true });
    _on(document, 'keydown',         _onActivity);
    _on(window,   'orientationchange', _onOrientation);

    // Copy / cut prevention + logging
    _on(document, 'copy',  _onCopy);
    _on(document, 'cut',   _onCopy);

    // Browser back protection
    history.pushState(null, '', location.href);
    _on(window, 'popstate', _onPopstate);

    // Periodic: time manipulation + storage + inactivity + dev tools
    _intervals.push(setInterval(_checkTime,       30_000));
    _intervals.push(setInterval(_checkStorage,     60_000));
    _intervals.push(setInterval(_checkInactivity, 120_000));
    _intervals.push(setInterval(_checkDevTools,    10_000));
    _intervals.push(setInterval(_checkDevMode,     60_000));

    // Duplicate session detection via BroadcastChannel
    _detectDuplicateSession();

    // Run storage check immediately
    _checkStorage();
    _checkDevMode();
  }

  // Visibility / app switch
  let _hiddenSince = null;
  function _onVisibility() {
    if (!_session) return;
    if (document.hidden) {
      _hiddenSince = Date.now();
      logEvent('tab_switch');
    } else if (_hiddenSince) {
      const ms = Date.now() - _hiddenSince;
      _hiddenSince = null;
      logEvent('app_backgrounded', { awayMs: ms });
    }
  }

  let _blurSince = null;
  function _onWindowBlur() {
    if (!_session || document.hidden) return; // handled by visibility
    _blurSince = Date.now();
  }
  function _onWindowFocus() {
    if (!_session || !_blurSince) return;
    const ms = Date.now() - _blurSince;
    _blurSince = null;
    if (ms > 3000) logEvent('app_backgrounded', { awayMs: ms });
  }

  // Force exit attempt
  function _onBeforeUnload() {
    if (!_session) return;
    // sendBeacon with a Blob so the server receives Content-Type: application/json.
    // A raw string defaults to text/plain and many JSON body parsers ignore it.
    try {
      const blob = new Blob(
        [JSON.stringify({ type: 'force_exit_attempt', ts: Date.now(), attemptId: _session.attemptId })],
        { type: 'application/json' }
      );
      navigator.sendBeacon?.(`/api/offline-sync/${_session.attemptId}/beacon`, blob);
    } catch { /* ignore — page is unloading */ }
  }

  // Screenshot / PrintScreen
  function _onKeydown(e) {
    if (!_session) return;
    if (e.key === 'PrintScreen' || (e.ctrlKey && e.shiftKey && (e.key === 'S' || e.key === 's'))) {
      logEvent('screenshot_attempt');
    }
  }

  // Activity tracking
  function _onActivity() { _lastActivity = Date.now(); }

  // Rotation abuse (3+ rotations in 10s)
  function _onOrientation() {
    if (!_session) return;
    const now = Date.now();
    if (now - _rotWindow < 10_000) {
      _rotCount++;
      if (_rotCount >= 3) {
        logEvent('rapid_rotation', { count: _rotCount });
        _rotCount = 0;
        _rotWindow = now;
      }
    } else {
      _rotCount  = 1;
      _rotWindow = now;
    }
    logEvent('orientation_change');
  }

  // Copy / cut
  function _onCopy(e) {
    if (!_session) return;
    e.preventDefault();
    logEvent('copy_attempt', { text: window.getSelection()?.toString()?.slice(0, 100) });
  }

  // Back navigation
  function _onPopstate() {
    if (!_session) return;
    history.pushState(null, '', location.href);
    window.dispatchEvent(new CustomEvent('dikly:back-blocked'));
  }

  // ─── Periodic checks ──────────────────────────────────────────────────────
  async function _checkTime() {
    if (!_session || !_perfBase) return;
    const expected = _perfBase.wall + (performance.now() - _perfBase.perf);
    const drift    = Math.abs(Date.now() - expected);
    if (drift > 10_000) {
      await logEvent('time_manipulation', {
        driftSec: Math.round(drift / 1000),
        expected: Math.round(expected),
        actual:   Date.now(),
      });
      _perfBase = { perf: performance.now(), wall: Date.now() }; // reset
    }
  }

  async function _checkStorage() {
    if (!navigator.storage?.estimate) return;
    try {
      const { quota, usage } = await navigator.storage.estimate();
      const freeMB = (quota - usage) / 1_048_576;
      if (freeMB < 20) {
        window.dispatchEvent(new CustomEvent('dikly:storage-critical', { detail: { freeMB: Math.round(freeMB) } }));
        await logEvent('low_storage', { freeMB: Math.round(freeMB), severity: 'critical' });
      } else if (freeMB < 100) {
        window.dispatchEvent(new CustomEvent('dikly:storage-low', { detail: { freeMB: Math.round(freeMB) } }));
      }
    } catch { /* ignore */ }
  }

  async function _checkInactivity() {
    if (!_session) return;
    const idleMs = Date.now() - _lastActivity;
    if (idleMs > 120_000) {
      await logEvent('inactivity', { idleSec: Math.round(idleMs / 1000) });
    }
  }

  async function _checkDevTools() {
    if (!_session) return;
    const now = Date.now();
    if (now < _devToolsCooldown) return;

    // Method 1: outer vs inner window size (dev tools undocked shows as smaller)
    const wDiff = window.outerWidth  - window.innerWidth;
    const hDiff = window.outerHeight - window.innerHeight;
    const open  = wDiff > 160 || hDiff > 160;

    if (open && !_devToolsFlag) {
      _devToolsFlag    = true;
      _devToolsCooldown = now + 30_000; // suppress for 30s
      await logEvent('dev_tools_open', { method: 'window_size', wDiff, hDiff });
    } else if (!open) {
      _devToolsFlag = false;
    }

    // Method 2: navigator.webdriver (automation/Selenium)
    if (navigator.webdriver) {
      await logEvent('dev_tools_open', { method: 'webdriver' });
    }
  }

  async function _checkDevMode() {
    if (!_session) return;
    // UA contains "AndroidDebug", ADB, or developer keywords
    const ua = navigator.userAgent || '';
    const isDebugBuild = /AndroidDebug|Dev Build|Expo|__flipper__/i.test(ua);
    if (isDebugBuild) {
      await logEvent('dev_tools_open', { method: 'ua_debug', ua: ua.slice(0, 100) });
    }
    // Platform-specific: check if Capacitor Android has debugEnabled
    if (window.Capacitor?.getPlatform?.() === 'android') {
      // In Capacitor android, webContentsDebuggingEnabled=false is set in config,
      // but we can check if the app was sideloaded via non-store install
      const info = await window.Capacitor?.Plugins?.Device?.getInfo?.().catch?.(() => null);
      if (info?.isVirtual) {
        await logEvent('dev_tools_open', { method: 'emulator', info });
      }
    }
  }

  // ─── Duplicate session detection ──────────────────────────────────────────
  function _detectDuplicateSession() {
    if (!window.BroadcastChannel) return;
    const myId = _uid();
    try {
      _bcChannel = new BroadcastChannel(`dikly-exam-${_session.attemptId}`);
      _bcChannel.onmessage = async (e) => {
        if (e.data?.id === myId) return;
        if (e.data?.type === 'ping') {
          _bcChannel.postMessage({ type: 'pong', id: myId });
          await logEvent('duplicate_session', { remoteId: e.data.id });
        }
        if (e.data?.type === 'pong') {
          await logEvent('duplicate_session', { remoteId: e.data.id });
        }
      };
      _bcChannel.postMessage({ type: 'ping', id: myId });
    } catch { /* BroadcastChannel unavailable */ }
  }

  // ─── Network watcher ──────────────────────────────────────────────────────
  function _watchNetwork(token) {
    _onlineUnsub = () => {
      console.log('[OfflineMonitor] Network restored. Syncing...');
      sync(token);
    };
    window.addEventListener('online', _onlineUnsub);
  }

  // ─── IndexedDB helpers ────────────────────────────────────────────────────
  function _openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (e) => {
        const db = e.target.result;

        if (!db.objectStoreNames.contains(S_EVENTS)) {
          const ev = db.createObjectStore(S_EVENTS, { keyPath: 'id' });
          ev.createIndex('attemptId', 'attemptId', { unique: false });
          ev.createIndex('synced',    'synced',    { unique: false });
          ev.createIndex('timestamp', 'timestamp', { unique: false });
        }
        if (!db.objectStoreNames.contains(S_SESSION)) {
          db.createObjectStore(S_SESSION, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(S_SYNC_LOG)) {
          const sl = db.createObjectStore(S_SYNC_LOG, { keyPath: 'id' });
          sl.createIndex('attemptId', 'attemptId', { unique: false });
        }
      };

      req.onsuccess = (e) => { _db = e.target.result; resolve(); };
      req.onerror   = ()  => reject(req.error);
    });
  }

  // ─── Encryption ───────────────────────────────────────────────────────────
  async function _deriveKey(attemptId) {
    const material = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(`dikly-offline-key-${attemptId}-2025`),
      'PBKDF2', false, ['deriveKey']
    );
    _cryptoKey = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: new TextEncoder().encode('dikly-v2-salt'), iterations: 100_000, hash: 'SHA-256' },
      material,
      { name: 'AES-GCM', length: 256 },
      false, ['encrypt', 'decrypt']
    );
  }

  async function _encrypt(obj) {
    const iv         = crypto.getRandomValues(new Uint8Array(12));
    const encoded    = new TextEncoder().encode(JSON.stringify(obj));
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, _cryptoKey, encoded);
    return { iv: Array.from(iv), ct: Array.from(new Uint8Array(ciphertext)) };
  }

  async function _decrypt(enc) {
    const iv         = new Uint8Array(enc.iv);
    const ct         = new Uint8Array(enc.ct);
    const plaintext  = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, _cryptoKey, ct);
    return JSON.parse(new TextDecoder().decode(plaintext));
  }

  async function _storeEncrypted(event) {
    if (!_db) return;
    const enc = await _encrypt(event);
    await _put(S_EVENTS, {
      id:        event.id,
      attemptId: event.attemptId,
      timestamp: event.timestamp,
      synced:    false,
      enc,
    });
  }

  async function _markSynced(id) {
    if (!_db) return;
    return new Promise((resolve, reject) => {
      const tx    = _db.transaction(S_EVENTS, 'readwrite');
      const store = tx.objectStore(S_EVENTS);
      const get   = store.get(id);
      get.onsuccess = () => {
        if (get.result) { get.result.synced = true; store.put(get.result); }
        tx.oncomplete = resolve;
        tx.onerror    = () => reject(tx.error);
      };
    });
  }

  async function _updateScore(score) {
    if (!_db || !_session) return;
    return new Promise((resolve, reject) => {
      const tx    = _db.transaction(S_SESSION, 'readwrite');
      const store = tx.objectStore(S_SESSION);
      const get   = store.get(_session.attemptId);
      get.onsuccess = () => {
        const sess = get.result || { id: _session.attemptId };
        sess.integrityScore = score;
        store.put(sess);
        tx.oncomplete = resolve;
        tx.onerror    = () => reject(tx.error);
      };
    });
  }

  function _put(storeName, obj) {
    return new Promise((resolve, reject) => {
      const tx  = _db.transaction(storeName, 'readwrite');
      const req = tx.objectStore(storeName).put(obj);
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    });
  }

  function _getAll(storeName) {
    return new Promise((resolve, reject) => {
      const tx  = _db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    });
  }

  // ─── Utilities ───────────────────────────────────────────────────────────
  function _on(target, event, fn, opts) {
    target.addEventListener(event, fn, opts);
    _listeners.push([target, event, fn]);
  }

  function _uid() {
    return Math.random().toString(36).slice(2, 10);
  }

  function _collectDeviceInfo() {
    return {
      ua:          navigator.userAgent,
      platform:    navigator.platform,
      language:    navigator.language,
      cores:       navigator.hardwareConcurrency,
      memory:      navigator.deviceMemory,
      connection:  navigator.connection?.effectiveType,
      screen:      `${screen.width}x${screen.height}`,
      colorDepth:  screen.colorDepth,
      timezone:    Intl.DateTimeFormat().resolvedOptions().timeZone,
      online:      navigator.onLine,
      capacitor:   !!window.Capacitor,
      platform_cap: window.Capacitor?.getPlatform?.() || 'web',
    };
  }

  // ─── Public API ───────────────────────────────────────────────────────────
  return {
    init,
    logEvent,
    getIntegrityScore,
    getUnsyncedEvents,
    getAllEvents,
    sync,
    stop,
    cleanupExpired,
    collectDeviceInfo: _collectDeviceInfo,
  };
})();

window.OfflineMonitor = OfflineMonitor;
