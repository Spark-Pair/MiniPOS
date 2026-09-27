const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const { createDatabase } = require('./db');

let db;
let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1050,
    minHeight: 680,
    backgroundColor: '#f5f7fb',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

function setupAutoUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowDowngrade = false;

  autoUpdater.on('error', (error) => {
    console.error('Auto update error:', error);
  });

  autoUpdater.on('update-available', (info) => {
    console.log('Update available:', info.version);
  });

  autoUpdater.on('update-downloaded', async () => {
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'info',
      buttons: ['Restart & Update', 'Later'],
      defaultId: 0,
      cancelId: 1,
      title: 'MiniPOS Update Ready',
      message: 'A new MiniPOS update has been downloaded.',
      detail: 'Restart MiniPOS now to install the update. Your local data will remain محفوظ.'
    });

    if (result.response === 0) {
      autoUpdater.quitAndInstall(false, true);
    }
  });

  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((error) => {
      console.error('Initial update check failed:', error);
    });
  }, 5000);
}

app.whenReady().then(() => {
  db = createDatabase(app.getPath('userData'));

  ipcMain.handle('db', async (_, action, params) => {
    try {
      return await db[action](params || {});
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('print', async (_, html) => {
    const w = new BrowserWindow({ show: false, width: 420, height: 700 });
    await w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    return new Promise((resolve) => {
      w.webContents.print({ silent: false, printBackground: true }, (ok) => {
        w.close();
        resolve({ ok });
      });
    });
  });

  createWindow();

  if (!app.isPackaged) {
    console.log('Auto updates are disabled in development.');
  } else {
    setupAutoUpdater();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
