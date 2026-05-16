const { app, BrowserWindow, shell } = require('electron');

const DEFAULT_DEV_SERVER_URL = 'http://127.0.0.1:3000/';

let mainWindow;

const createWindow = async () => {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 900,
    minHeight: 640,
    title: 'Video OCR Extractor',
    backgroundColor: '#f8fafc',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL || DEFAULT_DEV_SERVER_URL);
};

app.setName('Video OCR Extractor');

app.whenReady().then(async () => {
  await createWindow();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
