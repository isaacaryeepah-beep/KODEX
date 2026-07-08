// ════════════════════════════════════════════════════════════════════
//  DIKLY Desktop — preload script
//
//  contextIsolation is on and nodeIntegration is off (main.js), so the
//  remote page (https://dikly.sbs) has no direct access to Node/Electron
//  APIs. This bridges just enough of electron-push-receiver's IPC channels
//  (see main.js) through contextBridge so the web app's own JS
//  (src/public/js/app.js — see window.electronPush usage in
//  _pushSubscribeIfNeeded) can register for native push and receive
//  notifications while running inside the desktop app, without the page
//  ever touching ipcRenderer/Node directly.
// ════════════════════════════════════════════════════════════════════
const { contextBridge, ipcRenderer } = require('electron');
// Electron 20+ runs preload scripts in a sandboxed context by default —
// require() there only resolves a small built-in allowlist (electron, Node
// core modules), NOT arbitrary npm packages from node_modules. Requiring
// electron-push-receiver/src/constants here throws "module not found" at
// runtime in a packaged build (works fine in main.js, which is never
// sandboxed). These 5 strings are electron-push-receiver's whole constants
// module (see its src/constants/index.js) — inlined to avoid that require.
const START_NOTIFICATION_SERVICE = 'PUSH_RECEIVER:::START_NOTIFICATION_SERVICE';
const NOTIFICATION_SERVICE_STARTED = 'PUSH_RECEIVER:::NOTIFICATION_SERVICE_STARTED';
const NOTIFICATION_SERVICE_ERROR = 'PUSH_RECEIVER:::NOTIFICATION_SERVICE_ERROR';
const NOTIFICATION_RECEIVED = 'PUSH_RECEIVER:::NOTIFICATION_RECEIVED';
const TOKEN_UPDATED = 'PUSH_RECEIVER:::TOKEN_UPDATED';

contextBridge.exposeInMainWorld('electronPush', {
  isElectron: true,

  // Kicks off (or resumes) electron-push-receiver's FCM registration and
  // resolves with the current token. One-shot request/response over IPC —
  // each call adds its own `once` listeners so callers never have to manage
  // listener lifecycles themselves.
  registerToken(senderId) {
    return new Promise((resolve, reject) => {
      ipcRenderer.once(NOTIFICATION_SERVICE_STARTED, (_e, token) => resolve(token));
      ipcRenderer.once(NOTIFICATION_SERVICE_ERROR, (_e, message) => reject(new Error(message)));
      ipcRenderer.send(START_NOTIFICATION_SERVICE, senderId);
    });
  },

  // Fires only when the token changes (rotation) after the app is already
  // registered — lets the caller re-save the subscription server-side
  // without the user having to do anything.
  onTokenUpdated(cb) { ipcRenderer.on(TOKEN_UPDATED, (_e, token) => cb(token)); },

  // electron-push-receiver delivers the raw data payload only — there is no
  // OS-level auto-display like a browser's SW `push` event gets, so the
  // renderer is responsible for calling `new Notification(...)` itself.
  onNotificationReceived(cb) { ipcRenderer.on(NOTIFICATION_RECEIVED, (_e, notification) => cb(notification)); },
});
