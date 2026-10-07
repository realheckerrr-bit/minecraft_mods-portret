const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');

let windowRef;
let corePromise;

function loadCore() {
  if (!corePromise) {
    corePromise = Promise.all([
      import('../src/inspect.js'),
      import('../src/port.js'),
      import('../src/versions.js'),
    ]).then(([inspect, port, versions]) => ({ ...inspect, ...port, ...versions }));
  }
  return corePromise;
}

function registerIpc() {
  ipcMain.handle('browse-input', async () => {
    const result = await dialog.showOpenDialog(windowRef, {
      title: 'Choose a Minecraft mod JAR or source project',
      properties: ['openFile', 'openDirectory'],
      filters: [{ name: 'Minecraft mods', extensions: ['jar', 'zip'] }, { name: 'All files', extensions: ['*'] }],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('browse-output', async () => {
    const result = await dialog.showOpenDialog(windowRef, {
      title: 'Choose the port output directory',
      properties: ['openDirectory', 'createDirectory'],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('versions', async (_event, options = {}) => {
    const core = await loadCore();
    return core.getMinecraftVersions(options);
  });

  ipcMain.handle('analyze', async (_event, inputPath) => {
    const core = await loadCore();
    return core.inspectInput(inputPath);
  });

  ipcMain.handle('port', async (_event, request) => {
    const core = await loadCore();
    const result = await core.portMod(request);
    let report = '';
    try { report = await fs.readFile(path.join(result.output, 'PORTING_REPORT.md'), 'utf8'); } catch { /* The result is still useful without the report preview. */ }
    return { ...result, report };
  });

  ipcMain.handle('verify', async (_event, request) => {
    const core = await loadCore();
    return core.verifyPort(request.outputPath, request.expectedLoader);
  });

  ipcMain.handle('open-path', async (_event, targetPath) => shell.openPath(targetPath));
}

function createWindow() {
  windowRef = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 900,
    minHeight: 650,
    backgroundColor: '#08111f',
    title: 'Minecraft Mod-Porter',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  windowRef.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  app.setAppUserModelId('com.realheckerrr.minecraftmodsportret');
  registerIpc();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
