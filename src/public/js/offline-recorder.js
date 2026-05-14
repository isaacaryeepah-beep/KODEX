/**
 * DIKLY Offline Recorder  v2.0
 *
 * Records the exam camera stream in 30-second chunks stored in IndexedDB.
 * Survives crashes: incomplete chunks are recovered on re-init.
 * Pauses automatically when storage falls below 30 MB.
 * Uploads chunks individually with deduplication via a stable uploadId.
 *
 * Uses the shared IndexedDB instance opened by OfflineMonitor.
 */
const OfflineRecorder = (() => {
  'use strict';

  const DB_NAME      = 'dikly-offline-v2';
  const DB_VERSION   = 1;
  const S_CHUNKS     = 'rec_chunks';
  const CHUNK_MS     = 30_000;          // 30-second chunks
  const MIN_CHUNK_B  = 4_096;           // discard chunks smaller than 4 KB
  const LOW_STORE_MB = 30;              // pause recording below this
  const MAX_CHUNKS   = 480;            // safety cap: 4 hours @ 30s each

  let _db            = null;
  let _recorder      = null;
  let _attemptId     = null;
  let _chunkIdx      = 0;
  let _chunkStart    = 0;
  let _paused        = false;
  let _stopped       = false;
  let _mimeType      = '';
  let _onPause       = null;  // callback when recording paused (storage low)

  // ─── Public: start ────────────────────────────────────────────────────────
  async function start(stream, { attemptId, onStoragePause } = {}) {
    if (!stream || !attemptId) throw new Error('OfflineRecorder.start: stream and attemptId required');

    _attemptId = attemptId;
    _onPause   = onStoragePause || null;
    _stopped   = false;
    _paused    = false;

    await _openDB();

    // Recover next chunk index (in case of crash recovery)
    _chunkIdx = await _nextChunkIndex();
    if (_chunkIdx > 0) {
      console.log(`[OfflineRecorder] Resuming after crash — next chunk index: ${_chunkIdx}`);
    }

    _mimeType = _bestMime();
    try {
      _recorder = new MediaRecorder(stream, {
        mimeType:          _mimeType,
        videoBitsPerSecond: 200_000,    // 200 kbps — efficient for low-end devices
        audioBitsPerSecond: 16_000,     // 16 kbps — voice-grade audio
      });
    } catch {
      _recorder = new MediaRecorder(stream); // fallback: let browser decide
      _mimeType = _recorder.mimeType;
    }

    _recorder.ondataavailable = _onData;
    _recorder.onerror         = (e) => console.error('[OfflineRecorder] MediaRecorder error:', e.error);

    _chunkStart = Date.now();
    _recorder.start(CHUNK_MS);
    console.log(`[OfflineRecorder] Started. Codec: ${_mimeType || 'default'}`);
  }

  // ─── Public: stop ─────────────────────────────────────────────────────────
  function stop() {
    _stopped = true;
    if (!_recorder || _recorder.state === 'inactive') return Promise.resolve();
    return new Promise((resolve) => {
      _recorder.onstop = resolve;
      _recorder.stop();
    });
  }

  // ─── Public: pause / resume ───────────────────────────────────────────────
  function pause() {
    if (_recorder?.state === 'recording') { _recorder.pause(); _paused = true; }
  }
  function resume() {
    if (_recorder?.state === 'paused') { _recorder.resume(); _paused = false; }
  }

  // ─── Public: getUploadQueue ───────────────────────────────────────────────
  async function getUploadQueue(attemptId) {
    const rows = await _getAll();
    return rows.filter(r => r.attemptId === (attemptId || _attemptId) && !r.synced);
  }

  // ─── Public: uploadAll ────────────────────────────────────────────────────
  async function uploadAll(attemptId, token) {
    const queue    = await getUploadQueue(attemptId);
    let uploaded   = 0;
    let failed     = 0;

    for (const chunk of queue) {
      if (!navigator.onLine) break;

      const fd = new FormData();
      fd.append('chunk',       chunk.blob,       `chunk_${chunk.chunkIndex}.webm`);
      fd.append('chunkIndex',  chunk.chunkIndex);
      fd.append('attemptId',   chunk.attemptId);
      fd.append('startMs',     chunk.startMs);
      fd.append('durationMs',  chunk.durationMs);
      fd.append('mimeType',    chunk.mimeType);
      fd.append('uploadId',    chunk.uploadId);   // server uses this for dedup

      try {
        const res = await fetch(`/api/offline-sync/${chunk.attemptId}/chunk`, {
          method:  'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body:    fd,
        });

        if (res.ok) {
          await _markSynced(chunk.id);
          uploaded++;
        } else {
          failed++;
        }
      } catch {
        failed++;
        break; // network gone — stop and retry later
      }
    }

    return { uploaded, failed, total: queue.length };
  }

  // ─── Public: deleteExpired ────────────────────────────────────────────────
  async function deleteExpired(olderThanDays = 7) {
    const cutoff = Date.now() - olderThanDays * 864e5;
    const tx     = _db.transaction(S_CHUNKS, 'readwrite');
    const store  = tx.objectStore(S_CHUNKS);
    const req    = store.openCursor();
    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (!cursor) return;
      const row = cursor.value;
      if (row.synced && row.startMs < cutoff) cursor.delete();
      cursor.continue();
    };
  }

  // ─── Private: data handler ────────────────────────────────────────────────
  async function _onData(e) {
    if (_stopped || !e.data || e.data.size < MIN_CHUNK_B) return;

    // Storage pressure check before storing
    if (navigator.storage?.estimate) {
      try {
        const { quota, usage } = await navigator.storage.estimate();
        const freeMB = (quota - usage) / 1_048_576;
        if (freeMB < LOW_STORE_MB) {
          pause();
          _onPause?.({ freeMB: Math.round(freeMB) });
          console.warn(`[OfflineRecorder] Storage low (${Math.round(freeMB)} MB). Recording paused.`);
          return;
        }
      } catch { /* ignore */ }
    }

    // Safety cap — prevent runaway growth
    const existing = await _getAll();
    if (existing.filter(r => r.attemptId === _attemptId && !r.synced).length >= MAX_CHUNKS) {
      console.warn('[OfflineRecorder] Chunk cap reached. Pausing recording.');
      pause();
      return;
    }

    const now = Date.now();
    const row = {
      attemptId:  _attemptId,
      chunkIndex: _chunkIdx++,
      blob:       e.data,
      mimeType:   _mimeType,
      startMs:    _chunkStart,
      durationMs: now - _chunkStart,
      timestamp:  now,
      synced:     false,
      uploadId:   `${_attemptId}_${_chunkIdx - 1}_${_chunkStart}`, // stable dedup key
    };

    _chunkStart = now;

    await _dbAdd(row).catch((err) => {
      console.error('[OfflineRecorder] Failed to store chunk:', err);
    });
  }

  // ─── Private: codec selection ─────────────────────────────────────────────
  function _bestMime() {
    const candidates = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=h264,opus',
      'video/webm',
      'video/mp4',
    ];
    return candidates.find(t => {
      try { return MediaRecorder.isTypeSupported(t); } catch { return false; }
    }) || '';
  }

  // ─── Private: IndexedDB ───────────────────────────────────────────────────
  function _openDB() {
    if (_db) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(S_CHUNKS)) {
          const s = db.createObjectStore(S_CHUNKS, { keyPath: 'id', autoIncrement: true });
          s.createIndex('attemptId', 'attemptId', { unique: false });
          s.createIndex('synced',    'synced',    { unique: false });
          s.createIndex('uploadId',  'uploadId',  { unique: true  });
        }
      };

      req.onsuccess = (e) => { _db = e.target.result; resolve(); };
      req.onerror   = ()  => reject(req.error);
    });
  }

  async function _nextChunkIndex() {
    const rows = await _getAll();
    const mine = rows.filter(r => r.attemptId === _attemptId);
    return mine.length === 0 ? 0 : Math.max(...mine.map(r => r.chunkIndex)) + 1;
  }

  function _dbAdd(obj) {
    return new Promise((resolve, reject) => {
      const tx  = _db.transaction(S_CHUNKS, 'readwrite');
      const req = tx.objectStore(S_CHUNKS).add(obj);
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    });
  }

  function _getAll() {
    return new Promise((resolve, reject) => {
      const tx  = _db.transaction(S_CHUNKS, 'readonly');
      const req = tx.objectStore(S_CHUNKS).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    });
  }

  function _markSynced(id) {
    return new Promise((resolve, reject) => {
      const tx    = _db.transaction(S_CHUNKS, 'readwrite');
      const store = tx.objectStore(S_CHUNKS);
      const get   = store.get(id);
      get.onsuccess = () => {
        const row = get.result;
        if (row) {
          row.synced = true;
          row.blob   = null; // free Blob memory after successful upload
          store.put(row);
        }
        tx.oncomplete = resolve;
        tx.onerror    = () => reject(tx.error);
      };
    });
  }

  // ─── Public API ───────────────────────────────────────────────────────────
  return {
    start,
    stop,
    pause,
    resume,
    getUploadQueue,
    uploadAll,
    deleteExpired,
    isPaused: () => _paused,
    isStopped: () => _stopped,
    getMimeType: () => _mimeType,
  };
})();

window.OfflineRecorder = OfflineRecorder;
