import { app, BrowserWindow, Menu, shell, ipcMain } from 'electron'
import { join } from 'path'
import { registerSystemHandlers } from './ipc/system'
import { registerSecureStoreHandlers } from './ipc/secure-store'
import { registerBackendHandlers } from './ipc/backend'
import { resolveRuntimeRoot } from './runtime'

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

app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
  registerSystemHandlers(ipcMain)
  registerSecureStoreHandlers(ipcMain)
  registerBackendHandlers(ipcMain)
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
