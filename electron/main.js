const { app, BrowserWindow, shell, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { PushReceiver } = require('@eneris/push-receiver');
const { autoUpdater } = require('electron-updater');

// ── Native push (FCM) ────────────────────────────────────────────────
// Standard Web Push (pushManager.subscribe) always fails inside Electron —
// its bundled Chromium has no Google push-service credentials. This talks
// to FCM directly instead, via @eneris/push-receiver (an actively
// maintained client that mimics a real Android/Chrome FCM registration).
// A previous attempt used electron-push-receiver, which is abandoned
// (last published 2019) and POSTs to a Google endpoint
// (fcm.googleapis.com/fcm/connect/subscribe) that Google has since
// retired — every registration attempt 404'd. @eneris/push-receiver uses
// Firebase's current Installations + registration APIs instead.
//
// One receiver per app run, created lazily on the renderer's first
// registerToken() call (see preload.js) rather than at startup, since it
// needs the Firebase web config the renderer fetches from our own backend
// (GET /api/push/fcm-config) — keeping it server-configurable rather than
// hardcoded into the shipped binary.
const pushCredsPath = () => path.join(app.getPath('userData'), 'push-credentials.json');
const pushIdsPath = () => path.join(app.getPath('userData'), 'push-persistent-ids.json');

function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJSON(file, data) {
  try { fs.writeFileSync(file, JSON.stringify(data)); } catch (err) { console.error('[Push] failed to persist', file, err.message); }
}

let pushReceiver = null;

async function getOrCreatePushReceiver(firebaseConfig, webContents) {
  if (pushReceiver) return pushReceiver;
  pushReceiver = new PushReceiver({
    firebase: firebaseConfig,
    credentials: readJSON(pushCredsPath(), undefined),
    persistentIds: readJSON(pushIdsPath(), []),
  });
  pushReceiver.onCredentialsChanged(({ newCredentials }) => writeJSON(pushCredsPath(), newCredentials));
  pushReceiver.onNotification(({ message }) => {
    writeJSON(pushIdsPath(), pushReceiver.persistentIds);
    if (!webContents.isDestroyed()) webContents.send('push:notification', message.data || {});
  });

  // registerIfNeeded() is the fast, HTTPS-only part (Firebase Installations
  // + FCM registration) — it alone is enough to get a usable token, which
  // is all POST /api/push/subscribe needs. connect() does that AND THEN
  // opens a persistent TLS socket to mtalk.google.com:5228 for live
  // delivery while the app is open; that's a non-standard port plenty of
  // networks block outright, and @eneris/push-receiver's connect() has no
  // timeout on that step — on a blocked network it retries with backoff
  // forever and its promise never resolves *or* rejects. Awaiting it here
  // would hang this whole function (and the renderer's button) forever, so
  // registration and the live socket are decoupled: connect() still runs,
  // but in the background — a blocked port only costs live delivery while
  // the app is in the foreground, never the ability to register at all.
  await pushReceiver.registerIfNeeded();
  pushReceiver.connect().catch(err => console.error('[Push] MCS connect failed:', err.message));

  return pushReceiver;
}

ipcMain.handle('push:register', async (event, firebaseConfig) => {
  const receiver = await getOrCreatePushReceiver(firebaseConfig, event.sender);
  return receiver.fcmToken;
});

// Silent background auto-update — checks on launch and every 4h while the
// app stays open, downloads in the background, then asks once to restart
// (or installs on next quit if the user picks "Later"). Publishing is done
// by `electron-builder --publish always` in build-desktop.yml, which
// creates a versioned GitHub release (separate from the fixed
// windows-latest/mac-latest ones used for first-time manual downloads) with
// the latest.yml/latest-mac.yml metadata this relies on to detect updates.
//
// Known limitation: the app is built unsigned (CSC_IDENTITY_AUTO_DISCOVERY:
// false in CI — no Apple Developer certificate), and Squirrel.Mac requires
// a signed bundle to apply updates at all. Auto-update works on Windows;
// on macOS checkForUpdates() will just error out below and get swallowed,
// so Mac users still update via a fresh manual download for now.
function setupAutoUpdate(win) {
  if (!app.isPackaged) return; // no publish feed when running unpackaged

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-downloaded', () => {
    dialog.showMessageBox(win, {
      type: 'info',
      title: 'Update ready',
      message: 'A new version of DIKLY has been downloaded.',
      detail: 'Restart now to install it, or it will install automatically the next time you quit DIKLY.',
      buttons: ['Restart Now', 'Later'],
      defaultId: 0,
      cancelId: 1,
    }).then(({ response }) => {
      if (response === 0) autoUpdater.quitAndInstall();
    });
  });

  autoUpdater.on('error', err => {
    console.error('[AutoUpdater]', err instanceof Error ? err.stack : err);
  });

  const check = () => autoUpdater.checkForUpdates().catch(() => {});
  check();
  setInterval(check, 4 * 60 * 60 * 1000);
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'DIKLY',
    icon: path.join(__dirname, 'icon.png'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Launch maximized (fills the whole screen, no letterboxing) instead of
  // the fixed 1280x800 default — shown only once maximized to avoid a
  // visible resize flash on startup.
  win.once('ready-to-show', () => {
    win.maximize();
    win.show();
  });

  setupAutoUpdate(win);

  win.loadURL('https://dikly.sbs');

  // Open external links in default browser, keep DIKLY links in app
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith('https://dikly.sbs')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
