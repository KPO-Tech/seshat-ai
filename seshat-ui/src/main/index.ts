import { app, BrowserWindow, Menu, shell, ipcMain, globalShortcut, dialog, session } from 'electron'
import { join } from 'path'
import { registerSystemHandlers } from './ipc/system'
import { registerSecureStoreHandlers } from './ipc/secure-store'
import { registerBackendHandlers } from './ipc/backend'
import { resolveRuntimeRoot } from './runtime'
import { startBackendSidecar, stopBackendSidecar } from './backend-process'
import { setupAutoUpdater } from './auto-update'

function configureRuntimePaths() {
  const runtimeRoot = resolveRuntimeRoot()
  app.setPath('userData', join(runtimeRoot, 'electron', 'user-data'))
  app.setPath('sessionData', join(runtimeRoot, 'electron', 'session-data'))
  app.setPath('crashDumps', join(runtimeRoot, 'electron', 'crash-dumps'))
  app.setPath('temp', join(runtimeRoot, 'tmp', 'electron'))
  app.setAppLogsPath(join(runtimeRoot, 'electron', 'logs'))
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1100,
    minHeight: 720,
    show: false,
    autoHideMenuBar: true,
    frame: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  })

  win.removeMenu()
  win.on('ready-to-show', () => win.show())

  globalShortcut.register('F12', () => {
    win.webContents.toggleDevTools()
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

configureRuntimePaths()

app.commandLine.appendSwitch('disable-gpu-vsync')
app.commandLine.appendSwitch('use-angle', 'gl')

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null)
  registerSystemHandlers(ipcMain)
  registerSecureStoreHandlers(ipcMain)
  registerBackendHandlers(ipcMain)

  // Packaged Electron apps deny every permission request by default when no
  // handler is registered. The voice-input control needs the renderer's
  // navigator.mediaDevices.getUserMedia({ audio: true }) to actually reach
  // the OS mic prompt instead of silently failing, so allow only 'media'
  // (mic/camera) here; everything else stays denied.
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'media')
  })
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => permission === 'media')

  try {
    await startBackendSidecar()
  } catch (error) {
    dialog.showErrorBox(
      'SeshatOS backend failed to start',
      error instanceof Error ? error.message : String(error)
    )
    app.quit()
    return
  }

  createWindow()
  setupAutoUpdater()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  stopBackendSidecar()
})
