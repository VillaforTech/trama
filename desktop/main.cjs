const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  session,
  shell,
  utilityProcess,
} = require('electron');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { mkdirSync } = require('node:fs');

app.setName('Trama');
if (process.env.TRAMA_USER_DATA_DIR) {
  app.setPath('userData', path.resolve(process.env.TRAMA_USER_DATA_DIR));
}
let mainWindow = null;
let engine = null;
let origin = '';
let quitting = false;
const accessKey = randomBytes(32).toString('hex');
const applicationRoot = app.isPackaged ? app.getAppPath() : path.resolve(__dirname, '..');
const externalHosts = new Set([
  'github.com',
  'docs.github.com',
  'ollama.com',
  'docs.ollama.com',
  'www.electronjs.org',
]);

function isAppUrl(value) {
  try {
    return new URL(value).origin === origin && !!origin;
  } catch {
    return false;
  }
}
function externalUrl(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' && !url.username && !url.password && externalHosts.has(url.hostname)
    );
  } catch {
    return false;
  }
}
function validSender(event) {
  return (
    !!mainWindow &&
    event.sender === mainWindow.webContents &&
    event.senderFrame === mainWindow.webContents.mainFrame &&
    isAppUrl(event.senderFrame.url)
  );
}
async function selectFolder() {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Abrir un repositorio',
    buttonLabel: 'Abrir repositorio',
    properties: ['openDirectory'],
    message: 'Selecciona la carpeta raíz del proyecto que quieres comprender.',
  });
  return result.canceled ? null : result.filePaths[0] || null;
}
function navigate(view) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('trama:navigate', view);
}
function installMenu() {
  const template = [
    {
      label: 'Trama',
      submenu: [
        { role: 'about', label: 'Acerca de Trama' },
        { type: 'separator' },
        { label: 'Ajustes…', accelerator: 'CmdOrCtrl+,', click: () => navigate('settings') },
        { type: 'separator' },
        { role: 'services', label: 'Servicios' },
        { type: 'separator' },
        { role: 'hide', label: 'Ocultar Trama' },
        { role: 'hideOthers', label: 'Ocultar otras' },
        { role: 'unhide', label: 'Mostrar todo' },
        { type: 'separator' },
        { role: 'quit', label: 'Salir de Trama' },
      ],
    },
    {
      label: 'Archivo',
      submenu: [
        {
          label: 'Abrir repositorio…',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const folder = await selectFolder();
            if (folder && mainWindow) mainWindow.webContents.send('trama:open-folder', folder);
          },
        },
        { label: 'Biblioteca', accelerator: 'CmdOrCtrl+L', click: () => navigate('library') },
        { type: 'separator' },
        { role: 'close', label: 'Cerrar ventana' },
      ],
    },
    {
      label: 'Edición',
      submenu: [
        { role: 'undo', label: 'Deshacer' },
        { role: 'redo', label: 'Rehacer' },
        { type: 'separator' },
        { role: 'cut', label: 'Cortar' },
        { role: 'copy', label: 'Copiar' },
        { role: 'paste', label: 'Pegar' },
        { role: 'selectAll', label: 'Seleccionar todo' },
        { type: 'separator' },
        {
          label: 'Buscar en el proyecto',
          accelerator: 'CmdOrCtrl+K',
          click: () => navigate('search'),
        },
      ],
    },
    {
      label: 'Visualización',
      submenu: [
        { role: 'resetZoom', label: 'Tamaño original' },
        { role: 'zoomIn', label: 'Ampliar' },
        { role: 'zoomOut', label: 'Reducir' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Pantalla completa' },
      ],
    },
    { role: 'windowMenu', label: 'Ventana' },
    {
      role: 'help',
      label: 'Ayuda',
      submenu: [
        {
          label: 'Documentación de Trama',
          click: () => shell.openExternal('https://github.com/VillaforTech/trama#readme'),
        },
        {
          label: 'Reportar un problema',
          click: () =>
            shell.openExternal('https://github.com/VillaforTech/trama/issues/new/choose'),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
function startEngine() {
  return new Promise((resolve, reject) => {
    const appRoot = applicationRoot;
    const dataDir = path.join(app.getPath('userData'), 'data');
    mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    engine = utilityProcess.fork(path.join(appRoot, 'dist-server', 'index.js'), [], {
      cwd: app.getPath('userData'),
      env: {
        ...process.env,
        PORT: '0',
        TRAMA_DESKTOP: '1',
        TRAMA_DESKTOP_KEY: accessKey,
        TRAMA_APP_ROOT: appRoot,
        TRAMA_DATA_DIR: dataDir,
      },
      stdio: 'pipe',
      serviceName: 'Trama — Índice y aprendizaje',
    });
    const timeout = setTimeout(() => {
      engine?.kill();
      reject(new Error('El motor local tardó demasiado en iniciar.'));
    }, 30000);
    let ready = false;
    engine.once('message', (message) => {
      if (
        message?.type !== 'ready' ||
        !Number.isInteger(message.port) ||
        message.port < 1024 ||
        message.port > 65535
      )
        return;
      ready = true;
      clearTimeout(timeout);
      origin = 'http://127.0.0.1:' + message.port;
      resolve(origin);
    });
    engine.on('exit', () => {
      clearTimeout(timeout);
      engine = null;
      if (!ready) reject(new Error('No se pudo iniciar el motor local de Trama.'));
      else if (!quitting) {
        dialog.showErrorBox(
          'Trama necesita reiniciarse',
          'El motor local se detuvo. Cierra y vuelve a abrir Trama para continuar desde tu última revisión guardada.',
        );
        app.quit();
      }
    });
    // Child output can contain filesystem paths. Keep it out of normal UI and release logs.
    engine.stdout?.resume();
    engine.stderr?.resume();
  });
}
async function openWindow() {
  mainWindow = new BrowserWindow({
    width: 1380,
    height: 900,
    minWidth: 860,
    minHeight: 650,
    title: 'Trama',
    backgroundColor: '#f5f5ee',
    show: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 20, y: 20 },
    webPreferences: {
      preload: path.join(applicationRoot, 'desktop', 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
    },
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (externalUrl(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url)) {
      event.preventDefault();
      if (externalUrl(url)) void shell.openExternal(url);
    }
  });
  mainWindow.webContents.on('will-attach-webview', (event) => event.preventDefault());
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  await mainWindow.loadURL(origin);
}
function configureSession() {
  const current = session.defaultSession;
  current.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  current.setPermissionCheckHandler(() => false);
  current.on('will-download', (_event, item, webContents) => {
    if (!mainWindow || webContents !== mainWindow.webContents) {
      item.cancel();
      return;
    }
    item.setSaveDialogOptions({
      title: 'Guardar una copia del cuaderno',
      defaultPath: path.join(app.getPath('documents'), path.basename(item.getFilename())),
    });
  });
  current.webRequest.onBeforeSendHeaders((details, callback) => {
    const headers = { ...details.requestHeaders };
    if (
      isAppUrl(details.url) &&
      mainWindow &&
      details.webContentsId === mainWindow.webContents.id
    ) {
      headers['X-Trama-Desktop-Key'] = accessKey;
    }
    callback({ requestHeaders: headers });
  });
  current.webRequest.onHeadersReceived((details, callback) => {
    const headers = { ...details.responseHeaders };
    if (isAppUrl(details.url)) {
      headers['Content-Security-Policy'] = [
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-src 'none'; frame-ancestors 'none'; form-action 'self'",
      ];
    }
    callback({ responseHeaders: headers });
  });
}
ipcMain.handle('trama:select-folder', async (event) => {
  if (!validSender(event)) throw new Error('La solicitud no procede de Trama.');
  return selectFolder();
});
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    } else if (origin) void openWindow();
  });
  app
    .whenReady()
    .then(async () => {
      app.setAboutPanelOptions({
        applicationName: 'Trama',
        applicationVersion: app.getVersion(),
        copyright: 'Copyright © 2026 Roberto Villafuerte',
        website: 'https://github.com/VillaforTech/trama',
        credits: 'Un espacio local para aprender cómo funciona tu código.',
      });
      configureSession();
      installMenu();
      await startEngine();
      await openWindow();
    })
    .catch((error) => {
      dialog.showErrorBox(
        'No se pudo abrir Trama',
        error.message || 'Vuelve a abrir la aplicación.',
      );
      app.quit();
    });
  app.on('activate', () => {
    if (!mainWindow && origin) void openWindow();
  });
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
app.on('before-quit', () => {
  quitting = true;
  engine?.kill();
  engine = null;
});
