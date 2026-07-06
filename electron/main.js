const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

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
    },
  });

  // Launch maximized (fills the whole screen, no letterboxing) instead of
  // the fixed 1280x800 default — shown only once maximized to avoid a
  // visible resize flash on startup.
  win.once('ready-to-show', () => {
    win.maximize();
    win.show();
  });

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
