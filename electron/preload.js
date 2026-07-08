// ════════════════════════════════════════════════════════════════════
//  DIKLY Desktop — preload script
//
//  contextIsolation is on and nodeIntegration is off (main.js), so the
//  remote page (https://dikly.sbs) has no direct access to Node/Electron
//  APIs. This bridges our own IPC channels (see main.js, backed by
//  @eneris/push-receiver) through contextBridge so the web app's own JS
//  (src/public/js/app.js — see window.electronPush usage in
//  _pushSubscribeIfNeeded) can register for native push and receive
//  notifications while running inside the desktop app, without the page
//  ever touching ipcRenderer/Node directly.
//
//  Deliberately no require() of any third-party package here — Electron
//  20+ sandboxes preload scripts by default, and sandboxed require() only
//  resolves a small built-in allowlist (electron, Node core), not
//  node_modules packages (learned the hard way: requiring
//  electron-push-receiver's constants module here used to throw "module
//  not found" in a packaged build). Plain string channel names sidestep
//  that entirely.
// ════════════════════════════════════════════════════════════════════
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronPush', {
  isElectron: true,

  // Registers (or reuses an existing registration) with the given Firebase
  // web config and resolves with the current FCM token. Promise-based
  // request/response over ipcRenderer.invoke — see main.js's
  // ipcMain.handle('push:register', ...).
  registerToken(firebaseConfig) {
    return ipcRenderer.invoke('push:register', firebaseConfig);
  },

  // @eneris/push-receiver delivers the raw message envelope only — there is
  // no OS-level auto-display like a browser's SW `push` event gets, so the
  // renderer is responsible for calling `new Notification(...)` itself.
  onNotificationReceived(cb) { ipcRenderer.on('push:notification', (_e, data) => cb(data)); },
});
